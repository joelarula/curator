import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst } from '../helpers/harness.ts';
import { validateCuratorAst, unregisterAstExtensionType } from '../../src/engine/CuratorAstValidation.ts';
import { CuratorRequestProcessor } from '../../src/engine/CuratorRequestProcessor.ts';
import { setStateNode, reduceNode, type NodeContext, type NodeHandler } from '../../src/engine/nodes/index.ts';

const status = async (env: any, id: number) => (await env.prisma.request.findUnique({ where: { id } })).status;

// A plugin node type: doubles a state value. Only uses NodeContext, like a Bevy system only uses its params.
const doubleNode: NodeHandler<{ type: 'Game_Double'; key: string }> = {
  type: 'Game_Double',
  validate: (node) => (typeof node.key === 'string' && node.key ? [] : ['key must be a non-empty string']),
  async run(node, req, ctx) {
    const scope = ctx.parseContext(req.context).__scope;
    const state = await ctx.readState(req.conversationId, scope);
    await ctx.writeState(req.conversationId, scope, { [node.key]: (state[node.key] ?? 0) * 2 });
    await ctx.saveResponse(req, `doubled ${node.key}`);
    await ctx.completeRequest(req.id, 'COMPLETED');
  },
};

test('node registry: a plugin node type runs nested inside built-ins and is validated by its own hook', async () => {
  const env = await createEnv('node_registry_plugin', {}, { nodeHandlers: [doubleNode] });
  try {
    assert.equal(validateCuratorAst({ type: 'Game_Double' }).valid, false);
    assert.match(validateCuratorAst({ type: 'Game_Double' }).errors.join(), /key must be a non-empty string/);

    const { requestId } = await runAst(env, { type: 'Curator_Sequential', name: 's', subAgents: [
      { type: 'Curator_SetState', state: { gold: 21 } },
      { type: 'Game_Double', key: 'gold' },
    ] });
    assert.equal(await status(env, requestId), 'COMPLETED');
    const conv = await env.prisma.conversation.findUnique({ where: { id: env.conversationId } });
    assert.equal((conv.metadata as any).gold, 42);
  } finally {
    unregisterAstExtensionType('Game_Double');
    await env.cleanup();
  }
});

test('node registry: built-in types are reserved for extension and need override to replace', () => {
  const processor = new CuratorRequestProcessor({}, { engine: { tools: new Map() } });
  assert.throws(() => processor.registerNodeHandler({ type: 'Curator_SetState', run: async () => {} }), /already registered/);
  processor.registerNodeHandler({ type: 'Curator_SetState', run: async () => {} }, { override: true });
  assert.throws(() => processor.registerNodeHandler({ type: 'Curator_New', run: async () => {} }), /reserved/);
});

test('node handler: SetState runs against a fake context', async () => {
  const calls: string[] = [];
  const ctx = {
    isDynamicExpr: (v: unknown): v is string => typeof v === 'string' && v.startsWith('$'),
    evaluateArgs: async (args: any) => args,
    parseContext: (c: any) => c || {},
    writeState: async (_c: any, scope: any, updates: any) => { calls.push(`write:${scope ?? ''}:${JSON.stringify(updates)}`); },
    saveResponse: async (_r: any, content: string) => { calls.push(`save:${content}`); },
    completeRequest: async (id: number, s?: string) => { calls.push(`complete:${id}:${s}`); },
  } as unknown as NodeContext;
  await setStateNode.run({ type: 'Curator_SetState', state: { a: 1 } }, { id: 7, conversationId: 1, context: { __scope: 'p1' } }, ctx);
  assert.deepEqual(calls, [
    'write:p1:{"a":1}',
    'save:{"status":"State updated","state":{"a":1}}',
    'complete:7:COMPLETED',
  ]);
});

test('node handler: Reduce only needs the tools service from its fake context', async () => {
  const calls: string[] = [];
  const ctx = {
    tools: { reducer: (name: string) => (name === 'sum' ? (a: any) => ({ total: a.x + a.y }) : undefined) },
    isDynamicExpr: () => false,
    evaluateArgs: async (args: any) => args,
    prisma: { request: { update: async ({ data }: any) => { calls.push(`context:${JSON.stringify(data.context)}`); } } },
    saveResponse: async (_r: any, content: string) => { calls.push(`save:${content}`); },
    completeRequest: async (id: number, s?: string) => { calls.push(`complete:${id}:${s}`); },
  } as unknown as NodeContext;
  await reduceNode.run({ type: 'Curator_Reduce', reducer: 'sum', args: { x: 2, y: 3 }, as: 'out' }, { id: 9, context: {} }, ctx);
  assert.deepEqual(calls, [
    'context:{"out":{"total":5},"total":5}',
    'save:{"total":5}',
    'complete:9:COMPLETED',
  ]);
  await assert.rejects(reduceNode.run({ type: 'Curator_Reduce', reducer: 'nope' }, { id: 10, context: {} }, ctx), /Reducer nope not found/);
});

test('maintenance systems: ordered, positionable, and disableable per processor', () => {
  const processor = new CuratorRequestProcessor({}, { engine: { tools: new Map() }, disabledMaintenance: ['pruneReadOnlyRequests'] });
  assert.deepEqual(processor.maintenanceSystems(), [
    'unlockStaleRequests', 'pollScheduledAgents', 'expireApprovalWaits', 'expireHumanWaits', 'resumeUserResponses',
  ]);
  const noop = (name: string) => ({ name, run: async () => {} });
  processor.registerMaintenanceSystem(noop('first'), { before: 'unlockStaleRequests' });
  processor.registerMaintenanceSystem(noop('afterApprovals'), { after: 'expireApprovalWaits' });
  processor.registerMaintenanceSystem(noop('last'));
  assert.throws(() => processor.registerMaintenanceSystem(noop('last')), /already registered/);
  assert.throws(() => processor.registerMaintenanceSystem(noop('x'), { after: 'missing' }), /Unknown maintenance system/);
  assert.equal(processor.removeMaintenanceSystem('pollScheduledAgents'), true);
  assert.deepEqual(processor.maintenanceSystems(), [
    'first', 'unlockStaleRequests', 'expireApprovalWaits', 'afterApprovals', 'expireHumanWaits', 'resumeUserResponses', 'last',
  ]);
});
