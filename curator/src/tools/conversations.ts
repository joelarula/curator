import { defineTool, type CuratorToolContext } from './CuratorTool.js';
import { requireHumanCaller } from './sessionScope.js';

/**
 * Conversation organisation: list, rename, pin, archive and delete one's conversations. People only (agents have no
 * conversation list); the project always comes from the session. Access is decided by `conversationAccess` alone:
 * today the owner (`Conversation.userId`); when joining persists members (channels), members are added there.
 */

type Ctx = CuratorToolContext & Record<string, any>;

const ROLE = 'conversations:own';
const MAX_TITLE = 200;
const SCAN = 200;

/** The conversations a user may organise in a project, as a Prisma `where` (owner only for now; members later). */
export function conversationAccess(userId: string, projectId: string | null): Record<string, any> {
  return { userId, existent: true, ...(projectId ? { projectId } : {}) };
}

const sessionProject = (ctx: Ctx): string | null => (ctx.projectId != null ? String(ctx.projectId) : null);

function requirePrisma(ctx: Ctx): any {
  if (!ctx.prisma?.conversation) throw new Error('Database connection not available in tool context.');
  return ctx.prisma;
}

/** A conversation the caller may organise, or an error (unknown ones and others' look the same). */
async function ownConversation(ctx: Ctx, toolName: string, conversationId: unknown): Promise<{ prisma: any; row: any }> {
  const userId = requireHumanCaller(ctx, toolName);
  const prisma = requirePrisma(ctx);
  const id = Number(conversationId);
  if (!Number.isInteger(id)) throw new Error(`'conversationId' must be a conversation id`);
  const row = await prisma.conversation.findFirst({ where: { AND: [{ id }, conversationAccess(userId, sessionProject(ctx))] } });
  if (!row) throw new Error(`Conversation ${id} not found`);
  return { prisma, row };
}

/** The first message of a conversation's first root request (the fallback title). */
function firstMessage(context: unknown): string {
  let ctx: any = context;
  if (typeof ctx === 'string') {
    try {
      ctx = JSON.parse(ctx);
    } catch {
      return '';
    }
  }
  const text = ctx?.message ?? ctx?.speech ?? ctx?.text ?? ctx?.userInput ?? '';
  return typeof text === 'string' ? text.trim().replace(/\s+/g, ' ').slice(0, 60) : '';
}

const view = (row: any, lastActiveAt: Date, fallbackTitle: string) => ({
  conversationId: row.id,
  externalId: row.externalId,
  title: row.title ?? (fallbackTitle || `Conversation ${row.id}`),
  titled: row.title != null,
  pinned: row.pinnedAt != null,
  archived: row.archivedAt != null,
  createdAt: new Date(row.createdAt).toISOString(),
  lastActiveAt: lastActiveAt.toISOString(),
});

export const conversation_list = defineTool<{ archived?: boolean; query?: string; limit?: number }>({
  name: 'conversation_list',
  description: "Lists the caller's conversations in the current project: pinned first, then most recently active. Untitled ones show their first message.",
  accessLevel: 'read_only',
  requiredRole: ROLE,
  parameters: {
    type: 'object',
    properties: {
      archived: { type: 'boolean', description: 'List archived conversations instead (default false).' },
      query: { type: 'string', description: 'Only conversations whose title contains this.' },
      limit: { type: 'number', description: 'Maximum results (default 50, max 200).' },
    },
  },
  execute: async (args, ctx: Ctx) => {
    const userId = requireHumanCaller(ctx, 'conversation_list');
    const prisma = requirePrisma(ctx);
    const limit = Math.min(Math.max(Number(args.limit) || 50, 1), SCAN);
    const rows: any[] = await prisma.conversation.findMany({
      where: { AND: [conversationAccess(userId, sessionProject(ctx)), { archivedAt: args.archived ? { not: null } : null }] },
      orderBy: { id: 'desc' },
      take: SCAN,
    });
    const ids = rows.map((r) => r.id);
    // Last activity: the newest request; the first root request's message titles untitled conversations
    const [activity, firsts] = ids.length
      ? await Promise.all([
          prisma.request.groupBy({ by: ['conversationId'], where: { conversationId: { in: ids } }, _max: { createdAt: true } }),
          prisma.request.findMany({
            where: { conversationId: { in: rows.filter((r) => r.title == null).map((r) => r.id) }, parentId: null },
            orderBy: { id: 'asc' },
            select: { conversationId: true, context: true },
          }),
        ])
      : [[], []];
    const lastActive = new Map<number, Date>(activity.map((a: any) => [a.conversationId, new Date(a._max.createdAt)]));
    const titles = new Map<number, string>();
    for (const f of firsts as any[]) {
      if (!titles.has(f.conversationId)) {
        const t = firstMessage(f.context);
        if (t) titles.set(f.conversationId, t);
      }
    }
    const q = typeof args.query === 'string' ? args.query.toLowerCase() : '';
    const list = rows
      .map((r) => view(r, lastActive.get(r.id) ?? new Date(r.createdAt), titles.get(r.id) ?? ''))
      .filter((c) => !q || c.title.toLowerCase().includes(q))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastActiveAt.localeCompare(a.lastActiveAt))
      .slice(0, limit);
    return { conversations: list };
  },
});

