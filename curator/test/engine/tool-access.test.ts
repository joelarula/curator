import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, compileFixture, type TestEnv } from '../helpers/harness.ts';
import { defineTool } from '../../src/tools/CuratorTool.ts';

// Role based and project based tool access, through the real processor and the real RBAC tables.
// The harness user is an admin (bypasses everything), so every case here uses its own non-admin user.

async function setup(name: string, toolConfig: Record<string, any> = {}) {
  const env = await createEnv(name);
  const ran: any[] = [];
  const tool: any = defineTool({
    name: 'secret_action',
    description: 'A guarded action',
    parameters: { type: 'object', properties: { note: { type: 'string' } } },
    execute: async (args: any) => {
      ran.push(args);
      return JSON.stringify({ ok: true });
    },
  } as any);
  Object.assign(tool, toolConfig);
  ((env.processor as any).engine.tools as Map<string, any>).set('secret_action', tool);
  const dbTool = await env.prisma.tool.create({ data: { name: 'secret_action' } });
  return { env, ran, toolId: dbTool.id as number };
}

const mkUser = (env: TestEnv, n: string) => env.prisma.user.create({ data: { name: n, email: `${n}@example.com` } });
const mkRole = (env: TestEnv, id: string) => env.prisma.role.create({ data: { id, name: id } });
const mkProject = (env: TestEnv, id: string) => env.prisma.project.create({ data: { id, name: id, userId: String(env.userId) } });

async function submit(env: TestEnv, ast: any, who: { userId: any; projectId?: string }) {
  const req = await env.prisma.request.create({
    data: { userId: who.userId, projectId: who.projectId, conversationId: env.conversationId, status: 'NEW', toolName: 'Curator_Workflow', ast },
  });
  await env.processor.stepUntil({ conversationId: env.conversationId });
  const responses = await env.prisma.response.findMany({   where: { conversationId: env.conversationId }, orderBy: { id: 'asc' } });
    const blocked = responses.reverse().map((r: any) => { try { return JSON.parse(r.content); } catch { return null; } }).find((r: any) => r?.type === 'TOOL_BLOCKED');
  const row = await env.prisma.request.findUnique({ where: { id: req.id } });
  return { status: row.status as string, blocked };
}

const guarded = () => compileFixture('tool_guarded.coffee');

test('rbac: a user with no roles is blocked and the tool does not run', async () => {
  const { env, ran } = await setup('rbac_none');
  try {
    const u = await mkUser(env, 'nobody');
    const r = await submit(env, await guarded(), { userId: u.id });
    assert.equal(r.status, 'FAILED');
    assert.match(r.blocked.reason, /no assigned roles/);
    assert.equal(ran.length, 0);
  } finally { await env.cleanup(); }
});

test('rbac: a role linked to the tool (ToolRole) allows it; an unrelated role does not', async () => {
  const { env, ran, toolId } = await setup('rbac_toolrole');
  try {
    await mkRole(env, 'operator'); await mkRole(env, 'viewer');
    await env.prisma.toolRole.create({ data: { toolId, roleId: 'operator' } });
    const op = await mkUser(env, 'op'); const vw = await mkUser(env, 'vw');
    await env.prisma.userRole.create({ data: { userId: op.id, roleId: 'operator' } });
    await env.prisma.userRole.create({ data: { userId: vw.id, roleId: 'viewer' } });

    const denied = await submit(env, await guarded(), { userId: vw.id });
    assert.equal(denied.status, 'FAILED');
    assert.match(denied.blocked.reason, /not whitelisted/);
    assert.equal(ran.length, 0);

    const allowed = await submit(env, await guarded(), { userId: op.id });
    assert.equal(allowed.status, 'COMPLETED');
    assert.equal(ran.length, 1);
  } finally { await env.cleanup(); }
});

test('rbac: the tool\'s requiredRole is honoured, and inherited sub-roles count', async () => {
  const { env, ran } = await setup('rbac_required', { requiredRole: 'dealer' });
  try {
    await mkRole(env, 'dealer'); await mkRole(env, 'host');
    await env.prisma.roleInheritance.create({ data: { parentId: 'host', subRoleId: 'dealer' } });
    const u = await mkUser(env, 'hostuser');
    await env.prisma.userRole.create({ data: { userId: u.id, roleId: 'host' } });
    const r = await submit(env, await guarded(), { userId: u.id });
    assert.equal(r.status, 'COMPLETED');
    assert.equal(ran.length, 1);
  } finally { await env.cleanup(); }
});

