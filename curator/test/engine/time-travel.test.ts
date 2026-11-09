import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst } from '../helpers/harness.ts';
import { conversation_fork } from '../../src/tools/timeTravel.ts';
import { TimeTravelService, decideReplay, indexRun } from '../../src/engine/TimeTravel.ts';

const tool = (name: string, args: any = {}, extra: any = {}) => ({ type: 'Curator_Tool', toolName: name, args, ...extra });
const ask = { type: 'Curator_HumanInput', prompt: 'Colour?', inputType: 'text', as: 'pick' };
/** fetch (tool) → ask (human) → act (tool) */
const flow = { type: 'Curator_Sequential', subAgents: [tool('fetch'), ask, tool('act')] };

const calls = (env: any, name: string) => env.calls.filter((c: any) => c.tool === name).length;
const stateOf = async (env: any, conversationId: number) =>
  (await env.prisma.conversation.findUnique({ where: { id: conversationId } })).metadata || {};
const stepOf = async (env: any, conversationId: number, toolName: string) =>
  (await env.prisma.request.findMany({ where: { conversationId }, orderBy: { id: 'asc' } }))
    .find((r: any) => r.ast?.toolName === toolName || (toolName === 'ask' && r.ast?.type === 'Curator_HumanInput'));

/** Runs the flow to the end in the env's conversation, answering the prompt with `colour`. */
async function runOriginal(env: any, colour = 'blue') {
  await runAst(env, flow);
  const [open] = await env.processor.listInterrupts({ projectIds: [] });
  await env.processor.resumeInterrupt({ interruptId: open.id, value: colour, userId: env.userId, projectIds: [] });
  const done = await env.processor.stepUntil({ conversationId: env.conversationId });
  assert.equal(done.done, true);
}

const canned = () => ({ fetch: () => ({ price: 10 }), act: () => ({ acted: true }) });

// --- pure parts ---

test('time travel: paths follow creation order per creator', () => {
  const rows = [
    { requestId: 1, createdBy: null, status: 'COMPLETED', nodeType: 'Curator_Sequential' },
    { requestId: 4, createdBy: 1, status: 'COMPLETED', nodeType: 'Curator_Tool' },
    { requestId: 2, createdBy: 1, status: 'COMPLETED', nodeType: 'Curator_Tool' },
    { requestId: 3, createdBy: 2, status: 'COMPLETED', nodeType: 'Curator_Tool' },
  ];
  const { pathOf } = indexRun(rows as any, 1);
  assert.deepEqual([...pathOf.entries()].sort(), [[1, 'r'], [2, 'r.0'], [3, 'r.0.0'], [4, 'r.1']]);
});

test('time travel: replay decisions', () => {
  const spec = { from: 1, atRequestId: 10, boundaryPath: 'r.0', rootRequestId: 1, atFinished: [1000, 7] as [number, number] };
  const orig = (over: any = {}) => ({ requestId: 5, path: 'r.0', finished: [1000, 6], status: 'COMPLETED', nodeType: 'Curator_Tool', astHash: 'h', context: {}, statePatches: [], result: 'x', ...over });
  const tool = { type: 'Curator_Tool' };
  assert.equal(decideReplay(spec, orig(), tool, 'h', false).action, 'replay');
  assert.equal(decideReplay(spec, orig(), { type: 'Curator_Sequential' }, 'h', false).action, 'live', 'control flow always runs');
  assert.equal(decideReplay(spec, orig({ requestId: 2, finished: [1000, 8] }), tool, 'h', false).action, 'live', 'finished after the fork point, though created before it');
  assert.equal(decideReplay(spec, orig({ finished: [999, 9] }), tool, 'h', false).action, 'replay', 'an earlier finish time wins over the row id');
  assert.equal(decideReplay(spec, orig({ finished: null }), tool, 'h', false).action, 'live', 'no record of finishing');
  assert.equal(decideReplay(spec, orig({ status: 'WAITING_FOR_USER' }), tool, 'h', false).action, 'live', 'unfinished in the original');
  assert.equal(decideReplay(spec, orig(), tool, 'other', false).action, 'diverge');
  assert.equal(decideReplay(spec, undefined, tool, 'h', false).action, 'diverge');
  assert.equal(decideReplay(spec, undefined, tool, 'h', true).action, 'live', 'past the fork point new steps run');
  const newer = { ...spec, scriptVersion: 3, originalScriptVersion: 2 };
  assert.equal(decideReplay(newer, orig(), tool, 'other', false).action, 'live', 'a newer script runs changed steps live');
  assert.equal((decideReplay(spec, orig({ requestId: 10, finished: [1000, 7] }), tool, 'h', false) as any).boundary, true);
});

