import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LlmFactory, curatorEngine } from '@curator/agent-server';
import { createCuratorHost } from '@curator/host';
import { McpRemoteRegistry, createMcpClientPlugin } from '../dist/index.js';
import { startMockMcpServer } from './helpers/mockMcpServer.ts';

const PROJECT_A = 'proj-a';
const PROJECT_B = 'proj-b';

let host: any;
let registry: McpRemoteRegistry;
let dir: string;
const broadcasts: { type: string; payload: any }[] = [];
let token: string | null = null;
let crmA: Awaited<ReturnType<typeof startMockMcpServer>>;
let crmB: Awaited<ReturnType<typeof startMockMcpServer>>;
let secure: Awaited<ReturnType<typeof startMockMcpServer>>;

// Token source standing in for AuthSessionManager: null until the "user" logs in.
const auth = {
  serviceNames: () => ['secure'],
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

before(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'curator-mcp-client-'));
  crmA = await startMockMcpServer({
    label: 'A',
    tools: {
      lookup: { description: 'Find an account', annotations: { readOnlyHint: true }, handler: (a) => ({ account: a.q, from: 'A' }) },
      update: { annotations: { destructiveHint: false }, handler: () => 'updated' },
      purge: { annotations: { destructiveHint: true }, handler: () => 'purged' },
      raw: { handler: () => 'unannotated' },
    },
    resources: [{ uri: 'crm://accounts', name: 'accounts', mimeType: 'application/json', text: '[1,2]' }],
    templates: [{ uriTemplate: 'crm://accounts/{id}', name: 'account' }],
    prompts: [{ name: 'summarize', arguments: [{ name: 'accountId', required: true }] }],
  });
  crmB = await startMockMcpServer({
    label: 'B',
    tools: { lookup: { annotations: { readOnlyHint: true }, handler: (a) => ({ account: a.q, from: 'B' }) } },
  });
  secure = await startMockMcpServer({
    label: 'S',
    token: 'good-token',
    tools: { whoami: { annotations: { readOnlyHint: true }, handler: () => 'secure-ok' } },
  });

  const { plugin, registry: reg } = createMcpClientPlugin({ auth });
  registry = reg;
  host = await createCuratorHost({
    name: 'mcp-client-test',
    projectId: PROJECT_A,
    logLevel: 'silent',
    curatorDb: { path: path.join(dir, 'curator.db') },
    registerPlugins: () => {
      curatorEngine.registerPlugin(plugin);
      return curatorEngine;
    },
  } as any);
  await host.seed();
  await host.prisma.project.upsert({ where: { id: PROJECT_B }, update: {}, create: { id: PROJECT_B, name: 'B', userId: 'system' } });
  // Tool access is whitelist-based: the host user needs a role in each project (approval gates still apply).
  await host.prisma.role.upsert({ where: { id: 'curator_admin' }, update: {}, create: { id: 'curator_admin', name: 'curator_admin' } });
  for (const projectId of [PROJECT_A, PROJECT_B]) await host.assignUserProjectRole('system', 'curator_admin', projectId);
  host.events.onEvent((e: any) => broadcasts.push(e));
  await registry.attach(host);
});

after(async () => {
  if (savedGemini.saved) {
    const providers: Map<string, any> = (LlmFactory as any).providers;
    if (savedGemini.provider) providers.set('gemini', savedGemini.provider);
    else providers.delete('gemini');
  }
  await registry?.close();
  await host?.stop();
  await Promise.all([crmA, crmB, secure].map((s) => s?.close()));
  rmSync(dir, { recursive: true, force: true });
});

