import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst } from '../helpers/harness.ts';
import {
  buildContext,
  entryReducer,
  foldConversation,
  MemoryContextStore,
  type ConversationRow,
  type ContextReducer,
} from '../../src/engine/llm/ConversationFold.ts';

const ev = (id: number, from: string, text: string, extra: any = {}): ConversationRow => ({
  kind: 'event',
  row: { id, eventName: 'say', payload: { from, text, ...extra }, target: extra.to ?? null, createdAt: new Date(2100, 0, 1, 0, 0, id) },
});

const room: ConversationRow[] = [
  ev(1, 'human', 'hello'),
  ev(2, 'a', 'hi'),
  ev(3, 'b', 'hey'),
  ev(4, 'a', 'and again'),
  ev(5, 'c', 'yo'),
];

// A use-case reducer: decides per row, keeps state in scratch. Merges consecutive messages from the same
// speaker into the previous turn only when that turn is still in this fold, otherwise appends.
const numbered: ContextReducer = (acc, r) => {
  if (r.kind !== 'event') return;
  const p = r.row.payload;
  if (p.from === acc.viewer) return acc.push({ role: 'assistant', content: p.text });
  acc.scratch.turn = (acc.scratch.turn ?? 0) + 1;
  acc.push({ role: 'user', content: `#${acc.scratch.turn} ${p.from}: ${p.text}` });
};

test('fold: a custom reducer sees each row in order and decides what to push', () => {
  const calls: number[] = [];
  const spy: ContextReducer = (acc, r) => { calls.push(r.row.id); numbered(acc, r); };
  const { snapshot } = foldConversation(room, spy, { viewer: 'a', system: 'You are a.' });
  assert.deepEqual(calls, [1, 2, 3, 4, 5]);
  assert.deepEqual(snapshot.messages.map((m) => m.content), ['#1 human: hello', 'hi', '#2 b: hey', 'and again', '#3 c: yo']);
});

test('fold: only new rows are processed and the earlier messages are carried over untouched', () => {
  const first = foldConversation(room.slice(0, 3), numbered, { viewer: 'a', system: 's' });
  const calls: number[] = [];
  const spy: ContextReducer = (acc, r) => { calls.push(r.row.id); numbered(acc, r); };
  const next = foldConversation(room, spy, { viewer: 'a', system: 's', from: first.snapshot });

  assert.equal(next.reused, true);
  assert.deepEqual(calls, [4, 5], 'rows already in the snapshot are not reprocessed');
  assert.equal(next.cachedCount, 3);
  assert.deepEqual(next.added.map((m) => m.content), ['and again', '#3 c: yo'], 'only the new messages are new');
  assert.equal(next.snapshot.messages[0], first.snapshot.messages[0], 'the cached prefix is the very same objects');

  const full = foldConversation(room, numbered, { viewer: 'a', system: 's' });
  assert.deepEqual(next.snapshot.messages, full.snapshot.messages, 'incremental result equals a full rebuild, scratch state included');
  assert.equal(next.snapshot.prefixHash, full.snapshot.prefixHash);
  assert.notEqual(next.snapshot.prefixHash, first.snapshot.prefixHash);
});

test('fold: the prefix hash is stable while nothing is added, and the prefix cannot be rewritten', () => {
  const a = foldConversation(room, numbered, { viewer: 'a', system: 's' });
  const again = foldConversation([], numbered, { viewer: 'a', system: 's', from: a.snapshot });
  assert.equal(again.snapshot.prefixHash, a.snapshot.prefixHash);
  assert.deepEqual(again.added, []);
  assert.throws(() => { (a.snapshot.messages[0] as any).content = 'tampered'; }, TypeError);
});

test('fold: a changed system prompt, viewer or reducer version invalidates the snapshot and rebuilds in full', () => {
  const base = foldConversation(room, numbered, { viewer: 'a', system: 's', version: 'v1' });
  for (const changed of [{ system: 'other' }, { viewer: 'b' }, { version: 'v2' }]) {
    const o = { viewer: 'a', system: 's', version: 'v1', ...changed };
    const r = foldConversation(room, numbered, { ...o, from: base.snapshot });
    assert.equal(r.reused, false, JSON.stringify(changed));
    assert.equal(r.cachedCount, 0);
    if (!('version' in changed)) assert.notEqual(r.snapshot.prefixHash, base.snapshot.prefixHash);
    else assert.equal(r.snapshot.prefixHash, base.snapshot.prefixHash, 'same output means the same cache key even after a version bump');
  }
});

test('fold: the default entry reducer hides whispers from bystanders', () => {
  const rows = [ev(1, 'a', 'public'), ev(2, 'a', 'psst', { mode: 'whisper', to: 'b' })];
  const view = (who: string) => foldConversation(rows, entryReducer(), { viewer: who }).snapshot.messages.map((m) => m.content);
  assert.deepEqual(view('b'), ['[a]: public', '[a whispers]: psst']);
  assert.deepEqual(view('c'), ['[a]: public']);
});

test('context from the database: each build loads and folds only the rows added since the last one', async () => {
  const env = await createEnv('ctx_incremental');
  try {
    const emit = (payload: any, targetAgentId?: string) =>
      env.processor.emitEventRequest({
        eventName: 'say', payload, targetAgentId,
        conversationId: env.conversationId, userId: env.userId, origin: 'API',
      });
    const store = new MemoryContextStore();
    const seen: string[] = [];
    const reducer: ContextReducer = (acc, r) => { seen.push(`${r.kind}${r.row.id}`); entryReducer()(acc, r); };
    const opts = { system: 'shared room', store, reducer, version: 'spy-1', eventNames: ['say'] };

    await emit({ from: 'a', text: 'one' });
    await emit({ from: 'b', text: 'two' });
    const t1 = await buildContext(env.prisma, env.conversationId, 'c', opts);
    assert.deepEqual(t1.messages.map((m) => m.content), ['[a]: one', '[b]: two']);
    assert.equal(t1.cachedCount, 0);

    await emit({ from: 'a', mode: 'whisper', text: 'secret' }, 'b');
    await emit({ from: 'c', text: 'three' });
    const firstBuild = new Set(seen);
    seen.length = 0;
    const t2 = await buildContext(env.prisma, env.conversationId, 'c', opts);
    assert.equal(seen.filter((s) => s.startsWith('event')).length, 2, 'only the two new events reach the reducer');
    assert.ok(seen.every((s) => !firstBuild.has(s)), 'nothing already folded is seen again (their EVENT_EMITTED responses are new rows too)');
    assert.equal(t2.cachedCount, 2);
    assert.deepEqual(t2.added.map((m) => m.content), ['three'], "the whisper to b adds nothing to c's prompt; c's own line is an assistant turn");
    assert.deepEqual(t2.messages.slice(0, 2), t1.messages, 'the earlier prompt is a byte-identical prefix');
    assert.notEqual(t2.prefixHash, t1.prefixHash);

    seen.length = 0;
    const t3 = await buildContext(env.prisma, env.conversationId, 'c', opts);
    assert.equal(seen.length, 0, 'nothing new: nothing reprocessed');
    assert.equal(t3.prefixHash, t2.prefixHash, 'unchanged history keeps the same cache key');

    const b = await buildContext(env.prisma, env.conversationId, 'b', { ...opts, store: new MemoryContextStore() });
    assert.deepEqual(b.messages.map((m) => m.content), ['[a]: one', 'two', '[a whispers]: secret', '[c]: three']);
  } finally {
    await env.cleanup();
  }
});