test('project: a role granted in one project does not apply in another or globally', async () => {
  const { env, ran, toolId } = await setup('proj_scope');
  try {
    await mkProject(env, 'p1'); await mkProject(env, 'p2');
    await mkRole(env, 'operator');
    await env.prisma.toolRole.create({ data: { toolId, roleId: 'operator' } });
    const u = await mkUser(env, 'scoped');
    await env.prisma.userRole.create({ data: { userId: u.id, roleId: 'operator', projectId: 'p1' } });

    const inP1 = await submit(env, await guarded(), { userId: u.id, projectId: 'p1' });
    assert.equal(inP1.status, 'COMPLETED');
    assert.equal(ran.length, 1);

    const inP2 = await submit(env, await guarded(), { userId: u.id, projectId: 'p2' });
    assert.equal(inP2.status, 'FAILED');
    assert.match(inP2.blocked.reason, /no assigned roles/);

    const global = await submit(env, await guarded(), { userId: u.id });
    assert.equal(global.status, 'FAILED');
    assert.equal(ran.length, 1);
  } finally { await env.cleanup(); }
});

test('project: ProjectRole limits which roles are valid inside that project', async () => {
  const { env, ran, toolId } = await setup('proj_roles');
  try {
    await mkProject(env, 'p1');
    await mkRole(env, 'operator'); await mkRole(env, 'guest');
    await env.prisma.toolRole.create({ data: { toolId, roleId: 'operator' } });
    await env.prisma.projectRole.create({ data: { projectId: 'p1', roleId: 'guest' } });
    const u = await mkUser(env, 'op2');
    await env.prisma.userRole.create({ data: { userId: u.id, roleId: 'operator' } });

    const inP1 = await submit(env, await guarded(), { userId: u.id, projectId: 'p1' });
    assert.equal(inP1.status, 'FAILED');
    assert.match(inP1.blocked.reason, /not assigned to project 'p1'/);
    assert.equal(ran.length, 0);

    await env.prisma.projectRole.create({ data: { projectId: 'p1', roleId: 'operator' } });
    env.processor.invalidateDefinitions(); // access decisions are cached for definitionCacheMs
    const after = await submit(env, await guarded(), { userId: u.id, projectId: 'p1' });
    assert.equal(after.status, 'COMPLETED');
    assert.equal(ran.length, 1);
  } finally { await env.cleanup(); }
});

test('project: an admin works in any project', async () => {
  const { env, ran } = await setup('proj_admin');
  try {
    await mkProject(env, 'p9');
    const r = await submit(env, await guarded(), { userId: env.userId, projectId: 'p9' });
    assert.equal(r.status, 'COMPLETED');
    assert.equal(ran.length, 1);
  } finally { await env.cleanup(); }
});

test('agent: a tool the user may not run is not offered to the model, and a forced call never runs', async () => {
  const { env, ran } = await setup('agent_denied');
  try {
    const u = await mkUser(env, 'limited');
    const llm = env.useLlm([{ toolCalls: [{ name: 'secret_action', args: { note: 'x' } }] }, 'ok, could not do it']);
    const ast = await compileFixture('choose_action.coffee');
    (ast as any).tools = ['secret_action'];
    await submit(env, ast, { userId: u.id });
    assert.equal(ran.length, 0);
    assert.equal(llm.requests[0].tools, undefined);
    const toolMsg = llm.requests[1].messages.find((m: any) => m.role === 'tool') as any;
    assert.match(String(toolMsg.content), /not found|denied/i);
  } finally { await env.cleanup(); }
});

test('agent: only the tools the user may run are offered', async () => {
  const { env, toolId } = await setup('agent_filter');
  try {
    const tools = (env.processor as any).engine.tools as Map<string, any>;
    tools.set('open_action', defineTool({ name: 'open_action', description: 'open', parameters: { type: 'object', properties: {} }, execute: async () => '{}' } as any));
    await mkRole(env, 'operator');
    await env.prisma.toolRole.create({ data: { toolId, roleId: 'operator' } });
    const open = await env.prisma.tool.create({ data: { name: 'open_action' } });
    await mkRole(env, 'basic');
    await env.prisma.toolRole.create({ data: { toolId: open.id, roleId: 'basic' } });
    const u = await mkUser(env, 'basicuser');
    await env.prisma.userRole.create({ data: { userId: u.id, roleId: 'basic' } });
    const llm = env.useLlm(['done']);
    const ast: any = await compileFixture('choose_action.coffee');
    ast.tools = ['secret_action', 'open_action'];
    await submit(env, ast, { userId: u.id });
    assert.deepEqual(llm.requests[0].tools?.map((t: any) => t.name), ['open_action']);
  } finally { await env.cleanup(); }
});

