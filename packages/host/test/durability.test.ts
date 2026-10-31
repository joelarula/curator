import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCuratorHost } from '../dist/createCuratorHost.js';

const scratch = (name: string) => fs.mkdtempSync(path.join(os.tmpdir(), `curator-durability-${name}-`));

const until = async (check: () => Promise<boolean>, what: string, timeoutMs = 15_000) => {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};

const pick = { type: 'Curator_HumanInput', prompt: 'Pick', inputType: 'choices', choices: ['a', 'b'], as: 'selection' };

test('durability ephemeral: the host runs on a memory database and never creates the configured one', async () => {
  const dir = scratch('ephemeral');
  const dbPath = path.join(dir, 'curator.db');
  const host = await createCuratorHost({ name: 'ephemeral_host', durability: 'ephemeral', dataDir: dir, curatorDb: { path: dbPath } });
  try {
    const conv = await host.prisma.conversation.create({ data: { userId: host.user.id, projectId: host.project.id } });
    await host.emitEvent('note', { text: 'hi' }, { conversationId: conv.id });
    assert.ok((await host.prisma.eventLog.count({ where: { conversationId: conv.id } })) > 0);
    assert.equal(host.durablePrisma, undefined);
    assert.equal(fs.existsSync(dbPath), false);
  } finally {
    await host.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('durability checkpoint: a conversation moves at its human-input wait and is answered durably', async () => {
  const dir = scratch('checkpoint');
  const host = await createCuratorHost({ name: 'checkpoint_host', durability: 'checkpoint', dataDir: dir, curatorDb: { path: path.join(dir, 'curator.db') } });
  try {
    assert.ok(host.durablePrisma && host.durableProcessor);
    const moved: number[] = [];
    host.events.onType('conversation_checkpointed' as any, (p: any) => moved.push(p.conversationId));

    const conv = await host.prisma.conversation.create({ data: { userId: host.user.id, projectId: host.project.id } });
    assert.ok(await host.durablePrisma.conversation.findUnique({ where: { id: conv.id } }), 'the id is reserved durably');
    const root = await host.prisma.request.create({
      data: { userId: host.user.id, projectId: host.project.id, conversationId: conv.id, status: 'NEW', toolName: 'Curator_Workflow', ast: pick },
    });
    assert.ok(root.id >= 1_000_000_000, 'memory ids start at the id base');

    await host.start(50);
    await until(async () => moved.includes(conv.id), 'the conversation to move');
    assert.equal(await host.prismaFor(conv.id), host.durablePrisma);
    assert.equal(await host.processorFor(conv.id), host.durableProcessor);
    assert.ok((await host.durablePrisma.request.count({ where: { conversationId: conv.id, status: 'WAITING_FOR_USER' } })) > 0);

    // Routed to the durable processor because the conversation moved
    await host.emitEvent('curator:choice', 'b', { conversationId: conv.id });
    await until(
      async () => (await host.durablePrisma.request.count({ where: { conversationId: conv.id, status: { notIn: ['COMPLETED', 'FAILED', 'CANCELLED', 'SKIPPED'] } } })) === 0,
      'the flow to finish durably'
    );
    const state = (await host.durablePrisma.conversation.findUnique({ where: { id: conv.id } })).metadata;
    assert.equal(state.selection, 'b');
  } finally {
    await host.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
