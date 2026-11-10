import { defineTool, type CuratorToolContext } from './CuratorTool.js';
import { requireHumanCaller } from './sessionScope.js';
import { stateAt } from '../engine/ConversationStateLog.js';
import { ChannelService, CHANNEL_MESSAGE_EVENT, type ChannelRequestAction } from '../conversations/ChannelService.js';

/**
 * Channels for people: find the open channels of the project and ask to join or leave one. Asking only sends the
 * request event; the channel's workflow decides (see the default `conversation_channel_workflow`).
 */

type Ctx = CuratorToolContext & Record<string, any>;

const ROLE = 'conversations:own';
const SCAN = 200;

function requirePrisma(ctx: Ctx): any {
  if (!ctx.prisma?.conversation) throw new Error('Database connection not available in tool context.');
  return ctx.prisma;
}

const sessionProject = (ctx: Ctx): string | null => (ctx.projectId != null ? String(ctx.projectId) : null);

export const channel_list = defineTool<{ query?: string }>({
  name: 'channel_list',
  description: 'Lists the open channels of the current project (conversations whose workflow opened them), with member counts and whether you are a member.',
  accessLevel: 'read_only',
  requiredRole: ROLE,
  parameters: { type: 'object', properties: { query: { type: 'string', description: 'Only channels whose title contains this.' } } },
  execute: async (args, ctx: Ctx) => {
    const userId = requireHumanCaller(ctx, 'channel_list');
    const prisma = requirePrisma(ctx);
    const projectId = sessionProject(ctx);
    if (!projectId) return { channels: [] };
    const rows: any[] = await prisma.conversation.findMany({
      where: { projectId, existent: true },
      orderBy: { id: 'desc' },
      take: SCAN,
      include: prisma.conversationMember
        ? {
            members: { where: { memberType: 'user', memberId: userId, existent: true }, take: 1 },
            _count: { select: { members: { where: { existent: true } } } },
          }
        : undefined,
    });
    const q = typeof args.query === 'string' ? args.query.toLowerCase() : '';
    const channels: any[] = [];
    for (const row of rows) {
      // A channel is open while its workflow says so (conversation state)
      const state = await stateAt(prisma, row.id);
      if (state?.channel?.open !== true) continue;
      const title = row.title ?? (typeof state.channel.title === 'string' ? state.channel.title : `Channel ${row.id}`);
      if (q && !title.toLowerCase().includes(q)) continue;
      channels.push({
        conversationId: row.id,
        externalId: row.externalId,
        title,
        memberCount: row._count?.members ?? 0,
        joined: (row.members?.length ?? 0) > 0,
        owned: row.userId === userId,
      });
    }
    return { channels };
  },
});

export const channel_request = defineTool<{ conversationId: number; action: ChannelRequestAction }>({
  name: 'channel_request',
  description: "Asks a channel's workflow to let you join or leave it (sends the request event; the workflow decides).",
  accessLevel: 'safe_write',
  requiredRole: ROLE,
  parameters: {
    type: 'object',
    properties: {
      conversationId: { type: 'integer' },
      action: { type: 'string', enum: ['join', 'leave'] },
    },
    required: ['conversationId', 'action'],
  },
  execute: async (args, ctx: Ctx) => {
    const userId = requireHumanCaller(ctx, 'channel_request');
    const prisma = requirePrisma(ctx);
    if (args.action !== 'join' && args.action !== 'leave') throw new Error("'action' is join or leave");
    const id = Number(args.conversationId);
    const projectId = sessionProject(ctx);
    const row = Number.isInteger(id)
      ? await prisma.conversation.findFirst({ where: { id, existent: true, ...(projectId ? { projectId } : {}) } })
      : null;
    if (!row) throw new Error(`Conversation ${args.conversationId} not found`);
    const api = ctx.tryService?.(ChannelService);
    if (!api) throw new Error('Channel requests are only available inside a Curator processor');
    const { requestId } = await api.request({ conversationId: row.id, action: args.action, userId, projectId });
    return { requested: args.action, conversationId: row.id, requestId };
  },
});