async function submitAs(env: TestEnv, ast: any, who: { agentId: string; projectId?: string }) {
  const req = await env.prisma.request.create({
    data: { userId: env.userId, agentId: who.agentId, projectId: who.projectId, conversationId: env.conversationId, status: 'NEW', toolName: 'Curator_Workflow', ast },
  });
  await env.processor.stepUntil({ conversationId: env.conversationId });
  return (await env.prisma.request.findUnique({ where: { id: req.id } })).status as string;
}

test('agent identity: the agent\'s own roles decide, not the requesting user\'s admin role', async () => {
  const { env, ran, toolId } = await setup('agent_identity');
  try {
    await mkRole(env, 'operator'); await mkRole(env, 'reader');
    await env.prisma.toolRole.create({ data: { toolId, roleId: 'operator' } });
    const good = await env.prisma.agent.create({ data: { id: 'ag-good', name: 'good', userId: env.userId } });
    const bad = await env.prisma.agent.create({ data: { id: 'ag-bad', name: 'bad', userId: env.userId } });
    await env.prisma.agentRole.create({ data: { agentId: good.id, roleId: 'operator' } });
    await env.prisma.agentRole.create({ data: { agentId: bad.id, roleId: 'reader' } });

    assert.equal(await submitAs(env, await guarded(), { agentId: bad.id }), 'FAILED');
    assert.equal(ran.length, 0);
    assert.equal(await submitAs(env, await guarded(), { agentId: good.id }), 'COMPLETED');
    assert.equal(ran.length, 1);
  } finally { await env.cleanup(); }
});

test('agent identity: an agent bound to one project cannot act in another', async () => {
  const { env, ran, toolId } = await setup('agent_project_bound');
  try {
    await mkProject(env, 'p1'); await mkProject(env, 'p2'); await mkRole(env, 'operator');
    await env.prisma.toolRole.create({ data: { toolId, roleId: 'operator' } });
    const a = await env.prisma.agent.create({ data: { id: 'ag-p1', name: 'p1agent', userId: env.userId, projectId: 'p1' } });
    await env.prisma.agentRole.create({ data: { agentId: a.id, roleId: 'operator' } });

    assert.equal(await submitAs(env, await guarded(), { agentId: a.id, projectId: 'p1' }), 'COMPLETED');
    assert.equal(await submitAs(env, await guarded(), { agentId: a.id, projectId: 'p2' }), 'FAILED');
    assert.equal(ran.length, 1);
  } finally { await env.cleanup(); }
});


test('agent: an LLM turn runs the tool for a permitted project member and refuses the same user elsewhere', async () => {
  const { env, ran, toolId } = await setup('agent_project');
  try {
    await mkProject(env, 'p1'); await mkProject(env, 'p2'); await mkRole(env, 'operator');
    await env.prisma.toolRole.create({ data: { toolId, roleId: 'operator' } });
    const u = await mkUser(env, 'member');
    await env.prisma.userRole.create({ data: { userId: u.id, roleId: 'operator', projectId: 'p1' } });
    env.useLlm((req: any, i: number) => (i % 2 === 0 ? { toolCalls: [{ name: 'secret_action', args: { note: 'x' } }] } : 'done'));
    const ast: any = await compileFixture('choose_action.coffee');
    ast.tools = ['secret_action'];
    await submit(env, structuredClone(ast), { userId: u.id, projectId: 'p1' });
    assert.equal(ran.length, 1);
    await submit(env, structuredClone(ast), { userId: u.id, projectId: 'p2' });
    assert.equal(ran.length, 1);
  } finally { await env.cleanup(); }
});

