import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst, compileFixture } from '../helpers/harness.ts';

const T0 = Date.UTC(2100, 0, 1);

async function drain(env: any) {
  for (let idle = 0; idle < 3; ) {
    const n = await env.processor.step({ conversationId: env.conversationId, take: 10 });
    idle = n > 0 ? 0 : idle + 1;
  }
}

// Nobody starts the conversation: a is the most impatient (10s) and speaks up on its own. b and c hear it
// and both answer at the same moment (simultaneous speech is allowed); a then hears both answers.
test('spontaneous dialogue: one agent starts on its own, the others answer simultaneously', async () => {
  let now = T0;
  const env = await createEnv('spontaneous', { heard: () => 'ok', spoke: () => 'ok' }, { now: () => now });
  try {
    const { result } = await runAst(env, await compileFixture('spontaneous.coffee'));
    assert.equal(result.waiting, true);

    now += 5_000;
    await drain(env);
    assert.deepEqual(env.calls, [], 'a silent room stays silent until someone is impatient');

    now += 6_000;
    await drain(env);
    const spoke = env.calls.filter((c: any) => c.tool === 'spoke').map((c: any) => `${c.args.agent}:${c.args.kind}`);
    assert.equal(spoke[0], 'a:opener', 'a starts without being asked');
    assert.deepEqual(spoke.slice(1).sort(), ['b:answer', 'c:answer'], 'b and c answer simultaneously');

    const heardBy = (name: string) => env.calls.filter((c: any) => c.tool === 'heard' && c.args.agent === name).map((c: any) => c.args.from).sort();
    assert.deepEqual(heardBy('b'), ['a', 'c'], 'b hears the opener and the simultaneous answer from c');
    assert.deepEqual(heardBy('c'), ['a', 'b']);
    assert.deepEqual(heardBy('a'), ['b', 'c'], 'a hears both answers, none lost');
  } finally {
    await env.cleanup();
  }
});
