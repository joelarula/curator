import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv } from '../helpers/harness.ts';
import {
  appendStatePatch,
  applyPatch,
  foldState,
  listStateEvents,
  rebuildStateSnapshot,
  registerStateProjector,
  rewindState,
  stateAt,
  STATE_PATCH,
  STATE_REWIND,
} from '../../src/engine/ConversationStateLog.ts';
import { entriesFromEvents } from '../../src/engine/llm/ConversationContext.ts';

const patch = (id: number, set: any, scope?: string) => ({ id, eventName: STATE_PATCH, payload: { scope, set } });

test('fold: patches merge, scopes stay private, input is never mutated', () => {
  const a = applyPatch({}, { set: { x: 1 } });
  const b = applyPatch(a, { scope: 'p1', set: { hand: ['As'] } });
  assert.deepEqual(a, { x: 1 });
  assert.deepEqual(b, { x: 1, __scopes: { p1: { hand: ['As'] } } });
});

test('fold: upTo gives past state; rewind restores it; incremental fold equals full fold', () => {
  const log = [
    patch(1, { n: 1 }), patch(3, { n: 2 }), patch(4, { m: 'x' }),
    { id: 6, eventName: STATE_REWIND, payload: { to: 3 } },
    patch(7, { n: 9 }),
  ];
  assert.deepEqual(foldState(log, { upTo: 3 }).state, { n: 2 });
  assert.deepEqual(foldState(log).state, { n: 9 }, 'rewind dropped m, then n was set again');
  assert.deepEqual(foldState(log.slice(0, 4)).state, { n: 2 });
  const head = foldState(log.slice(0, 2));
  assert.deepEqual(foldState(log, { from: head }).state, foldState(log).state);
  assert.throws(() => foldState(log, { from: foldState(log.slice(0, 3)) }), /refold from zero/);
});

test('state log: writes append events, materialize metadata, support time travel and rewind', async () => {
  const env = await createEnv('state_log');
  try {
    const p = env.prisma;
    const id = env.conversationId;
    const first = await appendStatePatch(p, id, { set: { pot: 10 } });
    // Concurrent writers to different keys must not lose each other's update.
    await Promise.all([
      appendStatePatch(p, id, { set: { a: 1 } }),
      appendStatePatch(p, id, { set: { b: 2 } }),
    ]);
    const last = await appendStatePatch(p, id, { set: { pot: 99 } });

    const conv = await p.conversation.findUnique({ where: { id } });
    assert.deepEqual({ ...(conv.metadata as any) }, { pot: 99, a: 1, b: 2, __stateSeq: last.seq });

    assert.deepEqual(await stateAt(p, id, first.seq), { pot: 10 });
    const back = await rewindState(p, id, first.seq);
    assert.deepEqual(back.state, { pot: 10 });
    assert.equal((await listStateEvents(p, id)).length, 5, 'nothing was deleted');
    assert.deepEqual((await stateAt(p, id)), { pot: 10 });

    // The snapshot is only a cache: wipe it and rebuild from the log.
    await p.conversation.update({ where: { id }, data: { metadata: {} } });
    assert.deepEqual((await rebuildStateSnapshot(p, id)).state, { pot: 10 });

    const rows = await p.eventLog.findMany({ where: { conversationId: id } });
    assert.deepEqual(entriesFromEvents(rows), [], 'state events never reach a prompt');
  } finally {
    await env.cleanup();
  }
});

test('state projectors: see each transition in its transaction; a throwing projector rolls the event back', async () => {
  const env = await createEnv('state_projectors');
  try {
    const p = env.prisma;
    const id = env.conversationId;
    const seen: Array<{ eventName: string; previous: any; state: any }> = [];
    const unregister = registerStateProjector(p, ({ event, previous, state }) => {
      seen.push({ eventName: event.eventName, previous, state });
    });

    const first = await appendStatePatch(p, id, { set: { status: 'active' } });
    await appendStatePatch(p, id, { set: { status: 'finished' } });
    await rewindState(p, id, first.seq);
    assert.deepEqual(seen.map((s) => [s.eventName, s.previous.status, s.state.status]), [
      [STATE_PATCH, undefined, 'active'],
      [STATE_PATCH, 'active', 'finished'],
      [STATE_REWIND, 'finished', 'active'],
    ]);

    const failing = registerStateProjector(p, ({ state }) => {
      if (state.status === 'broken') throw new Error('projection failed');
    });
    await assert.rejects(appendStatePatch(p, id, { set: { status: 'broken' } }), /projection failed/);
    assert.equal((await stateAt(p, id)).status, 'active', 'rejected event was not appended');
    assert.equal((await listStateEvents(p, id)).length, 3);

    failing();
    unregister();
    const seenBefore = seen.length;
    await appendStatePatch(p, id, { set: { status: 'paused' } });
    assert.equal(seen.length, seenBefore, 'unregistered projectors no longer fire');
  } finally {
    await env.cleanup();
  }
});
