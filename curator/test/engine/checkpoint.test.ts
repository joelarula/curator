import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, makeFakeEngine, FIXED_NOW, type TestEnv } from '../helpers/harness.ts';
import { EXTERNAL_DATABASES, externalEnv, closeExternalDatabases } from '../helpers/externalDb.ts';
import { provisionMemorySqliteDb } from '../../src/db/sqliteProvisioner.ts';
import { CuratorRequestProcessor } from '../../src/engine/CuratorRequestProcessor.ts';
import {
  CheckpointManager,
  DEFAULT_ID_BASE,
  assertIdHeadroom,
  mirrorDefinitions,
  checkpointMemoryClient,
} from '../../src/engine/Checkpoint.ts';
import { STATE_SEQ_KEY } from '../../src/engine/ConversationStateLog.ts';

const canned = { echo: (a: any) => ({ echoed: a.text }), record: (a: any) => ({ got: a.value }) };
const tool = (toolName: string, args: any) => ({ type: 'Curator_Tool', toolName, args });

const askThenRecord = {
  type: 'Curator_Sequential',
  name: 'ask',
  subAgents: [
    tool('echo', { text: 'a' }),
    { type: 'Curator_HumanInput', prompt: 'Pick', inputType: 'choices', choices: ['a', 'b'], as: 'selection' },
    tool('record', { value: '$state.selection' }),
  ],
};

/** A durable test database plus a memory database mirroring it, as a checkpoint host sets them up. */
async function checkpointEnv(makeDurable: () => Promise<TestEnv>) {
  const env = await makeDurable();
  const raw = await provisionMemorySqliteDb({ idBase: DEFAULT_ID_BASE });
  await assertIdHeadroom(env.prisma, DEFAULT_ID_BASE);
  await mirrorDefinitions(env.prisma, raw, { replace: true });
  const memory = checkpointMemoryClient(raw, env.prisma);
  const fake = makeFakeEngine(canned);
  const processor = new CuratorRequestProcessor(memory, { engine: fake.engine, now: () => FIXED_NOW, retention: { completedContext: 'keep' } } as any);
  const checkpoint = new CheckpointManager(memory, env.prisma, { now: () => FIXED_NOW });
  const start = async (ast: any) => {
    const conversation = await memory.conversation.create({ data: { userId: env.userId } });
    await memory.request.create({ data: { userId: env.userId, conversationId: conversation.id, status: 'NEW', toolName: 'Curator_Workflow', ast } });
    return { conversationId: conversation.id, result: await processor.stepUntil({ conversationId: conversation.id }) };
  };
  return {
    env,
    memory,
    processor,
    checkpoint,
    memoryCalls: fake.calls,
    start,
    cleanup: async () => {
      await raw.$disconnect();
      await env.cleanup();
    },
  };
}

// The durable side on real servers too when CURATOR_TEST_POSTGRES_URL / CURATOR_TEST_MARIADB_URL are set
const TARGETS: Array<[string, (name: string) => Promise<TestEnv>]> = [
  ['sqlite', (name) => createEnv(name, canned)],
  ...EXTERNAL_DATABASES.map((db): [string, (name: string) => Promise<TestEnv>] => [db.name, () => externalEnv(db, canned)]),
];
test.after(closeExternalDatabases);

