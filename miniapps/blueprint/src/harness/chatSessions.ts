import { randomUUID } from 'node:crypto';
import type { CuratorHost } from '@curator/host';
import { ASSISTANT_AGENT } from './assistantPlugin.js';

/**
 * Assistant chats each live in their own Conversation (tagged by an `externalId` prefix), apart from the
 * host conversation that carries connector and scheduled flows, so chat history stays chat-only.
 */
const CHAT_PREFIX = `chat:${ASSISTANT_AGENT}:`;

export interface ChatSummary {
  conversationId: number;
  turns: number;
  /** The chat's title (conversation_rename), else its first user message, for picking a chat to resume. */
  title: string;
  /** Pinned chats come first (conversation_pin). */
  pinned: boolean;
  lastActiveAt: Date;
}

/** Earlier chats with at least one turn, pinned first, then most recently active; archived chats are left out. */
export async function listChats(host: CuratorHost, limit = 5): Promise<ChatSummary[]> {
  const conversations = await host.prisma.conversation.findMany({
    where: { projectId: host.project.id, userId: host.user.id, externalId: { startsWith: CHAT_PREFIX }, existent: true, archivedAt: null },
    include: {
      requests: {
        where: { agentId: { not: null }, parentId: null },
        orderBy: { id: 'asc' },
        select: { context: true, updatedAt: true },
      },
    },
  });

  const chats: ChatSummary[] = [];
  for (const c of conversations) {
    if (c.requests.length === 0) continue;
    const first = parseContext(c.requests[0].context);
    chats.push({
      conversationId: c.id,
      turns: c.requests.length,
      title: c.title ?? String(first.message ?? '').slice(0, 60),
      pinned: c.pinnedAt != null,
      lastActiveAt: new Date(Math.max(...c.requests.map((r: any) => new Date(r.updatedAt).getTime()))),
    });
  }
  return chats
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastActiveAt.getTime() - a.lastActiveAt.getTime())
    .slice(0, limit);
}

export async function createChat(host: CuratorHost): Promise<number> {
  const conversation = await host.prisma.conversation.create({
    data: { externalId: `${CHAT_PREFIX}${randomUUID()}`, userId: host.user.id, projectId: host.project.id },
  });
  return conversation.id;
}

function parseContext(context: unknown): Record<string, any> {
  if (typeof context !== 'string') return (context as Record<string, any>) ?? {};
  try {
    return JSON.parse(context);
  } catch {
    return {};
  }
}
