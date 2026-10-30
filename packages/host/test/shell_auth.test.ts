import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';
import { ChannelAuthError, ShellAuthController, createClientShell, createWebSocketChannel } from '../dist/index.js';
import { AuthSessionManager, MemoryTokenStore } from '../../auth-client/dist/index.js';
import { startMockIdp } from '../../auth-client/test/helpers/mockIdp.ts';

async function waitFor(predicate: () => boolean, timeoutMs = 3000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

async function setupAuth() {
  const corp = await startMockIdp({ clientId: 'cli-corp' });
  const partner = await startMockIdp({ clientId: 'cli-partner' });
  const manager = new AuthSessionManager({
    store: new MemoryTokenStore(),
    deviceFlow: { pollIntervalMs: 10 },
    config: {
      idps: {
        corp: { issuer: corp.issuer, clientId: 'cli-corp', audienceParam: 'none' },
        partner: { issuer: partner.issuer, clientId: 'cli-partner', audienceParam: 'none' },
      },
      services: { crm: { url: `${corp.url}/crm`, idp: 'corp' } },
    },
  });
  const lines: string[] = [];
  // Plays the user: completes the browser step for whatever code is printed.
  const log = (line: string) => {
    lines.push(line);
    const code = line.match(/Code:\s+\S*?(UC-\d+)/)?.[1];
    if (code) {
      corp.approve(code, 'alice');
      partner.approve(code, 'bob');
    }
  };
  return { corp, partner, manager, lines, log, close: () => Promise.all([corp.close(), partner.close()]) };
}

test('ShellAuthController runs concurrent background logins to two IdPs and lists them', async () => {
  const env = await setupAuth();
  try {
    const controller = new ShellAuthController(env.manager, { log: env.log });
    await controller.command('login', 'corp');
    await controller.command('login', 'partner');
    assert.deepEqual(controller.pendingLogins().sort(), ['corp', 'partner']);
    await waitFor(() => controller.pendingLogins().length === 0);

    assert.ok(env.lines.some((l) => l.includes('Signed in to corp as alice@example.test')));
    assert.ok(env.lines.some((l) => l.includes('Signed in to partner as bob@example.test')));

    env.lines.length = 0;
    await controller.command('list');
    const out = env.lines.join('\n');
    assert.match(out, /corp.*alice@example\.test/);
    assert.match(out, /partner.*bob@example\.test/);
    assert.match(out, /services: crm/);

    await controller.command('logout', 'partner');
    assert.equal(await env.manager.whoami('partner'), null);
    assert.equal((await env.manager.whoami('corp'))?.sub, 'alice');
  } finally {
    await env.close();
  }
});

test('ShellAuthController hints once on auth:required, or logs in with autoLogin', async () => {
  const env = await setupAuth();
  try {
    const hinting = new ShellAuthController(env.manager, { log: (l) => env.lines.push(l) });
    hinting.handleAuthRequired({ service: 'crm', idp: 'corp' });
    hinting.handleAuthRequired({ service: 'crm', idp: 'corp' });
    assert.equal(env.lines.filter((l) => l.includes('/auth login crm')).length, 1);
    assert.equal(hinting.pendingLogins().length, 0);

    const auto = new ShellAuthController(env.manager, { log: env.log, autoLogin: true });
    auto.handleAuthRequired({ service: 'crm' });
    auto.handleAuthRequired({ service: 'unknown-service' }); // never auto-login to unconfigured targets
    assert.deepEqual(auto.pendingLogins(), ['crm']);
    await waitFor(() => auto.pendingLogins().length === 0);
    assert.equal((await env.manager.whoami('crm'))?.sub, 'alice');
  } finally {
    await env.close();
  }
});

test('ShellAuthController cancel aborts a pending login', async () => {
  const env = await setupAuth();
  try {
    const lines: string[] = [];
    const controller = new ShellAuthController(env.manager, { log: (l) => lines.push(l) }); // nobody approves
    const login = controller.startLogin('corp');
    await waitFor(() => lines.some((l) => l.includes('Code:')));
    assert.equal(controller.cancel('corp'), true);
    assert.equal(await login, null);
    assert.ok(lines.some((l) => l.includes('Login to corp failed: cancelled')));
  } finally {
    await env.close();
  }
});

test('ClientShell exposes /auth and routes AUTH_REQUIRED errors to a hint', async () => {
  const env = await setupAuth();
  const original = console.log;
  const printed: string[] = [];
  console.log = (...args: any[]) => printed.push(args.join(' '));
  try {
    const shell = createClientShell({
      auth: env.manager,
      onToolCall: async () => {
        throw Object.assign(new Error('no token'), { code: 'AUTH_REQUIRED', service: 'crm', idp: 'corp' });
      },
    });
    await shell.handleLine('/auth whoami corp');
    assert.ok(printed.some((l) => /corp.*not signed in/.test(l)));
    await shell.handleLine('/exec crm_lookup {}');
    assert.ok(printed.some((l) => l.includes('"crm" needs sign-in (IdP corp). Run /auth login crm')));
    assert.ok(!printed.some((l) => l.includes('[Exec Error]')));
  } finally {
    console.log = original;
    await env.close();
  }
});

async function startAuthWsServer(acceptToken: (token: string) => boolean) {
  const server = http.createServer();
  const wss = new WebSocketServer({ noServer: true });
  const sockets = new Set<any>();
  server.on('upgrade', (req, socket, head) => {
    const token = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
    if (!acceptToken(token)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Bearer error="invalid_token"\r\nContent-Length: 0\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      sockets.add(ws);
      ws.send(JSON.stringify({ type: 'connected', sessionId: `s-${token}` }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    sockets,
    close: () => new Promise<void>((r) => {
      for (const s of sockets) s.terminate();
      server.closeAllConnections();
      server.close(() => r());
    }),
  };
}

test('WebSocket channel sends the bearer token, retries once on 401, and reconnects on 4401', async () => {
  let valid = 'tok-2';
  const server = await startAuthWsServer((t) => t === valid);
  let issued = 0;
  const unauthorized: (string | null | undefined)[] = [];
  const auth = {
    name: 'curator',
    getAccessToken: async () => `tok-${++issued}`,
    handleUnauthorized: async (header?: string | null) => {
      unauthorized.push(header);
      return true;
    },
  };
  try {
    const channel = await createWebSocketChannel({ serverUrl: server.url, auth });
    assert.equal(issued, 2); // tok-1 rejected, tok-2 accepted
    assert.match(String(unauthorized[0]), /invalid_token/);

    const events: any[] = [];
    channel.on((e) => events.push(e));
    valid = 'tok-3';
    for (const s of server.sockets) s.close(4401, 'token expired');
    await waitFor(() => events.some((e) => e.sessionId === 's-tok-3'));
    await channel.close();
  } finally {
    await server.close();
  }
});

test('WebSocket channel without a token fails with ChannelAuthError', async () => {
  const server = await startAuthWsServer(() => true);
  try {
    await assert.rejects(
      createWebSocketChannel({ serverUrl: server.url, auth: { name: 'curator', getAccessToken: async () => null } }),
      (err: any) => err instanceof ChannelAuthError && err.code === 'AUTH_REQUIRED'
    );
  } finally {
    await server.close();
  }
});