export const conversation_rename = defineTool<{ conversationId: number; title?: string | null }>({
  name: 'conversation_rename',
  description: 'Renames one of your conversations; an empty title goes back to showing its first message.',
  accessLevel: 'safe_write',
  requiredRole: ROLE,
  parameters: {
    type: 'object',
    properties: { conversationId: { type: 'integer' }, title: { type: 'string', description: 'New title (empty: none).' } },
    required: ['conversationId'],
  },
  execute: async (args, ctx: Ctx) => {
    const { prisma, row } = await ownConversation(ctx, 'conversation_rename', args.conversationId);
    const title = typeof args.title === 'string' ? args.title.trim().replace(/\s+/g, ' ').slice(0, MAX_TITLE) : '';
    await prisma.conversation.update({ where: { id: row.id }, data: { title: title || null } });
    return { conversationId: row.id, title: title || null };
  },
});

export const conversation_pin = defineTool<{ conversationId: number; pinned?: boolean }>({
  name: 'conversation_pin',
  description: 'Pins (or unpins) one of your conversations to the top of the list.',
  accessLevel: 'safe_write',
  requiredRole: ROLE,
  parameters: {
    type: 'object',
    properties: { conversationId: { type: 'integer' }, pinned: { type: 'boolean', description: 'Default true; false unpins.' } },
    required: ['conversationId'],
  },
  execute: async (args, ctx: Ctx) => {
    const { prisma, row } = await ownConversation(ctx, 'conversation_pin', args.conversationId);
    const pinned = args.pinned !== false;
    await prisma.conversation.update({ where: { id: row.id }, data: { pinnedAt: pinned ? new Date() : null } });
    return { conversationId: row.id, pinned };
  },
});

export const conversation_archive = defineTool<{ conversationId: number; archived?: boolean }>({
  name: 'conversation_archive',
  description: 'Archives (or restores) one of your conversations: archived ones leave the list but are kept.',
  accessLevel: 'safe_write',
  requiredRole: ROLE,
  parameters: {
    type: 'object',
    properties: { conversationId: { type: 'integer' }, archived: { type: 'boolean', description: 'Default true; false restores.' } },
    required: ['conversationId'],
  },
  execute: async (args, ctx: Ctx) => {
    const { prisma, row } = await ownConversation(ctx, 'conversation_archive', args.conversationId);
    const archived = args.archived !== false;
    // Archiving also unpins, so a restored conversation comes back unpinned
    await prisma.conversation.update({ where: { id: row.id }, data: archived ? { archivedAt: new Date(), pinnedAt: null } : { archivedAt: null } });
    return { conversationId: row.id, archived };
  },
});

export const conversation_delete = defineTool<{ conversationId: number }>({
  name: 'conversation_delete',
  description: 'Deletes one of your conversations (soft delete: it disappears from lists). Not the conversation you are in.',
  // Soft delete of one's own conversation: no approval step
  accessLevel: 'safe_write',
  requiredRole: ROLE,
  parameters: { type: 'object', properties: { conversationId: { type: 'integer' } }, required: ['conversationId'] },
  execute: async (args, ctx: Ctx) => {
    const { prisma, row } = await ownConversation(ctx, 'conversation_delete', args.conversationId);
    if (ctx.conversationId != null && Number(ctx.conversationId) === row.id) {
      throw new Error('You cannot delete the conversation you are in');
    }
    await prisma.conversation.update({ where: { id: row.id }, data: { existent: null, deletedAt: new Date() } });
    return { conversationId: row.id, deleted: true };
  },
});

export const conversationOrganisationTools = {
  conversation_list,
  conversation_rename,
  conversation_pin,
  conversation_archive,
  conversation_delete,
};
