import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst, compileFixture } from '../helpers/harness.ts';

// Nobody is told who speaks next: after each message every listener bids via an atomic claim tool and
// the first claim for that turn wins the floor.
test('free trilogue: listeners compete for the floor, exactly one speaker per turn', async () => {
  const winners = new Map<number, string>();
  const claim = ({ turn, me }: any) => {
    if (winners.has(turn)) return 'lost';
    winners.set(turn, me);
    return 'won';
  };
  const env = await createEnv('trilogue_free', { heard: () => 'ok', claim });
  try {
    const { requestId, result } = await runAst(env, await compileFixture('trilogue_free.coffee'));
    assert.equal(result.waiting, true);

    await env.processor.emitEventRequest({
      eventName: 'say', payload: { from: 'human', text: 'hello all', n: 0 },
      conversationId: env.conversationId, userId: env.userId, origin: 'API',
    });
    await drain(env);

    const speakers = [...winners.entries()].sort((x, y) => x[0] - y[0]);
    assert.deepEqual(speakers.map(([turn]) => turn), [0, 1, 2, 3, 4, 5], 'one winner for every turn up to the limit');
    for (let i = 1; i < speakers.length; i++) {
      assert.notEqual(speakers[i][1], speakers[i - 1][1], 'the previous speaker never hears its own message, so it cannot take the next turn');
    }

    // Each message n (0..6) is heard by every agent except its sender.
    const heard = env.calls.filter((c: any) => c.tool === 'heard');
    for (let n = 0; n <= 6; n++) {
      const sender = n === 0 ? 'human' : speakers[n - 1][1];
      const listeners = heard.filter((c: any) => c.args.turn === n).map((c: any) => c.args.agent).sort();
      assert.deepEqual(listeners, ['a', 'b', 'c'].filter((x) => x !== sender), `turn ${n}`);
    }

    const root = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(root.status, 'COMPLETED');
  } finally {
    await env.cleanup();
  }
});

async function drain(env: any) {
  for (let idle = 0; idle < 3; ) {
    const n = await env.processor.step({ conversationId: env.conversationId, take: 10 });
    idle = n > 0 ? 0 : idle + 1;
  }
}

// The floor order (a, c, b, c, a, b, c) lives in the fixture. It is not a ring, c speaks twice, and nobody speaks twice in a row.
test('trilogue: three agents hold a free conversation, each answering only when given the floor', async () => {
  const env = await createEnv('trilogue', { heard: () => 'ok' });
  try {
    const { requestId, result } = await runAst(env, await compileFixture('trilogue.coffee'));
    assert.equal(result.waiting, true);

    await env.processor.emitEventRequest({
      eventName: 'say', payload: { from: 'human', to: 'a', text: 'hello all', n: 0 },
      conversationId: env.conversationId, userId: env.userId, origin: 'API',
    });
    await drain(env);

    // Everyone hears every message except their own; nobody hears the same message twice.
    const heard = (name: string) => env.calls.filter((c: any) => c.tool === 'heard' && c.args.agent === name).map((c: any) => c.args.from);
    assert.deepEqual(heard('a'), ['human', 'c', 'b', 'c', 'b']);
    assert.deepEqual(heard('b'), ['human', 'a', 'c', 'c', 'a']);
    assert.deepEqual(heard('c'), ['human', 'a', 'b', 'a', 'b']);

    const root = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(root.status, 'COMPLETED', 'all three agents stop once the turn limit is reached');
  } finally {
    await env.cleanup();
  }
});
