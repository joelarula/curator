import { defineTool, type CuratorToolContext } from './CuratorTool.js';
import { requireHumanCaller } from './sessionScope.js';
import { stateAt } from '../engine/ConversationStateLog.js';
import { ChannelService, type ChannelRequestAction } from '../conversations/ChannelService.js';

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

export const channelTools = { channel_list, channel_request };