test('narrowing: an agent acting for a user may only use tools both are allowed', async () => {
  const { env, ran, toolId } = await setup('narrow_agent_user');
  try {
    await mkRole(env, 'operator'); await mkRole(env, 'viewer');
    await env.prisma.toolRole.create({ data: { toolId, roleId: 'operator' } });
    const agent = await env.prisma.agent.create({ data: { id: 'ag-op', name: 'opagent', userId: env.userId } });
    await env.prisma.agentRole.create({ data: { agentId: agent.id, roleId: 'operator' } });
    const viewer = await mkUser(env, 'viewer1');
    await env.prisma.userRole.create({ data: { userId: viewer.id, roleId: 'viewer' } });
    const operator = await mkUser(env, 'operator1');
    await env.prisma.userRole.create({ data: { userId: operator.id, roleId: 'operator' } });
    // Both may address the agent; only the tool rights differ
    await mkRole(env, 'agent:opagent');
    for (const u of [viewer, operator]) await env.prisma.userRole.create({ data: { userId: u.id, roleId: 'agent:opagent' } });

    const run = async (userId: any) => {
      const req = await env.prisma.request.create({
        data: { userId, agentId: agent.id, conversationId: env.conversationId, status: 'NEW', toolName: 'Curator_Workflow', ast: await guarded() },
      });
      await env.processor.stepUntil({ conversationId: env.conversationId });
      return (await env.prisma.request.findUnique({ where: { id: req.id } })).status as string;
    };

    assert.equal(await run(viewer.id), 'FAILED');
    assert.equal(ran.length, 0);
    assert.equal(await run(operator.id), 'COMPLETED');
    assert.equal(ran.length, 1);
  } finally { await env.cleanup(); }
});

test('project inheritance: a role given in a parent project applies in its sub-projects, not the other way', async () => {
  const { env, ran, toolId } = await setup('proj_inherit');
  try {
    await mkProject(env, 'parent');
    await env.prisma.project.create({ data: { id: 'child', name: 'child', userId: String(env.userId), parentId: 'parent' } });
    await mkRole(env, 'operator');
    await env.prisma.toolRole.create({ data: { toolId, roleId: 'operator' } });
    const up = await mkUser(env, 'parentop');
    await env.prisma.userRole.create({ data: { userId: up.id, roleId: 'operator', projectId: 'parent' } });
    const down = await mkUser(env, 'childop');
    await env.prisma.userRole.create({ data: { userId: down.id, roleId: 'operator', projectId: 'child' } });

    assert.equal((await submit(env, await guarded(), { userId: up.id, projectId: 'child' })).status, 'COMPLETED');
    assert.equal(ran.length, 1);
    const upward = await submit(env, await guarded(), { userId: down.id, projectId: 'parent' });
    assert.equal(upward.status, 'FAILED');
    assert.equal(ran.length, 1);
  } finally { await env.cleanup(); }
});

test('project inheritance: a sub-project narrows with its own role list and cannot widen the parent\'s', async () => {
  const { env, ran, toolId } = await setup('proj_narrow');
  try {
    await mkProject(env, 'parent');
    await env.prisma.project.create({ data: { id: 'child', name: 'child', userId: String(env.userId), parentId: 'parent' } });
    await mkRole(env, 'operator'); await mkRole(env, 'guest');
    await env.prisma.toolRole.create({ data: { toolId, roleId: 'operator' } });
    const u = await mkUser(env, 'inheritor');
    await env.prisma.userRole.create({ data: { userId: u.id, roleId: 'operator', projectId: 'parent' } });

    // The sub-project lists only 'guest': the inherited 'operator' is not valid there
    await env.prisma.projectRole.create({ data: { projectId: 'child', roleId: 'guest' } });
    const narrowed = await submit(env, await guarded(), { userId: u.id, projectId: 'child' });
    assert.equal(narrowed.status, 'FAILED');
    assert.match(narrowed.blocked.reason, /not assigned to project 'child'/);

    // The parent lists only 'guest' while the child lists 'operator': the child cannot widen the parent
    await env.prisma.projectRole.deleteMany({ where: { projectId: 'child' } });
    await env.prisma.projectRole.create({ data: { projectId: 'child', roleId: 'operator' } });
    await env.prisma.projectRole.create({ data: { projectId: 'parent', roleId: 'guest' } });
    env.processor.invalidateDefinitions();
    const widened = await submit(env, await guarded(), { userId: u.id, projectId: 'child' });
    assert.equal(widened.status, 'FAILED');
    assert.match(widened.blocked.reason, /not assigned to project 'parent'/);
    assert.equal(ran.length, 0);
  } finally { await env.cleanup(); }
});