test('register syncs tools, resources, templates and prompts into the database', async () => {
  const result = await registry.register({ projectId: PROJECT_A, name: 'crm', url: crmA.url });
  assert.equal(result.error, undefined);
  assert.deepEqual(
    { tools: result.sync!.tools, resources: result.sync!.resources, templates: result.sync!.resourceTemplates, prompts: result.sync!.prompts },
    { tools: 4, resources: 1, templates: 1, prompts: 1 }
  );

  const server = await host.prisma.mcpServer.findUnique({
    where: { projectId_name: { projectId: PROJECT_A, name: 'crm' } },
    include: { tools: true, resources: true, prompts: true },
  });
  assert.equal(server.status, 'connected');
  assert.equal(server.serverInfo.name, 'mock-A');
  assert.equal(server.instructions, 'Mock server A');

  const byRemote = Object.fromEntries(server.tools.map((t: any) => [t.remoteName, t]));
  assert.equal(byRemote.lookup.name, 'mcp.crm.lookup@proj-a');
  assert.equal(byRemote.lookup.origin, 'remote');
  assert.equal(byRemote.lookup.projectId, PROJECT_A);
  assert.deepEqual(
    Object.fromEntries(Object.entries(byRemote).map(([k, t]: any) => [k, t.accessLevel])),
    { lookup: 'read_only', update: 'safe_write', purge: 'destructive', raw: 'elevated' }
  );
  assert.deepEqual(server.resources.map((r: any) => [r.uri, r.isTemplate]).sort(), [['crm://accounts', false], ['crm://accounts/{id}', true]]);
  assert.deepEqual(server.prompts[0].arguments, [{ name: 'accountId', required: true }]);

  const local = await host.prisma.tool.findUnique({ where: { name: 'mcp_servers_list' } });
  assert.equal(local.origin, 'local');
});

test('workflows call remote tools by alias, resolved in the request project', async () => {
  await registry.register({ projectId: PROJECT_B, name: 'crm', url: crmB.url });

  const a = await host.runTool('mcp.crm.lookup', { q: 'acme' });
  assert.deepEqual(a.result, { account: 'acme', from: 'A' });
  const b = await host.runTool('mcp.crm.lookup', { q: 'acme' }, { projectId: PROJECT_B });
  assert.deepEqual(b.result, { account: 'acme', from: 'B' });

  const request = await host.prisma.request.findUnique({ where: { id: a.requestId } });
  assert.equal(request.toolName, 'mcp.crm.lookup');
});

/**
 * Runs a Curator_Agent offered `mcp.crm.*` with a scripted model standing in for `gemini`
 * (the AST schema only accepts known providers); returns what the model was offered.
 */
async function runAgent(projectId: string, calls: { name: string; args: any }[]) {
  const offered: string[][] = [];
  let turn = 0;
  const providers: Map<string, any> = (LlmFactory as any).providers;
  if (!savedGemini.saved) Object.assign(savedGemini, { saved: true, provider: providers.get('gemini') });
  LlmFactory.registerProvider('gemini', {
    providerName: 'gemini',
    async generateContent(req: any) {
      offered.push((req.tools ?? []).map((t: any) => t.name).sort());
      const call = calls[turn++];
      return call
        ? { text: '', toolCalls: [{ id: `c${turn}`, ...call }], finishReason: 'tool_use' }
        : { text: 'done', finishReason: 'stop' };
    },
  } as any);
  let conversation = await host.prisma.conversation.findFirst({ where: { projectId } });
  conversation ??= await host.prisma.conversation.create({ data: { userId: 'system', projectId } });
  const req = await host.prisma.request.create({
    data: {
      userId: 'system',
      projectId,
      conversationId: conversation.id,
      status: 'NEW',
      toolName: 'Curator_Workflow',
      ast: { type: 'Curator_Agent', agentName: 'harness', provider: 'gemini', prompt: 'help', tools: ['mcp.crm.*'] },
    },
  });
  await host.processor.stepUntil({ conversationId: conversation.id });
  return { offered, request: await host.prisma.request.findUnique({ where: { id: req.id } }) };
}
const savedGemini: { saved?: boolean; provider?: any } = {};

test('agents select remote tools by pattern, per project, under provider-safe names', async () => {
  const a = await runAgent(PROJECT_A, [{ name: 'mcp__crm__lookup', args: { q: 'agent-a' } }]);
  assert.deepEqual(a.offered[0], ['mcp__crm__lookup', 'mcp__crm__purge', 'mcp__crm__raw', 'mcp__crm__update']);
  assert.equal(a.request.status, 'COMPLETED');
  assert.ok(crmA.calls.some((c) => c.tool === 'lookup' && c.args.q === 'agent-a'));

  const b = await runAgent(PROJECT_B, [{ name: 'mcp__crm__lookup', args: { q: 'agent-b' } }]);
  assert.deepEqual(b.offered[0], ['mcp__crm__lookup']);
  assert.ok(crmB.calls.some((c) => c.args?.q === 'agent-b'));
  assert.ok(!crmA.calls.some((c) => c.args?.q === 'agent-b'));
});

