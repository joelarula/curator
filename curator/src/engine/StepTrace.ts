import { logger } from '../utils/logger.js';
import { deleteInChunks } from './Retention.js';

/**
 * Step history (docs/DISTRIBUTED_STORAGE_PLAN.md, Phase 5). Only some step results are conversation history:
 * those of agents, human input, tools and scripts, which stay `Response` rows (agent history and the conversation
 * context read them). A control-flow step's result is read once, by the request it notifies, so it is stored on
 * the request itself (`Request.output`, trimmed with its context) instead of as a Response row. Every finished
 * request is also recorded in `StepTrace`, an append-only table written in batches for observability.
 */

/** Built-in control-flow node types: their results are `Request.output`, never Responses. */
const CONTROL_NODE_TYPES = new Set([
  'Curator_Sequential',
  'Curator_Parallel',
  'Curator_Join',
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
  /** Control-flow steps only; a history step's result is its Response. */
  output: string | null;
  startedAt: Date | null;
  worker: string;
  createdAt: Date;
}

const MAX_BUFFER = 500;

/**
 * Buffers trace rows and writes them with one `createMany` per flush (each poll tick, and when the buffer is full).
 * Trace is observability: rows still buffered when a process dies are lost, and a failed write is logged and dropped.
 */
export class StepTraceWriter {
  private buffer: StepTraceRecord[] = [];
  private flushing: Promise<void> = Promise.resolve();

  constructor(private readonly prisma: any) {}

  /** False for clients without the StepTrace model (test doubles). */
  get enabled(): boolean {
    return Boolean(this.prisma?.stepTrace);
  }

  record(row: StepTraceRecord): void {
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
        await this.prisma.stepTrace.createMany({ data: rows });
      } catch (err: any) {
        logger.warn(`[StepTrace] Dropped ${rows.length} trace row(s): ${err?.message || err}`);
      }
    });
    return this.flushing;
  }

  /** Deletes rows older than `olderThan` in batches (until the table is partitioned and retired by partition). */
  async prune(olderThan: Date): Promise<number> {
    if (!this.enabled) return 0;
    return deleteInChunks(this.prisma.stepTrace, { createdAt: { lt: olderThan } });
  }
}
