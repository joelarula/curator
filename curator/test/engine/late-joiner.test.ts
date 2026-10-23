import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst, compileFixture } from '../helpers/harness.ts';

const canned = { heard: (a: any) => a.text };
const T0 = Date.UTC(2100, 0, 1);

async function emit(env: any, text: string) {
  await env.processor.emitEventRequest({
    eventName: 'news', payload: { text },
    conversationId: env.conversationId, userId: env.userId, origin: 'API',
  });
}

test('late joiner: replay catches up on events emitted before it started, in order', async () => {
  let now = T0;
  const env = await createEnv('late_replay', canned, { now: () => now });
  try {
    await emit(env, 'one');
    await emit(env, 'two');
    now += 5_000;
    const { result } = await runAst(env, await compileFixture('late_joiner.coffee'));
    assert.equal(result.done, true);
    assert.deepEqual(env.calls.map((c: any) => c.args.text), ['one', 'two']);
  } finally {
    await env.cleanup();
  }
});

test('late joiner: without replay a new listener does not see older events', async () => {
  let now = T0;
  const env = await createEnv('late_noreplay', canned, { now: () => now });
  try {
    await emit(env, 'one');
    now += 5_000;
    const ast: any = await compileFixture('late_joiner.coffee');
    for (const n of ast.subAgents) if (n.type === 'Curator_WaitEvent') delete n.replay;
    const { result } = await runAst(env, ast);
    assert.equal(result.waiting, true);
    assert.deepEqual(env.calls, []);
    now += 1_000;
    await emit(env, 'two');
    await emit(env, 'three');
    const r = await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.equal(r.done, true);
    assert.deepEqual(env.calls.map((c: any) => c.args.text), ['two', 'three']);
  } finally {
    await env.cleanup();
  }
});
