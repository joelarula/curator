import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv } from '../helpers/harness.ts';
import { conversation_list, conversation_rename, conversation_pin, conversation_archive, conversation_delete } from '../../src/tools/conversations.ts';

test('conversations: list, title fallback, rename, pin, archive and delete own conversations only', async () => {
  const env = await createEnv('conversation_org');
  try {
    await env.prisma.project.create({ data: { id: 'p1', name: 'P1', userId: String(env.userId) } });
    const other = await env.prisma.user.create({ data: { name: 'other', email: 'other@example.com' } });
    const mk = (userId: string) => env.prisma.conversation.create({ data: { userId, projectId: 'p1' } });
    const a = await mk(String(env.userId));
    const b = await mk(String(env.userId));
    const theirs = await mk(other.id);
    const at = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s));
    await env.prisma.request.create({ data: { userId: String(env.userId), projectId: 'p1', conversationId: a.id, status: 'COMPLETED', toolName: 'x', context: { message: 'Plan the   release' }, createdAt: at(1) } });
    await env.prisma.request.create({ data: { userId: String(env.userId), projectId: 'p1', conversationId: b.id, status: 'COMPLETED', toolName: 'x', context: { message: 'Second chat' }, createdAt: at(5) } });

    const run = (tool: any, args: any, extra: Record<string, any> = {}) =>
      tool.runAsync({ args, toolContext: { prisma: env.prisma, userId: env.userId, projectId: 'p1', conversationId: env.conversationId, ...extra } });
    const list = async (args: any = {}) => (await run(conversation_list, args)).conversations;

    // Most recently active first; untitled ones show their first message
    assert.deepEqual((await list()).map((c: any) => [c.conversationId, c.title]), [[b.id, 'Second chat'], [a.id, 'Plan the release']]);

    await run(conversation_rename, { conversationId: a.id, title: '  Release   plan ' });
    await run(conversation_pin, { conversationId: a.id });
    assert.deepEqual((await list()).map((c: any) => [c.title, c.pinned]), [['Release plan', true], ['Second chat', false]]);
    assert.deepEqual((await list({ query: 'release' })).map((c: any) => c.conversationId), [a.id]);

    await run(conversation_archive, { conversationId: a.id });
    assert.deepEqual((await list()).map((c: any) => c.conversationId), [b.id]);
    const archived = await list({ archived: true });
    assert.deepEqual(archived.map((c: any) => [c.conversationId, c.pinned]), [[a.id, false]]);
    await run(conversation_archive, { conversationId: a.id, archived: false });

    // Someone else's conversation looks unknown; agents cannot organise conversations
    await assert.rejects(run(conversation_rename, { conversationId: theirs.id, title: 'x' }), /not found/);
    await assert.rejects(run(conversation_list, {}, { agentId: 'ag-1' }), /human callers/);

    // Delete: not the conversation you are in; otherwise it leaves the list
    await assert.rejects(run(conversation_delete, { conversationId: b.id }, { conversationId: b.id }), /you are in/);
    await run(conversation_delete, { conversationId: b.id });
    assert.deepEqual((await list()).map((c: any) => c.conversationId), [a.id]);
    assert.equal((await env.prisma.conversation.findUnique({ where: { id: b.id } })).existent, null);
  } finally { await env.cleanup(); }
});
