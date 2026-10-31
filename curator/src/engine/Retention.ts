import { compactConversationLog } from './ConversationStateLog.js';
import { TERMINAL_STATUSES } from './DeadLetters.js';
import { sqlFor } from '../db/sqlDialect.js';

/**
 * Storage retention. Request data is short lived: a Request's `context` is working memory, read by the
 * Request itself and, once it completes, by the Request it notifies (call `returns`) on that Request's next
 * run. After that it is never read again, so it is trimmed to NULL. A finished conversation keeps only its
 * state snapshot (`Conversation.metadata` plus one compacted state event); its Requests and Responses go.
 */

const ID_CHUNK = 500;

/** Sets `context` to NULL. Raw SQL so `updatedAt` (which orders "latest request" lookups) is left as is. */
export async function clearRequestContexts(prisma: any, ids: number[]): Promise<number> {
  const sql = sqlFor(prisma);
  let cleared = 0;
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    cleared += Number(
      await prisma.$executeRawUnsafe(
        ...sql`UPDATE "Request" SET "context" = NULL WHERE "context" IS NOT NULL AND "id" IN (${chunk})`
      )
    );
  }
  return cleared;
}

/** Completed children of `parentId` whose context is still stored (the ones its next run may read). */
export async function completedChildrenWithContext(prisma: any, parentId: number): Promise<number[]> {
  const sql = sqlFor(prisma);
  const rows: Array<{ id: unknown }> = await prisma.$queryRawUnsafe(
    ...sql`SELECT "id" FROM "Request" WHERE "notifyId" = ${parentId} AND "status" = 'COMPLETED' AND "context" IS NOT NULL`
  );
  return rows.map(r => Number(r.id));
}

/**
 * Trims the context of COMPLETED Requests that nothing can read any more: no notify target, or one that is
 * terminal or gone, and last updated before `olderThan` (a grace period for callers reading the final
 * context right after a run). Requests whose target is still live are trimmed by that target's next run.
 */
export async function sweepCompletedContexts(
  prisma: any,
  options: { olderThan: Date; maxBatches?: number; batchSize?: number }
): Promise<number> {
  const sql = sqlFor(prisma);
  const batchSize = options.batchSize ?? ID_CHUNK;
  let afterId = 0;
  let trimmed = 0;
  for (let batch = 0; batch < (options.maxBatches ?? 10); batch++) {
    const rows: Array<{ id: unknown; notifyId: unknown; updatedAt: unknown }> = await prisma.$queryRawUnsafe(
      ...sql`SELECT "id", "notifyId", "updatedAt" FROM "Request" WHERE "status" = 'COMPLETED' AND "context" IS NOT NULL AND "id" > ${afterId} ORDER BY "id" LIMIT ${batchSize}`
    );
    if (rows.length === 0) break;
    afterId = Number(rows[rows.length - 1].id);

    const old = rows.filter(r => new Date(r.updatedAt as any).getTime() < options.olderThan.getTime());
    const targetIds = [...new Set(old.map(r => r.notifyId).filter(id => id != null).map(Number))];
    const targets: Array<{ id: number; status: string }> = targetIds.length
      ? await prisma.request.findMany({ where: { id: { in: targetIds } }, select: { id: true, status: true } })
      : [];
    const live = new Set(targets.filter(t => !TERMINAL_STATUSES.has(t.status)).map(t => t.id));
    const ids = old.filter(r => r.notifyId == null || !live.has(Number(r.notifyId))).map(r => Number(r.id));
    trimmed += await clearRequestContexts(prisma, ids);
    if (rows.length < batchSize) break;
  }
  return trimmed;
}

export interface PruneConversationResult {
  requests: number;
  responses: number;
  events: number;
}

/**
 * Deletes a finished conversation's Requests, Responses and subscriptions and compacts its EventLog to one
 * state event. The Conversation row keeps its final state. Callers decide what "finished" means; never call
 * this for a conversation with live Requests.
 */
export async function pruneConversationHistory(prisma: any, conversationId: number): Promise<PruneConversationResult> {
  // Requests elsewhere may point here (a flow started by another conversation): detach, never cascade into them
  await prisma.request.updateMany({
    where: { conversationId: { not: conversationId }, parent: { is: { conversationId } } },
    data: { parentId: null },
  });
  const sql = sqlFor(prisma);
  // The derived table works around MySQL's "can't update a table used in a subquery"; harmless elsewhere
  await prisma.$executeRawUnsafe(
    ...sql`UPDATE "Request" SET "notifyId" = NULL WHERE "conversationId" <> ${conversationId} AND "notifyId" IN (SELECT "id" FROM (SELECT "id" FROM "Request" WHERE "conversationId" = ${conversationId}) AS own)`
  );

  const responses = await prisma.response.deleteMany({
    where: { OR: [{ conversationId }, { request: { is: { conversationId } } }] },
  });
  await prisma
    .$executeRawUnsafe(...sql`DELETE FROM "_RequestResources" WHERE "A" IN (SELECT "id" FROM "Request" WHERE "conversationId" = ${conversationId})`)
    .catch(() => {});
  const requests = await prisma.request.deleteMany({ where: { conversationId } });
  await prisma.eventSubscription?.deleteMany?.({ where: { conversationId } });
  const events = await compactConversationLog(prisma, conversationId);
  return { requests: requests.count, responses: responses.count, events };
}