// --- engine ---

test('time travel: steps record lineage, state events record their step, checkpoints list them', async () => {
  const env = await createEnv('tt_checkpoints', canned());
  try {
    await runOriginal(env);
    const fetch = await stepOf(env, env.conversationId, 'fetch');
    const root = (await env.prisma.request.findMany({ where: { conversationId: env.conversationId }, orderBy: { id: 'asc' } }))[0];
    assert.equal(fetch.context.__createdBy, root.id);

    const checkpoints = await env.processor.listCheckpoints(env.conversationId, []);
    const fetchPoint = checkpoints.find((c: any) => c.requestId === fetch.id);
    assert.ok(fetchPoint, 'the fetch output merged into state is attributed to the fetch step');
    assert.deepEqual(fetchPoint.keys, ['price']);
    assert.equal(fetchPoint.forkable, true);

    const before = await env.processor.stateAtCheckpoint(env.conversationId, fetchPoint.seq, []);
    assert.equal(before.price, 10);
    assert.equal(before.pick, undefined, 'the answer came later');
    await assert.rejects(env.processor.listCheckpoints(env.conversationId, ['other-project']), /not found/);
  } finally {
    await env.cleanup();
  }
});

test('time travel: a fork replays steps up to the fork point, applies the patch, then runs live', async () => {
  const env = await createEnv('tt_fork_after_fetch', canned());
  try {
    await runOriginal(env);
    const fetch = await stepOf(env, env.conversationId, 'fetch');
    const fork = await env.processor.forkConversation({ conversationId: env.conversationId, atRequestId: fetch.id, statePatch: { price: 99 }, userId: env.userId, projectIds: [] });
    assert.equal(fork.boundaryPath, 'r.2', 'a Sequential creates its steps last to first');

    const parked = await env.processor.stepUntil({ conversationId: fork.conversationId });
    assert.equal(parked.waiting, true, 'the prompt after the fork point asks again');
    assert.equal(calls(env, 'fetch'), 1, 'fetch was replayed, not called again');
    assert.equal((await stateOf(env, fork.conversationId)).price, 99, 'the patch overrides the replayed output');

    const [open] = await env.processor.listInterrupts({ projectIds: [], conversationId: fork.conversationId });
    await env.processor.resumeInterrupt({ interruptId: open.id, value: 'green', userId: env.userId, projectIds: [] });
    assert.equal((await env.processor.stepUntil({ conversationId: fork.conversationId })).done, true);
    assert.equal(calls(env, 'act'), 2, 'act runs live in the fork');
    assert.equal((await stateOf(env, fork.conversationId)).pick, 'green');
    assert.equal((await stateOf(env, env.conversationId)).pick, 'blue', 'the original is unchanged');
    assert.equal((await stateOf(env, env.conversationId)).price, 10);
  } finally {
    await env.cleanup();
  }
});

