import { logger } from '../utils/logger.js';
import { deleteInChunks, retireByAge } from './Retention.js';

/**
 * Step history (docs/DISTRIBUTED_STORAGE_PLAN.md, Phase 5). Only some step results are conversation history:
 * those of agents, human input, tools and scripts, which stay `Response` rows (agent history and the conversation
 * context read them). A control-flow step's result is read once, by the request it notifies, so it is stored on
 * the request itself (`Request.output`, trimmed with its context) instead of as a Response row. Every finished
 * request is also recorded in `StepTrace`, an append-only table written in batches for observability.
 */

/** Built-in control-flow node types: their results are `Request.output`, never Responses. */
export const CONTROL_NODE_TYPES: ReadonlySet<string> = new Set([
  'Curator_Sequential',
  'Curator_Parallel',
  'Curator_Join',
  'Curator_JoinTimeout',
  'Curator_IfElse',
  'Curator_Route',
  'Curator_ForEach',
  'Curator_While',
  'Curator_Loop',
  'Curator_Graph',
  'Curator_Call',
  'Curator_Interrupt',
  'Curator_SetState',
  'Curator_Assign',
  'Curator_Reduce',
  'Curator_EmitEvent',
  'Curator_EmitEvents',
  'Curator_Subscribe',
  'Curator_Unsubscribe',
  'Curator_WaitEvent',
]);

/** Plugin node types and unknown types count as history (their Responses are kept). */
export const isControlNode = (type: string | null | undefined): boolean => type != null && CONTROL_NODE_TYPES.has(type);

/** Prisma `include` for `requestOutput`: the request's latest Response. */
export const LATEST_RESPONSE = { responses: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 } } as const;

/** A finished request's result: its `output` (control-flow steps) or its latest Response (history steps). */
export const requestOutput = (row: any): string | null => row?.output ?? row?.responses?.[0]?.content ?? null;

/** Prisma filter: requests that have a result (see `requestOutput`). */
export const HAS_OUTPUT = { OR: [{ output: { not: null } }, { responses: { some: {} } }] } as const;

export interface StepTraceRecord {
  conversationId: number;
  requestId: number;
  projectId: string | null;
  nodeType: string | null;
  status: string;
  /** Control-flow steps, and replayable steps (their result, for fork replay); other history steps: their Response. */
  output: string | null;
  startedAt: Date | null;
  worker: string;
  createdAt: Date;
  /** The request that created this one (see TimeTravel.ts). */
  createdBy?: number | null;
  /** Replayable steps: node hash, final context (secrets masked) and the state patches the step wrote. Roots: context. */
  astHash?: string | null;
  context?: Record<string, any> | null;
  statePatches?: Array<{ scope?: string | null; set: Record<string, any> }> | null;
}

const MAX_BUFFER = 500;

/**
 * Buffers rows of an append-only, time-partitioned table (db/partitions.ts) and writes them with one `createMany`
 * per flush (each poll tick, and when the buffer is full). Observability only: rows still buffered when a process
 * dies are lost, and a failed write is logged and dropped.
 */
export class BatchTraceWriter<T> {
  private buffer: T[] = [];
  private flushing: Promise<void> = Promise.resolve();
  private readonly model: string;

  /** `table`: the Prisma model name (e.g. 'StepTrace'), also its PARTITIONED_TABLES entry. */
  constructor(protected readonly prisma: any, private readonly table: string) {
    this.model = table.charAt(0).toLowerCase() + table.slice(1);
  }

  /** False for clients without the model (test doubles). */
  get enabled(): boolean {
    return Boolean(this.prisma?.[this.model]);
  }

  record(row: T): void {
    if (!this.enabled) return;
    this.buffer.push(row);
    if (this.buffer.length >= MAX_BUFFER) void this.flush();
  }

  /** Writes the buffered rows; concurrent calls run one after the other. */
  flush(): Promise<void> {
    this.flushing = this.flushing.then(async () => {
      if (!this.buffer.length) return;
      const rows = this.buffer;
      this.buffer = [];
      try {
        await this.prisma[this.model].createMany({ data: rows });
      } catch (err: any) {
        logger.warn(`[${this.table}] Dropped ${rows.length} trace row(s): ${err?.message || err}`);
      }
    });
    return this.flushing;
  }

  /** Deletes rows older than `olderThan` in batches (for a table that is not partitioned, e.g. on SQLite). */
  async prune(olderThan: Date): Promise<number> {
    if (!this.enabled) return 0;
    return deleteInChunks(this.prisma[this.model], { createdAt: { lt: olderThan } });
  }

  /**
   * Retires rows older than `ttlMs`: by dropping day partitions where the table is partitioned (Postgres/MariaDB,
   * see db/partitions.ts; also creates the coming days' partitions), otherwise with batched deletes.
   */
  async retire(ttlMs: number, now: Date): Promise<void> {
    if (!this.enabled) return;
    for (const failure of await retireByAge(this.prisma, this.table, ttlMs, now)) logger.warn(`[${this.table}] Partition statement failed: ${failure}`);
  }
}

/** Every finished request, as `StepTrace` rows. */
export class StepTraceWriter extends BatchTraceWriter<StepTraceRecord> {
  constructor(prisma: any) {
    super(prisma, 'StepTrace');
  }

  /** A conversation's rows, oldest first (flush first to include buffered ones). */
  async forConversation(conversationId: number): Promise<any[]> {
    if (!this.enabled) return [];
    return this.prisma.stepTrace.findMany({ where: { conversationId }, orderBy: { id: 'asc' } });
  }
}
