import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst } from '../helpers/harness.ts';
import { validateCuratorAst, unregisterAstExtensionType } from '../../src/engine/CuratorAstValidation.ts';
import { CuratorRequestProcessor } from '../../src/engine/CuratorRequestProcessor.ts';
import { setStateNode, reduceNode, agentNode, defineService, provide, type NodeContext, type NodeHandler } from '../../src/engine/nodes/index.ts';
import { CuratorEngine } from '../../src/engine/CuratorEngine.ts';

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

test('node handler: Agent runs against a fake LLM provider from ctx.llm (no registry, no database)', async () => {
  const calls: string[] = [];
  const seen: any[] = [];
  const ctx = {
    llm: { provider: () => ({ providerName: 'fake', generateContent: async (r: any) => { seen.push(r); return { text: '{"move":"fold"}', finishReason: 'stop' }; } }) },
    interpolateTemplate: async (t: string | undefined) => t,
    isDynamicExpr: () => false,
    saveResponse: async (_r: any, content: string) => { calls.push(`save:${content}`); },
    completeRequest: async (id: number, s?: string) => { calls.push(`complete:${id}:${s}`); },
  } as unknown as NodeContext;
  const req: any = { id: 3, context: {} };
  await agentNode.run({ type: 'Curator_Agent', agentName: 'dealer_bot', prompt: 'Your move?', instruction: 'Play poker.', include_contents: 'none' }, req, ctx);
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].messages, [{ role: 'user', content: 'Your move?' }]);
  assert.equal(seen[0].systemPrompt, 'Play poker.');
  assert.deepEqual(req.context.dealerBot, { move: 'fold' }, 'output is stored under the camelCased agentName');
  assert.deepEqual(calls, ['save:{"move":"fold"}', 'complete:3:COMPLETED']);
});

// A plugin in the Bevy sense: it adds a node type (system), the service it depends on (resource) and a poll pass.
interface Bank { balance(player: string): number; withdraw(player: string, amount: number): void }
const BankKey = defineService<Bank>('poker.bank');
const payoutNode: NodeHandler<{ type: 'Poker_Payout'; player: string; amount: number }> = {
  type: 'Poker_Payout',
  async run(node, req, ctx) {
    const bank = ctx.service(BankKey);
    bank.withdraw(node.player, node.amount);
    await ctx.saveResponse(req, `paid ${node.amount}, left ${bank.balance(node.player)}`);
    await ctx.completeRequest(req.id, 'COMPLETED');
  },
};
const makeBank = (start: number): Bank & { ledger: number } => ({
  ledger: start,
  balance() { return this.ledger; },
  withdraw(_p, amount) { this.ledger -= amount; },
});

test('plugins: node types, services and maintenance systems contributed through registerPlugin', async () => {
  const engine = new CuratorEngine();
  const bank = makeBank(100);
  const ticks: string[] = [];
  engine.registerPlugin({
    name: 'poker-test',
    services: [provide(BankKey, bank)],
    nodeHandlers: [payoutNode],
    maintenanceSystems: [{ name: 'poker.audit', run: async (ctx) => { ticks.push(`audit:${ctx.service(BankKey).balance('p1')}`); } }],
  });
  const env = await createEnv('node_registry_plugin_services', {}, { engine });
  try {
    const { requestId } = await runAst(env, { type: 'Curator_Sequential', name: 's', subAgents: [
      { type: 'Poker_Payout', player: 'p1', amount: 30 },
      { type: 'Poker_Payout', player: 'p1', amount: 20 },
    ] });
    assert.equal(await status(env, requestId), 'COMPLETED');
    assert.equal(bank.ledger, 50);
    const contents = (await env.prisma.response.findMany({ orderBy: { id: 'asc' } })).map((r: any) => r.content);
    assert.deepEqual(contents.filter((c: string) => c.startsWith('paid')), ['paid 30, left 70', 'paid 20, left 50']);

    // Plugin systems join the schedule after the processor's own ones and can be disabled per processor.
    assert.equal(env.processor.maintenanceSystems().at(-1), 'poker.audit');
    const p = env.processor as any;
    for (const system of p.scheduledMaintenance()) if (system.name === 'poker.audit') await system.run(p.maintenanceContext);
    assert.deepEqual(ticks, ['audit:50'], 'plugin systems reach plugin services');
    assert.equal(env.processor.removeMaintenanceSystem('poker.audit'), true);
    assert.equal(env.processor.maintenanceSystems().includes('poker.audit'), false);
    assert.deepEqual(engine.maintenanceSystems.map(s => s.name), ['poker.audit'], 'other processors keep it');
    assert.throws(() => engine.registerPlugin({ name: 'dup', services: [provide(BankKey, makeBank(0))] }), /already provided/);
  } finally {
    engine.nodes.unregister('Poker_Payout');
    await env.cleanup();
  }
});

test('services: processor services win over plugin services; missing services fail with the key name', async () => {
  const engine = new CuratorEngine();
  engine.registerPlugin({ name: 'bank-plugin', services: [provide(BankKey, makeBank(100))] });
  const hostBank = makeBank(10);
  const processor = new CuratorRequestProcessor({}, { engine, services: [provide(BankKey, hostBank)] });
  const ctx = (processor as any).nodeContext as NodeContext;
  assert.equal(ctx.service(BankKey), hostBank);

  const Missing = defineService<string>('poker.missing');
  assert.equal(ctx.tryService(Missing), undefined);
  assert.throws(() => ctx.service(Missing), /No service provides 'poker.missing'/);
  processor.provideService(Missing, 'late');
  assert.equal(ctx.service(Missing), 'late');
  // Same name, different key: keys compare by identity, so plugins cannot collide.
  assert.equal(ctx.tryService(defineService<Bank>('poker.bank')), undefined);
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