test('time travel: forking after a prompt replays the answer instead of asking again', async () => {
  const env = await createEnv('tt_fork_after_ask', canned());
  try {
    await runOriginal(env, 'blue');
    const askStep = await stepOf(env, env.conversationId, 'ask');
    const fork = await env.processor.forkConversation({ conversationId: env.conversationId, atRequestId: askStep.id, userId: env.userId, projectIds: [] });
    const done = await env.processor.stepUntil({ conversationId: fork.conversationId });
    assert.equal(done.done, true, 'nothing waits: the answer was replayed');
    assert.equal(calls(env, 'fetch'), 1);
    assert.equal(calls(env, 'act'), 2);
    assert.equal((await stateOf(env, fork.conversationId)).pick, 'blue', 'the state the answer wrote is replayed too');
  } finally {
    await env.cleanup();
  }
});

test('time travel: a step that no longer matches the recording stops the fork instead of running', async () => {
  const env = await createEnv('tt_diverge', canned());
  try {
    await runOriginal(env);
    const fetch = await stepOf(env, env.conversationId, 'fetch');
    const askStep = await stepOf(env, env.conversationId, 'ask');
    // Pretend the recorded fetch step was a different node (rows are written in batches: flush them first)
    await (env.processor as any).trace.flush();
    await env.prisma.stepTrace.updateMany({ where: { requestId: fetch.id }, data: { astHash: 'something-else' } });
    const fork = await env.processor.forkConversation({ conversationId: env.conversationId, atRequestId: askStep.id, userId: env.userId, projectIds: [] });
    await env.processor.stepUntil({ conversationId: fork.conversationId });
    assert.equal(calls(env, 'fetch'), 1, 'the diverged tool did not run again');
    assert.equal(calls(env, 'act'), 1);
    const forkFetch = await stepOf(env, fork.conversationId, 'fetch');
    assert.equal(forkFetch.status, 'FAILED');
    const [response] = await env.prisma.response.findMany({ where: { requestId: forkFetch.id } });
    assert.match(response.content, /Fork replay diverged at step r\.2/);
  } finally {
    await env.cleanup();
  }
});

test('time travel: forks need a finished recorded step and a visible conversation', async () => {
  const env = await createEnv('tt_fork_checks', canned());
  try {
    await runOriginal(env);
    const root = (await env.prisma.request.findMany({ where: { conversationId: env.conversationId }, orderBy: { id: 'asc' } }))[0];
    const fetch = await stepOf(env, env.conversationId, 'fetch');
    const fork = (over: any) => env.processor.forkConversation({ conversationId: env.conversationId, userId: env.userId, projectIds: [], ...over });
    await assert.rejects(fork({ atRequestId: root.id }), /not a finished, recorded step/);
    await assert.rejects(fork({}), /needs atRequestId or atSeq/);
    await assert.rejects(fork({ atRequestId: fetch.id, projectIds: ['p-other'] }), /not found/);
    const point = (await env.processor.listCheckpoints(env.conversationId, [])).find((c: any) => c.requestId === fetch.id);
    const viaSeq = await fork({ atSeq: point.seq });
    assert.equal(viaSeq.boundaryPath, 'r.2');
  } finally {
    await env.cleanup();
  }
});

test('time travel: conversation_fork refuses agents and uses the session project', async () => {
  const calls: any[] = [];
  const api = { checkpoints: async () => [], stateAt: async () => ({}), fork: async (input: any) => { calls.push(input); return { conversationId: 9, rootRequestId: 1, boundaryPath: 'r.0' }; } };
  const ctx = (extra: any) => ({ userId: 'u1', projectId: 'p1', tryService: (key: any) => (key === TimeTravelService ? api : undefined), ...extra });
  await assert.rejects(conversation_fork.runAsync({ args: { conversationId: 1, atRequestId: 2 }, toolContext: ctx({ agentId: 'bot' }) }), /human callers/);
  await conversation_fork.runAsync({ args: { conversationId: 1, atRequestId: 2 }, toolContext: ctx({}) });
  assert.deepEqual(calls, [{ conversationId: 1, atRequestId: 2, userId: 'u1', projectIds: ['p1'] }]);
});
