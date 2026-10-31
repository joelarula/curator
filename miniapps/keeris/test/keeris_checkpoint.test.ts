import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createKeerisHost } from '../src/host.ts';

test('Keeris with checkpoint durability: a finished conversation moves and later tool calls run durably', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keeris-checkpoint-'));
  const host = await createKeerisHost({
    databasePath: path.join(dir, 'keeris.db'),
    curatorDbPath: path.join(dir, 'curator.db'),
    durability: 'checkpoint',
    quiet: true,
  });
  try {
    assert.ok(host.durablePrisma);
    const conv = await host.prisma.conversation.create({ data: { userId: host.user.id, projectId: host.project.id } });

    const first = await host.runTool('keeris_get_stats', {}, { conversationId: conv.id });
    assert.equal(first.status, 'COMPLETED');
    assert.equal(await host.prismaFor(conv.id), host.prisma, 'runs in memory first');
    assert.equal(await host.durablePrisma.request.count({ where: { conversationId: conv.id } }), 0);

    assert.ok((await host.checkpoint()).includes(conv.id), 'the finished conversation moves');
    assert.equal(await host.prismaFor(conv.id), host.durablePrisma);
    const moved = await host.durablePrisma.request.findMany({ where: { conversationId: conv.id } });
    assert.ok(moved.length > 0);

    // Routed to the durable processor; the request id from before the move still resolves
    const second = await host.runTool('keeris_get_stats', {}, { conversationId: conv.id });
    assert.equal(second.status, 'COMPLETED');
    assert.equal(await host.durablePrisma.request.count({ where: { conversationId: conv.id } }), moved.length + 1);
    const located = await host.locateRequest(first.requestId);
    assert.equal(located.prisma, host.durablePrisma);
    assert.ok(await host.durablePrisma.request.findUnique({ where: { id: located.id } }));
  } finally {
    await host.stop();
    // The domain database stays open after stop (Windows refuses to delete it): best-effort temp cleanup
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
});
