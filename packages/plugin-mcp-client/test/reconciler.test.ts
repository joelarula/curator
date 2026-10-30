import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { curatorEngine } from '@curator/agent-server';
import { createCuratorHost } from '@curator/host';
import { McpReconciler, McpRemoteRegistry, createAuthPlugin, createHostAuthManager, createMcpClientPlugin } from '../dist/index.js';
import { startMockMcpServer } from './helpers/mockMcpServer.ts';

const PROJECT = 'proj-r';

let host: any;
let registry: McpRemoteRegistry;
let reconciler: McpReconciler;
let dir: string;
let token: string | null = null;
const statuses: any[] = [];
const servers: Awaited<ReturnType<typeof startMockMcpServer>>[] = [];

// Stands in for AuthSessionManager: a device login that shows a code and finishes when the test says so.
let finishLogin: (() => void) | null = null;
const auth = {
  idpNames: () => ['test-idp'],
  serviceNames: () => ['secure', 'secure2'],
  list: async () => [],
  logout: async () => {},
  whoami: async () => null,
  login: async (target: string, prompt: any) => {
    prompt.showVerification({ idp: target, issuer: 'https://idp.test', verificationUri: 'https://idp.test/device', userCode: 'ABC-123', expiresIn: 600 });
    await new Promise<void>((resolve) => (finishLogin = resolve));
    token = 'good-token';
    return { issuer: 'https://idp.test', sub: 'user-1', email: 'u@test' };
  },
  provider: (name: string) => ({
    name,
    getAccessToken: async () => token,
    handleUnauthorized: async () => false,
    login: async () => ({ issuer: 'x', sub: 'x' }),
    invalidate: async () => {},
    logout: async () => {},
    whoami: async () => null,
  }),
};

/** Resolves with the next `mcp:status` event for `server` matching `status`. */
function nextStatus(server: string, status: string, timeoutMs = 10_000): Promise<any> {
  const seen = statuses.length;
  return waitFor(() => statuses.slice(seen).find((e) => e.server === server && e.status === status), timeoutMs, () =>
    `no ${status} for ${server}; saw ${JSON.stringify(statuses.slice(seen))}`
  );
}

function waitFor<T>(check: () => T | Promise<T>, timeoutMs: number, describe: () => string): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = async () => {
      const hit = await check();
      if (hit) return resolve(hit);
      if (Date.now() > deadline) return reject(new Error(describe()));
      setTimeout(poll, 25);
    };
    poll();
  });
}

const freePort = async () => {
  const probe = await startMockMcpServer({ label: 'probe', tools: {} });
  await probe.close();
  return { port: Number(new URL(probe.url).port), url: probe.url };
};

const pingTools = { ping: { annotations: { readOnlyHint: true }, handler: () => 'pong' } };

before(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'curator-mcp-reconciler-'));
  const { plugin, registry: reg } = createMcpClientPlugin({ auth, retry: { minSeconds: 1, maxSeconds: 1 } });
  registry = reg;
  const signIn = createAuthPlugin(auth as any);
  host = await createCuratorHost({
    name: 'mcp-reconciler-test',
    projectId: PROJECT,
    logLevel: 'silent',
    curatorDb: { path: path.join(dir, 'curator.db') },
    registerPlugins: () => {
      curatorEngine.registerPlugin(plugin);
      curatorEngine.registerPlugin(signIn.plugin);
      return curatorEngine;
    },
  } as any);
  await host.seed();
  // Remote tool calls in the test need more than the connector role the flows run with.
  await host.prisma.role.upsert({ where: { id: 'curator_admin' }, update: {}, create: { id: 'curator_admin', name: 'curator_admin' } });
  await host.assignUserProjectRole('system', 'curator_admin', PROJECT);
  await registry.attach(host);
  signIn.attach(host);
  host.events.onEvent((e: any) => e.type === 'mcp:status' && statuses.push(e.payload));
  reconciler = new McpReconciler(registry, host);
  await host.start(50);
});

after(async () => {
  reconciler?.stop();
  await registry?.close();
  await host?.stop();
  await Promise.all(servers.map((s) => s.close()));
  rmSync(dir, { recursive: true, force: true });
});