for (const [target, makeDurable] of TARGETS) {
  test(`checkpoint (${target}): a conversation runs in memory, moves at its human-input wait, and finishes durable`, async () => {
    const cp = await checkpointEnv(() => makeDurable('checkpoint_move'));
    try {
      const { conversationId, result } = await cp.start(askThenRecord);
      assert.equal(result.waiting, true);
      assert.deepEqual(cp.memoryCalls.map(c => c.args.text), ['a']);
      assert.ok(conversationId < DEFAULT_ID_BASE, 'conversation ids come from the durable database');
      const inMemory = await cp.memory.request.findMany({ where: { conversationId } });
      assert.ok(inMemory.length > 0 && inMemory.every((r: any) => r.id >= DEFAULT_ID_BASE));
      assert.equal(await cp.env.prisma.request.count({ where: { conversationId } }), 0, 'nothing is written durably before the checkpoint');

      const moved = await cp.checkpoint.checkpoint();
      assert.deepEqual(moved.map(m => m.conversationId), [conversationId]);
      assert.equal(await cp.checkpoint.inMemory(conversationId), false);
      assert.equal(await cp.memory.request.count(), 0);

      const durable = await cp.env.prisma.request.findMany({ where: { conversationId } });
      assert.equal(durable.length, inMemory.length);
      const durableIds = new Set(durable.map((r: any) => r.id));
      for (const r of durable) {
        assert.ok(r.id < DEFAULT_ID_BASE);
        for (const ref of [r.parentId, r.notifyId]) assert.ok(ref == null || durableIds.has(ref), `reference ${ref} points into the moved conversation`);
      }
      const waiting = durable.find((r: any) => r.status === 'WAITING_FOR_USER');
      assert.ok(waiting);
      assert.equal(cp.checkpoint.durableRequestId(inMemory.find((r: any) => r.status === 'WAITING_FOR_USER').id), waiting.id);
      const conv = await cp.env.prisma.conversation.findUnique({ where: { id: conversationId } });
      const seq = conv.metadata?.[STATE_SEQ_KEY];
      if (seq) assert.ok(await cp.env.prisma.eventLog.findUnique({ where: { id: seq } }), 'the state snapshot cursor points at a durable event');

      // The answer arrives after the move: the durable processor resumes the flow
      await cp.env.processor.emitEventRequest({ eventName: 'curator:choice', payload: 'b', conversationId, userId: cp.env.userId, origin: 'API' });
      const resumed = await cp.env.processor.stepUntil({ conversationId });
      assert.equal(resumed.done, true);
      assert.deepEqual(cp.env.calls.map(c => c.args.value), ['b']);
    } finally {
      await cp.cleanup();
    }
  });

  test(`checkpoint (${target}): finished conversations move with their results; runnable ones stay in memory`, async () => {
    const cp = await checkpointEnv(() => makeDurable('checkpoint_finished'));
    try {
      const finished = await cp.start(tool('echo', { text: 'done' }));
      assert.equal(finished.result.done, true);
      // Queued but not stepped: still runnable, so it must not move
      const pending = await cp.memory.conversation.create({ data: { userId: cp.env.userId } });
      await cp.memory.request.create({ data: { userId: cp.env.userId, conversationId: pending.id, status: 'NEW', toolName: 'Curator_Workflow', ast: tool('echo', { text: 'later' }) } });

      const moved = await cp.checkpoint.checkpoint();
      assert.deepEqual(moved.map(m => m.conversationId), [finished.conversationId]);
      assert.equal(await cp.checkpoint.inMemory(pending.id), true);
      const responses = await cp.env.prisma.response.findMany({ where: { conversationId: finished.conversationId } });
      assert.ok(responses.some((r: any) => r.content.includes('done')), 'the result is durable');
    } finally {
      await cp.cleanup();
    }
  });

  test(`checkpoint (${target}): durable ids at or above the memory id base are refused`, async () => {
    const cp = await checkpointEnv(() => makeDurable('checkpoint_headroom'));
    try {
      await assert.rejects(assertIdHeadroom(cp.env.prisma, 1), /at or above the memory id base/);
    } finally {
      await cp.cleanup();
    }
  });

  test(`checkpoint (${target}): definitions written durably later reach memory without disturbing running work`, async () => {
    const cp = await checkpointEnv(() => makeDurable('checkpoint_mirror'));
    try {
      const { conversationId } = await cp.start(askThenRecord);
      const before = await cp.memory.request.count({ where: { conversationId } });
      await cp.env.prisma.project.create({ data: { id: 'late', name: 'Late', userId: cp.env.userId } });

      await mirrorDefinitions(cp.env.prisma, cp.memory);
      assert.ok(await cp.memory.project.findUnique({ where: { id: 'late' } }));
      assert.equal(await cp.memory.request.count({ where: { conversationId } }), before);
      await assert.rejects(mirrorDefinitions(cp.env.prisma, cp.memory, { replace: true }), /before any request exists/);
    } finally {
      await cp.cleanup();
    }
  });

  test(`checkpoint (${target}): a user written durably after the mirror is pulled into memory when a request needs it`, async () => {
    const cp = await checkpointEnv(() => makeDurable('checkpoint_owners'));
    try {
      const late = await cp.env.prisma.user.create({ data: { id: 'late-user', name: 'Late', email: 'late@example.com' } });
      const conversation = await cp.memory.conversation.create({ data: { userId: late.id } });
      await cp.memory.request.create({ data: { userId: late.id, conversationId: conversation.id, status: 'NEW', toolName: 'Curator_Workflow', ast: tool('echo', { text: 'x' }) } });
      assert.ok(await cp.memory.user.findUnique({ where: { id: late.id } }));
      assert.equal((await cp.processor.stepUntil({ conversationId: conversation.id })).done, true);
    } finally {
      await cp.cleanup();
    }
  });
}