test('an agent call to a destructive remote tool waits for approval of the project-qualified key', async () => {
  const before = crmA.calls.length;
  const { request } = await runAgent(PROJECT_A, [{ name: 'mcp__crm__purge', args: {} }]);
  assert.equal(request.status, 'WAITING_FOR_USER');
  assert.equal(request.context.pendingToolCall.name, 'mcp.crm.purge@proj-a');
  assert.equal(request.context.pendingToolCall.llmName, 'mcp__crm__purge');
  assert.equal(crmA.calls.length, before);
  // Close the wait so later steps of this conversation are not blocked.
  await host.prisma.request.update({ where: { id: request.id }, data: { status: 'CANCELLED' } });
});

test('a remote tool refuses requests from another project, even by its full key', async () => {
  await assert.rejects(host.runTool('mcp.crm.lookup@proj-b', { q: 'x' }), /belongs to another project/);
  assert.ok(!crmB.calls.some((c) => c.args?.q === 'x'));
});

test('access levels gate remote tools like local ones', async () => {
  const pending = await host.runTool('mcp.crm.raw', {});
  assert.equal(pending.status, 'WAITING_FOR_USER');
  assert.ok(!crmA.calls.some((c) => c.tool === 'raw'));
  const ok = await host.runTool('mcp.crm.update', {});
  assert.equal(ok.result, 'updated');
});

test('resources and prompts through local plugin tools', async () => {
  const listed = await host.runTool('mcp_resources_list', { server: 'crm' });
  assert.deepEqual(listed.result.map((r: any) => r.uri).sort(), ['crm://accounts', 'crm://accounts/{id}']);

  const read = await host.runTool('mcp_resource_read', { server: 'crm', uri: 'crm://accounts/42' });
  assert.equal(read.result.contents[0].text, 'generated:crm://accounts/42');

  const prompt = await host.runTool('mcp_prompt_get', { server: 'crm', name: 'summarize', arguments: { accountId: '42' } });
  assert.equal(prompt.result.messages[0].content.text, 'A:summarize:{"accountId":"42"}');

  const servers = await host.runTool('mcp_servers_list', {});
  const crm = servers.result.find((s: any) => s.name === 'crm');
  assert.equal(crm.projectId, PROJECT_A);
  assert.ok(crm.tools.some((t: any) => t.alias === 'mcp.crm.lookup'));
});

test('resync marks removed tools, resources and prompts as gone', async () => {
  delete crmA.options.tools.purge;
  crmA.options.prompts = [];
  crmA.options.templates = [];
  const sync = await registry.sync(PROJECT_A, 'crm');
  assert.deepEqual(sync.removed, { tools: 1, resources: 1, prompts: 1 });

  const purge = await host.prisma.tool.findUnique({ where: { name: 'mcp.crm.purge@proj-a' } });
  assert.equal(purge.existent, false);
  assert.equal(registry.resolveTool('mcp.crm.purge', PROJECT_A), undefined);
  await assert.rejects(host.runTool('mcp.crm.purge', {}), /not found/);
});

test('a restarted registry restores tools from the database without contacting servers', async () => {
  const engine = {
    tools: new Map<string, any>(),
    registerTool(tool: any) {
      this.tools.set(tool.name, tool);
    },
    unregisterTool(name: string) {
      return this.tools.delete(name);
    },
    addToolResolver: () => () => {},
  };
  const fresh = new McpRemoteRegistry({ fetch: (() => Promise.reject(new Error('network used'))) as any });
  await fresh.attach({ prisma: host.prisma, engine });
  assert.ok(fresh.resolveTool('mcp.crm.lookup', PROJECT_A));
  assert.equal(fresh.resolveTool('mcp.crm.lookup', PROJECT_B)?.name, 'mcp.crm.lookup@proj-b');
  assert.equal(fresh.resolveTool('mcp.crm.purge', PROJECT_A), undefined);
  await fresh.close();
});

test('servers needing a login report auth_required and recover after login', async () => {
  broadcasts.length = 0;
  const first = await registry.register({ projectId: PROJECT_A, name: 'secure', url: secure.url, authService: 'secure' });
  assert.equal(first.error?.code, 'AUTH_REQUIRED');
  const row = await host.prisma.mcpServer.findUnique({ where: { projectId_name: { projectId: PROJECT_A, name: 'secure' } } });
  assert.equal(row.status, 'auth_required');
  const event = broadcasts.find((e) => e.type === 'auth:required');
  assert.deepEqual(event?.payload, { service: 'secure', idp: undefined, server: 'secure', projectId: PROJECT_A });

  token = 'good-token';
  const sync = await registry.sync(PROJECT_A, 'secure');
  assert.equal(sync.status, 'connected');
  const out = await host.runTool('mcp.secure.whoami', {});
  assert.equal(out.result, 'secure-ok');
  assert.equal(secure.calls.at(-1)?.auth, 'Bearer good-token');
});

