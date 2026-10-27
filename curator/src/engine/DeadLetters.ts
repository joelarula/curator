import { logger } from '../utils/logger.js';

/**
 * Dead letters using existing Request + Response models:
 * Every request that ends FAILED / SKIPPED / CANCELLED has an error Response record
 * that serves as its dead-letter log entry.
 */

export type DeadLetterKind = 'FAILED' | 'SKIPPED' | 'CANCELLED';

export const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'SKIPPED', 'CANCELLED']);

export interface DeadLetterRecord {
  requestId: number;
  conversationId: number;
  projectId: string | null;
  parentId: number | null;
  notifyId: number | null;
  kind: string;
  reason: string;
  ast: any;
  context: any;
  createdAt: Date;
  replayed: boolean;
}

/**
 * Records dead letter information. Since an error Response is already saved by the engine
 * on failure, this tags the request context with dead letter metadata so it can be identified
 * and replayed cleanly without requiring a separate table.
 */
export async function recordDeadLetter(prisma: any, req: any, kind: string, reason: string): Promise<void> {
  try {
    const existingContext = typeof req.context === 'string' ? JSON.parse(req.context) : (req.context || {});
    await prisma.request.update({
      where: { id: req.id },
      data: {
        context: {
          ...existingContext,
          __deadLetter: {
            kind,
            reason,
            recordedAt: new Date().toISOString(),
          },
        },
      },
    });
  } catch (err: any) {
    logger.warn(`[DeadLetters] Could not record dead letter for request ${req?.id}: ${err?.message ?? err}`);
  }
}

/**
 * Finds dead letters in a conversation or project from Request & Response records.
 */
export async function listDeadLetters(prisma: any, filter: { conversationId?: number; projectId?: string } = {}): Promise<DeadLetterRecord[]> {
  const where: any = {
    status: { in: ['FAILED', 'SKIPPED', 'CANCELLED'] },
    ...(filter.conversationId != null ? { conversationId: filter.conversationId } : {}),
    ...(filter.projectId != null ? { projectId: filter.projectId } : {}),
  };

  const requests = await prisma.request.findMany({
    where,
    include: {
      responses: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { id: 'asc' },
  });

  return requests.map((r: any) => {
    const ctx = typeof r.context === 'string' ? JSON.parse(r.context) : (r.context || {});
    const lastResponse = r.responses?.[0]?.content || '';
    return {
      requestId: r.id,
      conversationId: r.conversationId,
      projectId: r.projectId ?? null,
      parentId: r.parentId ?? null,
      notifyId: r.notifyId ?? null,
      kind: r.status,
      reason: ctx.__deadLetter?.reason || lastResponse || `Request ended ${r.status}`,
      ast: r.ast,
      context: r.context,
      createdAt: r.createdAt,
      replayed: !!ctx.__deadLetter?.replayedAt,
    };
  });
}

/**
 * Resubmits a dead letter (failed/skipped/cancelled request) as a fresh NEW request and marks original as replayed.
 * It re-attaches to its original waiter only if that waiter is still alive; otherwise it runs detached.
 * Returns the new request id.
 */
export async function replayDeadLetter(prisma: any, requestId: number): Promise<number> {
  const original = await prisma.request.findUnique({ where: { id: requestId } });
  if (!original) throw new Error(`Request ${requestId} not found for dead-letter replay`);

  const waiter = original.notifyId != null ? await prisma.request.findUnique({ where: { id: original.notifyId } }) : null;
  const originalContext = typeof original.context === 'string' ? JSON.parse(original.context) : (original.context || {});

  // Clean out dead-letter tag from new request's context
  const { __deadLetter: _discarded, ...cleanContext } = originalContext;

  const revived = await prisma.request.create({
    data: {
      userId: original.userId,
      projectId: original.projectId,
      conversationId: original.conversationId,
      agentId: original.agentId,
      scriptId: original.scriptId,
      scriptVersion: original.scriptVersion,
      priority: original.priority,
      ast: original.ast ?? undefined,
      context: cleanContext,
      status: 'NEW',
      pendingDependencies: 0,
      notifyId: waiter && !TERMINAL_STATUSES.has(waiter.status) ? waiter.id : null,
    },
  });

  // Mark original request's context as replayed
  await prisma.request.update({
    where: { id: requestId },
    data: {
      context: {
        ...originalContext,
        __deadLetter: {
          ...(originalContext.__deadLetter || {}),
          replayedAt: new Date().toISOString(),
          replayedAsRequestId: revived.id,
        },
      },
    },
  });

  return revived.id;
}