async function addressAgent(env: TestEnv, agentId: string, userId: any) {
  const req = await env.prisma.request.create({
    data: { userId, agentId, conversationId: env.conversationId, status: 'NEW', toolName: 'Curator_Workflow', ast: await guarded() },
  });
  await env.processor.stepUntil({ conversationId: env.conversationId });
  const row = await env.prisma.request.findUnique({ where: { id: req.id } });
  const responses = await env.prisma.response.findMany({ where: { requestId: req.id } });
  const blocked = responses.map((r: any) => { try { return JSON.parse(r.content); } catch { return null; } }).find((r: any) => r?.type === 'AGENT_BLOCKED');
  return { status: row.status as string, blocked };
}

test("agent access: a user needs agent:<name>, agent:* or the agent's requiredRole to address it", async () => {
  const { env, ran, toolId } = await setup('agent_address');
  try {
    await mkRole(env, 'operator'); await mkRole(env, 'agent:helper'); await mkRole(env, 'agent:*'); await mkRole(env, 'helpdesk');
    await env.prisma.toolRole.create({ data: { toolId, roleId: 'operator' } });
    const agent = await env.prisma.agent.create({ data: { id: 'ag-helper', name: 'helper', userId: env.userId } });
    await env.prisma.agentRole.create({ data: { agentId: agent.id, roleId: 'operator' } });
    const mk = async (n: string, roles: string[]) => {
      const u = await mkUser(env, n);
      for (const r of ['operator', ...roles]) await env.prisma.userRole.create({ data: { userId: u.id, roleId: r } });
      return u;
    };
    const none = await mk('noagent', []);
    const named = await mk('named', ['agent:helper']);
    const any = await mk('anyagent', ['agent:*']);
    const desk = await mk('desk', ['helpdesk']);

    const refused = await addressAgent(env, agent.id, none.id);
    assert.equal(refused.status, 'FAILED');
    assert.match(refused.blocked.reason, /may not address agent 'helper'/);
    assert.equal(ran.length, 0);

    assert.equal((await addressAgent(env, agent.id, named.id)).status, 'COMPLETED');
    assert.equal((await addressAgent(env, agent.id, any.id)).status, 'COMPLETED');
    assert.equal((await addressAgent(env, agent.id, desk.id)).status, 'FAILED');

    // The agent definition's requiredRole grants it
    const engine = (env.processor as any).engine;
    engine.agents ??= new Map<string, any>();
    engine.agents.set('helper', { requiredRole: 'helpdesk' });
    env.processor.invalidateDefinitions();
    assert.equal((await addressAgent(env, agent.id, desk.id)).status, 'COMPLETED');
    assert.equal(ran.length, 3);
  } finally { await env.cleanup(); }
});

test('actions: db.status / db.export need their role (or a super-admin); unknown actions are super-admin only', async () => {
  const { AccessService } = await import('../../src/services/AccessService.ts');
  const { env } = await setup('action_access');
  try {
    await mkRole(env, 'curator:db:export'); await mkRole(env, 'viewer');
    const plain = await mkUser(env, 'plainuser');
    await env.prisma.userRole.create({ data: { userId: plain.id, roleId: 'viewer' } });
    const exporter = await mkUser(env, 'exporter');
    await env.prisma.userRole.create({ data: { userId: exporter.id, roleId: 'curator:db:export' } });

    assert.equal((await AccessService.canUse(env.prisma, { userId: plain.id }, 'action', 'db.export')).allowed, false);
    assert.equal((await AccessService.canUse(env.prisma, { userId: exporter.id }, 'action', 'db.export')).allowed, true);
    assert.equal((await AccessService.canUse(env.prisma, { userId: exporter.id }, 'action', 'db.status')).allowed, false);
    assert.deepEqual(await AccessService.allowedActions(env.prisma, { userId: exporter.id }, ['db.status', 'db.export']), ['db.export']);
    assert.equal((await AccessService.canUse(env.prisma, { userId: exporter.id }, 'action', 'something.else')).allowed, false);
    assert.equal((await AccessService.canUse(env.prisma, { userId: env.userId }, 'action', 'something.else')).allowed, true);
    assert.equal((await AccessService.canUse(env.prisma, {}, 'action', 'db.status')).allowed, false);
  } finally { await env.cleanup(); }
});
