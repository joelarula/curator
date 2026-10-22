import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, compileFixture, runAst, snapshotDb, assertGolden } from '../helpers/harness.ts';

const echo = (a: any) => ({ echoed: a.text });

const cases: Array<{ fixture: string; expectedEchoes: string[] }> = [
  { fixture: 'if_else', expectedEchoes: ['high'] },
  { fixture: 'for_each', expectedEchoes: ['a', 'b', 'c'] },
  { fixture: 'while_loop', expectedEchoes: ['tick', 'tick', 'tick'] },
];

for (const { fixture, expectedEchoes } of cases) {
  test(`${fixture}: runs to completion with deterministic DB state`, async () => {
    const env = await createEnv(fixture, { echo });
    try {
      const { requestId, result } = await runAst(env, await compileFixture(`${fixture}.coffee`));

      assert.equal(result.done, true);
      assert.deepEqual(env.calls.map((c) => c.args.text), expectedEchoes);
      const root = await env.prisma.request.findUnique({ where: { id: requestId } });
      assert.equal(root.status, 'COMPLETED');

      assertGolden(`${fixture}.db.json`, await snapshotDb(env));
    } finally {
      await env.cleanup();
    }
  });
}

test('wait_emit: parks on the event, resumes with the payload when emitted', async () => {
  const env = await createEnv('wait_emit', { echo });
  try {
    const { requestId, result } = await runAst(env, await compileFixture('wait_emit.coffee'));

    assert.equal(result.waiting, true);
    assert.equal(result.waitEvent, 'go');
    assert.equal(env.calls.length, 0);

    await env.processor.emitEventRequest({
      eventName: 'go',
      payload: { msg: 'hi' },
      conversationId: env.conversationId,
      userId: env.userId,
      origin: 'API',
    });
    const resumed = await env.processor.stepUntil({ conversationId: env.conversationId });

    assert.equal(resumed.done, true);
    assert.deepEqual(env.calls.map((c) => c.args.text), ['hi']);
    const root = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(root.status, 'COMPLETED');

    assertGolden('wait_emit.db.json', await snapshotDb(env));
  } finally {
    await env.cleanup();
  }
});

test('tool_error: a throwing tool is recorded as a Response and does not crash the engine', async () => {
  const env = await createEnv('tool_error', {
    echo,
    boom: () => {
      throw new Error('kaboom');
    },
  });
  try {
    const { result } = await runAst(env, await compileFixture('tool_error.coffee'));
    assert.equal(result.done, true);

    const snap = await snapshotDb(env);
    assert.ok(snap.responses.some((r: any) => String(r.content).includes('[Tool Error] kaboom')));
    assertGolden('tool_error.db.json', snap);
  } finally {
    await env.cleanup();
  }
});
