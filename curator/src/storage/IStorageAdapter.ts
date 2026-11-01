import type { CuratorExecutionContext } from '../engine/CuratorContracts.js';
import type { SqlDialect } from '../db/sqlDialect.js';
import { getReadableProjectIds } from '../services/ProjectScopeService.js';

/**
 * Storage port for the request lifecycle: the work queue (`Request`), step output (`Response`) and the
 * conversation event log (`EventLog`). Shapes follow the Prisma schemas (`prisma-sqlite/`, `prisma-mariadb/`,
 * `prisma-postgres/`); see docs/DISTRIBUTED_STORAGE_PLAN.md for why the engine goes through this port.
 *
 * Scoping: a store built with a `StorageScope` reads rows whose `projectId` is one of the scope's project IDs,
 * `'system'`, or null (global rows, as in `buildProjectScopeWhere`), and only writes rows in the scope's projects
 * or `'system'`. Events are scoped through their conversation. Scope IDs come from the host
 * session (`x-project-id`), never from request payloads. A store without a scope is unscoped (embedded
 * single-tenant runs and maintenance).
 */

export type RequestStatus =
  | 'NEW'
  | 'WAITING'
  | 'WAITING_FOR_USER'
  | 'WAITING_FOR_EVENT'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'PAUSED'
  | 'SKIPPED';

export interface StorageScope {
  /** Active project IDs; `'system'` is always visible in addition. */
  projectIds: readonly string[];
}

