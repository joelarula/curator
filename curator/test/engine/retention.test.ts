import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst, runScript, saveScript } from '../helpers/harness.ts';
import { pruneConversationHistory, deleteInChunks } from '../../src/engine/Retention.ts';
import { appendStatePatch, compactConversationLog, readSnapshot, rebuildStateSnapshot } from '../../src/engine/ConversationStateLog.ts';

const tool = (name: string, args: any = {}, as?: string) => ({ type: 'Curator_Tool', toolName: name, args, ...(as ? { as } : {}) });

const callModule = () => ({
  type: 'Curator_Module',
  name: 'doubler',
  main: {
    type: 'Curator_Sequential',
    name: 'main',
    subAgents: [
      { type: 'Curator_Call', ref: '#double', args: { n: 21 }, as: 'result' },
      tool('record', { value: '$state.result' }),
    ],
  },
  subroutines: {
    double: {
      params: { n: { type: 'number' } },
      returns: '$state.doubled',
      body: { type: 'Curator_Sequential', name: 'doubleBody', subAgents: [{ type: 'Curator_Assign', key: 'doubled', expression: '$params.n * 2' }] },
    },
  },
});

const canned = { record: (a: any) => ({ got: a.value }), echo: (a: any) => ({ echoed: a.text }) };
const trim = { retention: { completedContext: 'trim' } };

test('retention: trimmed contexts do not change results (call returns reads the callee context before it is trimmed)', async () => {
  const env = await createEnv('retention_call', canned, trim);
  try {
    const saved = await saveScript(env, 'doubler', callModule());
    const { requestId, result } = await runScript(env, saved.scriptId, saved.version);
    assert.equal(result.done, true);
    assert.deepEqual(env.calls.map((c) => c.args.value), [42]);

    const requests = await env.prisma.request.findMany({ orderBy: { id: 'asc' } });
    assert.ok(requests.every((r: any) => r.status === 'COMPLETED'));
    const trimmed = requests.filter((r: any) => r.context === null);
    assert.ok(trimmed.length > 0, 'consumed children are trimmed when their parent runs');
    assert.ok(trimmed.every((r: any) => r.notifyId != null), 'roots keep their context until the sweep');
    assert.notEqual(requests.find((r: any) => r.id === requestId).context, null);
  } finally {
    await env.cleanup();
  }
});

test('retention: the sweep trims finished requests past the grace period, then nothing is left to trim', async () => {
  const env = await createEnv('retention_sweep', canned, trim);
  try {
    const ast = {
      type: 'Curator_Sequential',
      name: 'steps',
      subAgents: [tool('echo', { text: 'a' }), tool('echo', { text: '$state.echoed' }), tool('record', { value: '$state.echoed' })],
    };
    const { result } = await runAst(env, ast);
    assert.equal(result.done, true);
    assert.deepEqual(env.calls.map((c) => c.args.value ?? c.args.text), ['a', 'a', 'a']);

    assert.equal(await env.processor.trimCompletedContexts(true), 0, 'nothing is trimmed inside the grace period');
    await env.prisma.request.updateMany({ data: { updatedAt: new Date(Date.now() - 60 * 60 * 1000) } });
    assert.ok((await env.processor.trimCompletedContexts(true)) > 0);
    const left = await env.prisma.request.findMany({ where: { status: 'COMPLETED' } });
    assert.ok(left.every((r: any) => r.context === null));
    assert.equal(await env.processor.trimCompletedContexts(true), 0);
  } finally {
    await env.cleanup();
  }
});

test('retention: completedContext keep leaves every context in place', async () => {
  const env = await createEnv('retention_keep', canned, { retention: { completedContext: 'keep' } });
  try {
    const saved = await saveScript(env, 'doubler', callModule());
    await runScript(env, saved.scriptId, saved.version);
    await env.prisma.request.updateMany({ data: { updatedAt: new Date(Date.now() - 60 * 60 * 1000) } });
    assert.equal(await env.processor.trimCompletedContexts(true), 0);
    const requests = await env.prisma.request.findMany();
    assert.ok(requests.every((r: any) => r.context !== null));
  } finally {
    await env.cleanup();
  }
});

test('retention: pruning a finished conversation removes its requests, responses and dispatched events', async () => {
  const env = await createEnv('retention_prune', canned, trim);
  try {
    const { result } = await runScript(env, (await saveScript(env, 'doubler', callModule())).scriptId);
    assert.equal(result.done, true);
    const { conversationId } = await env.prisma.request.findFirstOrThrow();
    await env.prisma.busEvent.createMany({ data: [{ conversationId, eventName: 'a' }, { conversationId, eventName: 'b' }] });

    const pruned = await pruneConversationHistory(env.prisma, conversationId);
    assert.ok(pruned.requests > 0);
    assert.equal(await env.prisma.request.count({ where: { conversationId } }), 0);
    assert.equal(await env.prisma.busEvent.count({ where: { conversationId } }), 0);
    assert.equal(await env.prisma.response.count({ where: { conversationId } }), 0);
  } finally {
    await env.cleanup();
  }
});

test('retention: compaction removes a long log in batches and the one event left rebuilds the same state', async () => {
  const env = await createEnv('retention_compact_batches');
  try {
    const conversationId = env.conversationId;
    await env.prisma.eventLog.createMany({
      data: Array.from({ length: 1200 }, (_, i) => ({ conversationId, eventName: 'noise', payload: { i } })),
    });
    await appendStatePatch(env.prisma, conversationId, { set: { a: 1 } });
    await appendStatePatch(env.prisma, conversationId, { scope: 'seat', set: { b: 2 } });
    const before = readSnapshot((await env.prisma.conversation.findUnique({ where: { id: conversationId } })).metadata).state;

    assert.equal(await compactConversationLog(env.prisma, conversationId), 1202);
    assert.equal(await env.prisma.eventLog.count({ where: { conversationId } }), 1);
    assert.deepEqual((await rebuildStateSnapshot(env.prisma, conversationId)).state, before);
  } finally {
    await env.cleanup();
  }
});

test('retention: deleteInChunks removes every match across several batches and nothing else', async () => {
  const env = await createEnv('retention_delete_chunks');
  try {
    await env.prisma.eventLog.createMany({
      data: Array.from({ length: 7 }, (_, i) => ({ conversationId: env.conversationId, eventName: i % 2 ? 'odd' : 'even' })),
    });
    assert.equal(await deleteInChunks(env.prisma.eventLog, { eventName: 'even' }, 2), 4);
    assert.deepEqual((await env.prisma.eventLog.findMany()).map((e: any) => e.eventName), ['odd', 'odd', 'odd']);
  } finally {
    await env.cleanup();
  }
});