test('a server that is down is retried by its connector flow and connects once it is up', async () => {
  const { port, url } = await freePort();
  await registry.register({ projectId: PROJECT, name: 'late', url, sync: false });

  const failing = nextStatus('late', 'error');
  const flow = await reconciler.watch('late');
  assert.equal(flow.started, true);
  const failure = await failing;
  assert.match(failure.error, /ECONNREFUSED/);
  assert.equal(failure.retryInSeconds, 1);
  // Watching again finds the running flow instead of starting a second one.
  assert.deepEqual(await reconciler.watch('late'), { requestId: flow.requestId, started: false });

  const connected = nextStatus('late', 'connected');
  servers.push(await startMockMcpServer({ label: 'L', port, tools: pingTools }));
  assert.equal((await connected).tools, 1);
  assert.equal((await host.runTool('mcp.late.ping', {})).result, 'pong');

  // The flow is a Request, parked while connected.
  const root = await host.prisma.request.findUnique({ where: { id: flow.requestId } });
  assert.notEqual(root.status, 'COMPLETED');
});

test('a connection lost during a remote tool call is picked up by the flow', async () => {
  const late = servers.pop()!;
  const port = Number(new URL(late.url).port);
  await late.close();

  const failing = nextStatus('late', 'error');
  await assert.rejects(host.runTool('mcp.late.ping', {}));
  await failing;

  const connected = nextStatus('late', 'connected');
  servers.push(await startMockMcpServer({ label: 'L2', port, tools: pingTools }));
  await connected;
  assert.equal((await host.runTool('mcp.late.ping', {})).result, 'pong');
});

test('auth_required servers wait for the auth:login event', async () => {
  const secure = await startMockMcpServer({
    label: 'S',
    token: 'good-token',
    tools: { whoami: { annotations: { readOnlyHint: true }, handler: () => 'secure-ok' } },
  });
  servers.push(secure);
  await registry.register({ projectId: PROJECT, name: 'secure', url: secure.url, authService: 'secure', sync: false });

  const waiting = nextStatus('secure', 'auth_required');
  await reconciler.watch('secure');
  assert.equal((await waiting).retryInSeconds, undefined);

  token = 'good-token';
  const connected = nextStatus('secure', 'connected');
  await host.emitEvent('auth:login', { idp: 'test' });
  await connected;
  assert.equal((await host.runTool('mcp.secure.whoami', {})).result, 'secure-ok');
});

test('the flow ends when its server is unregistered', async () => {
  const { requestId } = await reconciler.watch('late');
  await registry.unregister(PROJECT, 'late');
  const gone = nextStatus('late', 'gone');
  await reconciler.retry('late');
  await gone;
  await waitFor(
    async () => (await host.prisma.request.findUnique({ where: { id: requestId } })).status === 'COMPLETED',
    10_000,
    () => `flow ${requestId} did not complete`
  );
});

test('signing in runs as an auth_login flow and resumes the connector', async () => {
  token = null;
  const secure = await startMockMcpServer({
    label: 'S2',
    token: 'good-token',
    tools: { whoami: { annotations: { readOnlyHint: true }, handler: () => 'secure2-ok' } },
  });
  servers.push(secure);
  await registry.register({ projectId: PROJECT, name: 'secure2', url: secure.url, authService: 'secure2', sync: false });
  const waiting = nextStatus('secure2', 'auth_required');
  await reconciler.watch('secure2');
  await waiting;

  // The shell's view: prompts come from the flow's events.
  const manager = createHostAuthManager(auth as any, host);
  const shown: any[] = [];
  const connected = nextStatus('secure2', 'connected');
  const login = manager.login('test-idp', { showVerification: (info: any) => shown.push(info) });
  await waitFor(() => shown.length > 0, 10_000, () => 'no verification shown');
  assert.equal(shown[0].userCode, 'ABC-123');

  finishLogin!();
  const identity = await login;
  assert.equal(identity.sub, 'user-1');
  await connected;
  assert.equal((await host.runTool('mcp.secure2.whoami', {})).result, 'secure2-ok');

  // The attempt is a recorded flow that ended with the outcome event.
  const script = await host.prisma.script.findUnique({ where: { name: 'auth_login' } });
  const flows = await host.prisma.request.findMany({ where: { scriptId: script.id, ast: { not: null } }, orderBy: { id: 'asc' } });
  const root = flows.find((r: any) => (typeof r.ast === 'string' ? JSON.parse(r.ast) : r.ast)?.type === 'Curator_Sequential');
  await waitFor(
    async () => (await host.prisma.request.findUnique({ where: { id: root.id } })).status === 'COMPLETED',
    10_000,
    () => `login flow ${root.id} did not complete`
  );
});