export interface StoredRequest {
  id: number;
  status: RequestStatus;
  userId: string;
  projectId: string | null;
  conversationId: number;
  agentId: string | null;
  scriptId: number | null;
  scriptVersion: number | null;
  toolName: string | null;
  /** Null in reference mode: the node lives in ScriptVersion, addressed by `context.astPath`. */
  ast: unknown | null;
  context: CuratorExecutionContext | null;
  /** Result of a control-flow step (history steps keep Responses). */
  output: string | null;
  priority: number;
  /** Request to wake (decrement) when this one completes. */
  notifyId: number | null;
  parentId: number | null;
  pendingDependencies: number;
  retryCount: number;
  eventCursor: number | null;
  scheduledAt: Date | null;
  lockedBy: string | null;
  lockedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewRequest {
  userId: string;
  projectId?: string | null;
  conversationId: number;
  status?: RequestStatus;
  agentId?: string | null;
  scriptId?: number | null;
  scriptVersion?: number | null;
  toolName?: string | null;
  ast?: unknown | null;
  context?: CuratorExecutionContext | null;
  priority?: number;
  notifyId?: number | null;
  parentId?: number | null;
  pendingDependencies?: number;
  /** Default: now. */
  scheduledAt?: Date;
  /** Created already claimed (run in-process right away). */
  lockedBy?: string | null;
  lockedAt?: Date | null;
}

export type RequestPatch = Partial<
  Pick<
    StoredRequest,
    | 'status' | 'context' | 'ast' | 'output' | 'priority' | 'pendingDependencies' | 'retryCount' | 'eventCursor'
    | 'scheduledAt' | 'lockedBy' | 'lockedAt' | 'notifyId' | 'scriptId' | 'scriptVersion'
  >
>;

/**
 * Which requests a read or conditional update applies to. Fields combine with AND; `any` is an OR of filters.
 * List fields match any of their values.
 */
export interface RequestFilter {
  ids?: readonly number[];
  conversationId?: number | readonly number[];
  status?: RequestStatus | readonly RequestStatus[];
  /** null: notifies nothing. */
  notifyId?: number | null;
  /** null: a root request. */
  parentId?: number | null;
  /** null: unlocked. */
  lockedBy?: string | null;
  lockedBefore?: Date;
  /** Due later than this (scheduled for the future). */
  scheduledAfter?: Date;
  pendingDependencies?: number;
  priorityBelow?: number;
  agentId?: readonly string[];
  scriptId?: number;
  /** No cursor yet, or one below this. */
  eventCursorBelow?: number;
  /** Has at least one Response. */
  hasResponses?: boolean;
  /** Has a result: an `output` or a Response. */
  hasOutput?: true;
  any?: readonly RequestFilter[];
}

export interface RequestQuery {
  /** Default 'id'. 'claim': priority, then oldest. */
  orderBy?: 'id' | 'id desc' | 'claim' | 'updatedAt' | 'updatedAt desc' | 'scheduledAt';
  take?: number;
}

export interface ClaimOptions {
  /** Most requests to claim. */
  limit: number;
  /** Requests scheduled after this are not due yet. Default: now. */
  now?: Date;
  /** Only claim from these conversations (the processor's polling scope). */
  conversationIds?: readonly number[];
}

export interface StoredResponse {
  id: number;
  requestId: number;
  conversationId: number;
  projectId: string | null;
  /** User who wrote it (a human answer); null for engine output. */
  userId: string | null;
  content: string;
  createdAt: Date;
}

export interface NewResponse {
  requestId: number;
  conversationId: number;
  projectId?: string | null;
  userId?: string | null;
  content: string;
}

export interface StoredEvent {
  id: number;
  conversationId: number;
  eventName: string;
  payload: unknown;
  target: string | null;
  /** Request that emitted the event. */
  source: number | null;
  createdAt: Date;
}

export interface NewEvent {
  conversationId: number;
  eventName: string;
  payload?: unknown;
  target?: string | null;
  source?: number | null;
}

export interface RequestRepository {
  create(input: NewRequest): Promise<StoredRequest>;
  get(id: number): Promise<StoredRequest | null>;
  /**
   * Atomically moves up to `limit` runnable requests (NEW, no pending dependencies, due) to WAITING, locked by
   * `workerId`: highest priority first, then oldest. Two workers never claim the same request.
   */
  claim(workerId: string, options: ClaimOptions): Promise<StoredRequest[]>;
  /** Throws when the request does not exist (or is outside the scope). */
  update(id: number, patch: RequestPatch): Promise<StoredRequest>;
  /**
   * A dependency of `id` finished: decrements its pending dependencies and, when that reaches 0, makes a
   * WAITING or NEW request runnable again (NEW, unlocked). With no pending dependencies left it changes nothing:
   * a claimed request (WAITING, locked, 0 dependencies) must not be unlocked and run twice. Returns the request,
   * or null when it is gone or terminal. Atomic, unlike a read followed by a write.
   */
  dependencyDone(id: number): Promise<StoredRequest | null>;
  /** Returns WAITING requests locked before `lockedBefore` with no pending dependencies to NEW (crashed workers). */
  releaseStale(lockedBefore: Date): Promise<number>;
  find(filter: RequestFilter, query?: RequestQuery): Promise<StoredRequest[]>;
  first(filter: RequestFilter, query?: Omit<RequestQuery, 'take'>): Promise<StoredRequest | null>;
  count(filter: RequestFilter): Promise<number>;
  /**
   * Applies `patch` to every request matching `filter` in one statement; returns how many changed. With `ids`
   * and the expected values in the filter it is a compare-and-swap.
   */
  updateWhere(filter: RequestFilter, patch: RequestPatch): Promise<number>;
  /** Deletes the requests and their Responses; returns how many requests it deleted. */
  delete(ids: readonly number[]): Promise<number>;
}

export interface ResponseRepository {
  append(input: NewResponse): Promise<StoredResponse>;
  /** The most recent response of a request (its result, or why it failed). */
  latest(requestId: number): Promise<StoredResponse | null>;
  listForRequest(requestId: number): Promise<StoredResponse[]>;
  /** The most recent response of each request that has one, in one read. */
  latestFor(requestIds: readonly number[]): Promise<Map<number, StoredResponse>>;
}

export interface EventRepository {
  append(input: NewEvent): Promise<StoredEvent>;
  /** Events of a conversation with id greater than `afterId`, ascending (replay from a cursor). */
  /** With `forTarget`: only broadcast events (no target) and those addressed to it. */
  after(
    conversationId: number,
    afterId: number,
    options?: { eventNames?: readonly string[]; limit?: number; forTarget?: string | null }
  ): Promise<StoredEvent[]>;
  /** The conversation's last event (with `before`: the last created before then). */
  latest(conversationId: number, options?: { before?: Date }): Promise<StoredEvent | null>;
}

export interface StorageCapabilities {
  /** Survives a process restart. */
  durable: boolean;
  /** Several processes can share it (claims are safe across nodes). */
  shared: boolean;
}

export interface IStorageAdapter {
  readonly dialect: SqlDialect | 'memory';
  readonly capabilities: StorageCapabilities;
  readonly scope?: StorageScope;
  requests: RequestRepository;
  responses: ResponseRepository;
  events: EventRepository;
  /** A view over the same rows limited to `scope` (e.g. one per host session). */
  withScope(scope: StorageScope): IStorageAdapter;
  close(): Promise<void>;
}

/** Projects a scope may read and write: its own plus `'system'`. */
export const scopeProjectIds = (scope: StorageScope): string[] => getReadableProjectIds([...scope.projectIds]);

/** Rejects a write whose project is outside the scope (null project included). */
export function assertWritableProject(scope: StorageScope | undefined, projectId: string | null | undefined): void {
  if (!scope) return;
  if (projectId == null || !scopeProjectIds(scope).includes(projectId)) {
    throw new Error(`[storage] Project '${projectId ?? 'null'}' is outside the active scope`);
  }
}
