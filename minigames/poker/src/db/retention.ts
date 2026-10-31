import { pruneConversationHistory, readSnapshot } from '../curator.ts';

/** Finished tables and lobbies keep their full history this long (`POKER_HISTORY_TTL_HOURS`, default 24). */
export const DEFAULT_HISTORY_TTL_MS = 24 * 60 * 60 * 1000;

export interface PruneHistoryResult {
  conversations: number;
  requests: number;
  responses: number;
  events: number;
}

export function historyTtlFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const hours = Number(env.POKER_HISTORY_TTL_HOURS);
  return Number.isFinite(hours) && hours >= 0 ? hours * 60 * 60 * 1000 : DEFAULT_HISTORY_TTL_MS;
}

/**
 * Retention for finished conversations of a project (closed tables and lobbies, games that are over):
 * deletes their Requests, Responses and subscriptions and compacts their EventLog to one state event
 * (`pruneConversationHistory`).
 * The Conversation row keeps its final state (results, cash-outs), so nothing that is listed or resumable
 * changes; live and paused tables are never touched.
 */
export async function prunePokerHistory(
  prisma: any,
  options: { projectId: string; olderThanMs?: number; now?: number }
): Promise<PruneHistoryResult> {
  const cutoff = (options.now ?? Date.now()) - (options.olderThanMs ?? DEFAULT_HISTORY_TTL_MS);
  const result: PruneHistoryResult = { conversations: 0, requests: 0, responses: 0, events: 0 };

  const convs = await prisma.conversation.findMany({
    where: { projectId: options.projectId },
    select: { id: true, metadata: true, updatedAt: true },
  });

  for (const conv of convs) {
    const { state } = readSnapshot(conv.metadata);
    if (!state.isClosed && !state.gameState?.gameOver) continue;
    const finishedAt = Date.parse(state.closedAt ?? '') || new Date(conv.updatedAt).getTime();
    if (!(finishedAt < cutoff)) continue;

    const [requestCount, eventCount] = await Promise.all([
      prisma.request.count({ where: { conversationId: conv.id } }),
      prisma.eventLog?.count ? prisma.eventLog.count({ where: { conversationId: conv.id } }) : 0,
    ]);
    if (requestCount === 0 && eventCount <= 1) continue; // already pruned

    const pruned = await pruneConversationHistory(prisma, conv.id);
    result.conversations++;
    result.requests += pruned.requests;
    result.responses += pruned.responses;
    result.events += pruned.events;
  }
  return result;
}
