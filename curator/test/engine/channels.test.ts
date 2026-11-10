import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, saveScript, type TestEnv } from '../helpers/harness.ts';
import { ConversationRouter } from '../../src/conversations/ConversationRouter.ts';
import { createConversationTools, ConversationToolName } from '../../src/conversations/ConversationTools.ts';
import { channelWorkflowAst } from '../../src/conversations/ConversationWorkflows.ts';
import { access_check } from '../../src/tools/accessCheck.ts';
import { conversation_list, conversation_pin, conversation_rename } from '../../src/tools/conversations.ts';
import { channel_list, channel_request } from '../../src/tools/channels.ts';
import { appendStatePatch } from '../../src/engine/ConversationStateLog.ts';

// Channels: join / leave are decided by the conversation's workflow (default policy: open channel + channels:join).

async function setup(name: string) {
  const env = await createEnv(name);
  await env.prisma.project.create({ data: { id: 'p1', name: 'P1', userId: String(env.userId) } });
  await env.prisma.conversation.update({ where: { id: env.conversationId }, data: { projectId: 'p1' } });
  const tools = (env.processor as any).engine.tools as Map<string, any>;
  const router = new ConversationRouter({ localNodeId: 'n1', localProjectId: 'p1', prisma: env.prisma });
  for (const t of createConversationTools(router)) tools.set(t.name, t);
  tools.set('access_check', access_check);
  tools.set('channel_list', channel_list);
  tools.set('channel_request', channel_request);
  await saveScript(env, 'conversation_channel_workflow', channelWorkflowAst, { projectId: 'p1' });
  await env.prisma.role.create({ data: { id: 'channels:join', name: 'channels:join' } });
  await env.prisma.role.create({ data: { id: 'conversations:own', name: 'conversations:own' } });
  const user = async (n: string, roles: string[]) => {
    const u = await env.prisma.user.create({ data: { name: n, email: `${n}@example.com` } });
    for (const r of roles) await env.prisma.userRole.create({ data: { userId: u.id, roleId: r, projectId: 'p1' } });
    return u;
  };
  return { env, user };
}

const send = async (env: TestEnv, eventName: string, userId: string) => {
  await env.processor.emitEventRequest({ eventName, payload: {}, conversationId: env.conversationId, userId, projectId: 'p1', origin: 'API' } as any);
  await env.processor.stepUntil({ conversationId: env.conversationId });
};
const members = async (env: TestEnv) =>
  (await env.prisma.conversationMember.findMany({ where: { conversationId: env.conversationId, existent: true }, orderBy: { id: 'asc' } }))
    .map((m: any) => `${m.memberType}:${m.memberId}:${m.conversationalRole}`);
const denials = async (env: TestEnv) =>
  (await env.prisma.busEvent.findMany({ where: { eventName: 'conversation:join_denied' }, orderBy: { id: 'asc' } }))
    .map((e: any) => (typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload).reason);

test('channels: the workflow joins an allowed sender of an open channel, refuses others, and handles leaving', async () => {
  const { env, user } = await setup('channels_join');
  try {
    const ann = await user('ann', ['channels:join', 'conversations:own']);
    const bob = await user('bob', ['conversations:own']);

    // Not a channel yet: nobody joins
    await send(env, 'conversation:join_requested', ann.id);
    assert.deepEqual(await members(env), []);
    assert.match(String((await denials(env))[0]), /not an open channel/);

    // The conversation's workflow opens it as a channel (state), then the role decides
    await appendStatePatch(env.prisma, env.conversationId, { set: { channel: { open: true } } });
    await send(env, 'conversation:join_requested', ann.id);
    await send(env, 'conversation:join_requested', bob.id);
    assert.deepEqual(await members(env), [`user:${ann.id}:member`]);
    assert.match(String((await denials(env)).at(-1)), /channels\.join|channels:join/);

    // A member sees the channel, pins it for themselves, but cannot rename it
    const run = (tool: any, args: any) => tool.runAsync({ args, toolContext: { prisma: env.prisma, userId: ann.id, projectId: 'p1' } });
    const listed = (await run(conversation_list, {})).conversations;
    assert.deepEqual(listed.map((c: any) => [c.conversationId, c.owned, c.memberCount]), [[env.conversationId, false, 1]]);
    await run(conversation_pin, { conversationId: env.conversationId });
    assert.equal((await run(conversation_list, {})).conversations[0].pinned, true);
    assert.equal((await env.prisma.conversation.findUnique({ where: { id: env.conversationId } })).pinnedAt, null);
    await assert.rejects(run(conversation_rename, { conversationId: env.conversationId, title: 'x' }), /not found/);

    // Leaving ends the membership (kept as history)
    await send(env, 'conversation:leave_requested', ann.id);
    assert.deepEqual(await members(env), []);
    assert.equal(await env.prisma.conversationMember.count({ where: { conversationId: env.conversationId } }), 1);
    assert.deepEqual((await run(conversation_list, {})).conversations, []);
  } finally { await env.cleanup(); }
});

test('channels: joining directly (console, CLI, GraphQL, MCP) is refused; it goes through the workflow', async () => {
  const { env } = await setup('channels_direct');
  try {
    await assert.rejects(
      env.processor.runToolRequest({ toolName: ConversationToolName.JOIN, args: {}, conversationId: env.conversationId, userId: env.userId, projectId: 'p1', origin: 'API' } as any),
      /conversation workflow/
    );
    assert.deepEqual(await members(env), []);
  } finally { await env.cleanup(); }
});

test('channels: people find open channels and ask to join or leave; the workflow decides', async () => {
  const { env, user } = await setup('channels_request');
  try {
    const cara = await user('cara', ['channels:join', 'conversations:own']);
    const run = (toolName: string, args: any) =>
      env.processor.runToolRequest({ toolName, args, conversationId: env.conversationId, userId: cara.id, projectId: 'p1', origin: 'API' } as any);

    assert.deepEqual(((await run('channel_list', {})).result as any).channels, []);
    await appendStatePatch(env.prisma, env.conversationId, { set: { channel: { open: true, title: 'General' } } });
    const open = ((await run('channel_list', {})).result as any).channels;
    assert.deepEqual(open.map((c: any) => [c.conversationId, c.title, c.joined, c.memberCount]), [[env.conversationId, 'General', false, 0]]);

    // Asking sends the request event as cara; the workflow joins her
    const asked: any = (await run('channel_request', { conversationId: env.conversationId, action: 'join' })).result;
    assert.equal(asked.requested, 'join');
    await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.deepEqual(await members(env), [`user:${cara.id}:member`]);
    assert.equal(((await run('channel_list', {})).result as any).channels[0].joined, true);

    await run('channel_request', { conversationId: env.conversationId, action: 'leave' });
    await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.deepEqual(await members(env), []);
  } finally { await env.cleanup(); }
});