test('declared tools get roles and access levels before the server is reached; strict skips the rest', async () => {
  for (const id of ['planner', 'viewer']) {
    await host.prisma.role.upsert({ where: { id }, update: {}, create: { id, name: id } });
  }
  const docs = await startMockMcpServer({
    label: 'D',
    tools: {
      search: { annotations: { readOnlyHint: true }, handler: () => 'found' },
      wipe: { annotations: { destructiveHint: true }, handler: () => 'wiped' },
    },
    prompts: [{ name: 'brief' }, { name: 'other' }],
  });
  try {
    const expect = {
      tools: { search: { roles: ['planner'], accessLevel: 'safe_write' as const }, later: { roles: ['viewer'] } },
      prompts: ['brief'],
      strict: true,
    };
    await registry.register({ projectId: PROJECT_A, name: 'docs', url: docs.url, sync: false, expect });

    // Before any connection: rows with grants, not callable.
    const search = await host.prisma.tool.findUnique({ where: { name: 'mcp.docs.search@proj-a' }, include: { roles: true } });
    assert.equal(search.existent, false);
    assert.equal(search.accessLevel, 'safe_write');
    assert.deepEqual(search.roles.map((r: any) => r.roleId), ['planner']);
    assert.equal(registry.resolveTool('mcp.docs.search', PROJECT_A), undefined);
    const brief = await host.prisma.mcpPrompt.findFirst({ where: { name: 'brief', mcpServer: { name: 'docs' } } });
    assert.equal(brief.existent, false);

    const sync = await registry.sync(PROJECT_A, 'docs');
    assert.deepEqual(sync.missing, { tools: ['later'], resources: [], prompts: [] });
    assert.deepEqual(sync.skipped, { tools: ['wipe'], resources: [], prompts: ['other'] });
    assert.ok(registry.resolveTool('mcp.docs.search', PROJECT_A));
    assert.equal(registry.resolveTool('mcp.docs.wipe', PROJECT_A), undefined);
    const synced = await host.prisma.tool.findUnique({ where: { name: 'mcp.docs.search@proj-a' }, include: { roles: true } });
    // The declaration wins over the readOnlyHint; roles stay exactly the declared ones.
    assert.equal(synced.existent, true);
    assert.equal(synced.accessLevel, 'safe_write');
    assert.deepEqual(synced.roles.map((r: any) => r.roleId), ['planner']);
    const later = await host.prisma.tool.findUnique({ where: { name: 'mcp.docs.later@proj-a' } });
    assert.equal(later.existent, false);

    // Re-declaring with other roles revokes the old grant.
    await registry.register({ projectId: PROJECT_A, name: 'docs', url: docs.url, sync: false, expect: { ...expect, tools: { search: { roles: ['viewer'] } } } });
    const regranted = await host.prisma.toolRole.findMany({ where: { toolId: synced.id } });
    assert.deepEqual(regranted.map((r: any) => r.roleId), ['viewer']);
  } finally {
    await registry.unregister(PROJECT_A, 'docs');
    await docs.close();
  }
});

test('unregister removes the server from resolution and the catalog', async () => {
  await registry.unregister(PROJECT_B, 'crm');
  assert.equal(registry.resolveTool('mcp.crm.lookup', PROJECT_B), undefined);
  // Project A's server with the same name is untouched.
  assert.ok(registry.resolveTool('mcp.crm.lookup', PROJECT_A));
  const row = await host.prisma.mcpServer.findUnique({ where: { projectId_name: { projectId: PROJECT_B, name: 'crm' } }, include: { tools: true } });
  assert.equal(row.existent, false);
  assert.ok(row.tools.every((t: any) => t.existent === false));
});

test('invalid registrations are rejected', async () => {
  await assert.rejects(registry.register({ projectId: PROJECT_A, name: 'bad.name', url: crmA.url }), /Invalid MCP server name/);
  await assert.rejects(registry.register({ projectId: PROJECT_A, name: 'insecure', url: 'http://example.com/mcp' }), /must use https/);
});