const MAX_MESSAGE = 4000;

/** A channel the caller may read and post in (its owner or a current member), or an error. */
async function readableChannel(ctx: Ctx, toolName: string, conversationId: unknown): Promise<{ prisma: any; row: any; userId: string }> {
  const userId = requireHumanCaller(ctx, toolName);
  const prisma = requirePrisma(ctx);
  const id = Number(conversationId);
  const projectId = sessionProject(ctx);
  const memberClause = prisma.conversationMember ? [{ members: { some: { memberType: 'user', memberId: userId, existent: true } } }] : [];
  const row = Number.isInteger(id)
    ? await prisma.conversation.findFirst({
        where: { id, existent: true, ...(projectId ? { projectId } : {}), OR: [{ userId }, ...memberClause] },
      })
    : null;
  if (!row) throw new Error(`Conversation ${conversationId} not found`);
  return { prisma, row, userId };
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export const channel_post = defineTool<{ conversationId: number; text: string }>({
  name: 'channel_post',
  description: 'Posts a message into a channel you own or are a member of (event conversation:message; members see it in the channel).',
  accessLevel: 'safe_write',
  requiredRole: ROLE,
  parameters: {
    type: 'object',
    properties: { conversationId: { type: 'integer' }, text: { type: 'string', description: 'The message.' } },
    required: ['conversationId', 'text'],
  },
  execute: async (args, ctx: Ctx) => {
    const { prisma, row, userId } = await readableChannel(ctx, 'channel_post', args.conversationId);
    const text = String(args.text ?? '').trim();
    if (!text) throw new Error('A message needs text');
    if (text.length > MAX_MESSAGE) throw new Error(`A message is at most ${MAX_MESSAGE} characters`);
    const api = ctx.tryService?.(ChannelService);
    if (!api) throw new Error('Channel messages are only available inside a Curator processor');
    // The sender comes from the session, never from the arguments
    const user = prisma.user?.findUnique ? await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }).catch(() => null) : null;
    const sender = { type: 'user' as const, id: userId, name: user?.name ?? user?.email ?? null };
    const { requestId } = await api.post({ conversationId: row.id, userId, projectId: sessionProject(ctx), payload: { text, sender } });
    return { posted: true, conversationId: row.id, requestId };
  },
});

export const channel_messages = defineTool<{ conversationId: number; afterId?: number; limit?: number }>({
  name: 'channel_messages',
  description: 'Messages of a channel you own or are a member of, oldest first: the latest ones, or those after afterId.',
  accessLevel: 'read_only',
  requiredRole: ROLE,
  parameters: {
    type: 'object',
    properties: {
      conversationId: { type: 'integer' },
      afterId: { type: 'integer', description: 'Only messages newer than this id (for polling).' },
      limit: { type: 'number', description: 'Maximum messages (default 50, max 200).' },
    },
    required: ['conversationId'],
  },
  execute: async (args, ctx: Ctx) => {
    const { prisma, row } = await readableChannel(ctx, 'channel_messages', args.conversationId);
    if (!prisma.busEvent) return { messages: [] };
    const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 200);
    const after = Number(args.afterId);
    const where = { conversationId: row.id, eventName: CHANNEL_MESSAGE_EVENT };
    const rows: any[] = Number.isInteger(after)
      ? await prisma.busEvent.findMany({ where: { ...where, id: { gt: after } }, orderBy: { id: 'asc' }, take: limit })
      : (await prisma.busEvent.findMany({ where, orderBy: { id: 'desc' }, take: limit })).reverse();
    return {
      messages: rows.map((r) => {
        const p = typeof r.payload === 'string' ? safeJson(r.payload) : r.payload ?? {};
        return { id: r.id, text: String(p?.text ?? ''), sender: p?.sender ?? null, at: new Date(r.createdAt).toISOString() };
      }),
    };
  },
});

export const channelTools = { channel_list, channel_request, channel_post, channel_messages };
