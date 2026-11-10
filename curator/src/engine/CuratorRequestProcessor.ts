import * as vm from 'node:vm';
import { curatorEngine } from './CuratorEngine.js';
import { curatorContext } from './CuratorContext.js';

import type { CuratorAstNode } from './CuratorAst.js';
import { logger } from '../utils/logger.js';
import { validateCuratorAst, parseCuratorRef } from './CuratorAstValidation.js';
import { superviseAgentLoops, isValidSchedule, isCronDue, isScheduleDue, computeNextRunDate } from './AgentScheduleSupervisor.js';
export { isValidSchedule, isCronDue, isScheduleDue, computeNextRunDate };
import { AsyncLocalStorage } from 'node:async_hooks';
import type { CuratorConfig, CuratorEventEmitResult, CuratorReducer, CuratorStructuredResponse } from './CuratorContracts.js';
import { resolveRequestNode, getScriptVersionAst, getEntry, entryAstPath, expandInlineCalls, saveAdhocScript } from './ScriptRegistry.js';
import type { Prisma } from '@prisma/client';
import { LlmFactory } from './llm/LlmFactory.js';
import { appendStatePatch, STATE_SEQ_KEY, STATE_PATCH, STATE_REWIND, stateAt } from './ConversationStateLog.js';
import { ENGINE_PROGRESS_KEYS, STATE_PATCH_KEY, withoutStoredStateCopies } from './RequestContextStorage.js';
import { recordDeadLetter, TERMINAL_STATUSES } from './DeadLetters.js';
import { AbandonedAttemptError, NodeTimeoutError, decideRetry, messageOf, type RetryDecision } from './FaultPolicy.js';
import {
  INTERRUPT_KEY, INTERRUPT_OPENED, InterruptService, describeInterrupt, interruptRequestId, validateResumeValue,
  type ApprovalResume, type CuratorInterrupt, type ListInterruptsFilter, type ResumeInterruptInput, type ResumeInterruptResult,
} from './Interrupts.js';
import { canReadProject } from '../services/ProjectScopeService.js';
import { PROGRESS_EVENT, PROGRESS_EVENT_VERSION, type ProgressEventInput, type StepStatus } from './ProgressEvents.js';
import { stepProgressLabel } from './progressLabel.js';
import { BRANCH_KEY, rulesOf, type MergeRules } from './StateMerge.js';
import { JOIN_FAIL_FAST_KEY } from './nodes/join.js';
import {
  FORK_PATH_KEY, FORK_EVENT, FORK_BOUNDARY_EVENT, ROOT_PATH, REPLAYABLE_NODE_TYPES,
  TimeTravelService, decideReplay, indexRun, nodeHash, rootOf, withoutBookkeeping,
  type StateHistoryEntry, type ForkInput, type ForkResult, type ForkSpec, type OriginalStep, type StepRow, type FinishOrder,
} from './TimeTravel.js';

/** A StepTrace row's finish order (see TimeTravel.FinishOrder). */
const finishOrderOf = (row: any): FinishOrder => [new Date(row.createdAt).getTime(), Number(row.id)];
import { SecretService } from '../services/SecretService.js';
import { clearRequestContexts, completedChildrenWithContext, sweepCompletedContexts, retireByAge } from './Retention.js';
import { PrismaStorageAdapter } from '../storage/PrismaStorageAdapter.js';
import type { IStorageAdapter, RequestFilter, RequestPatch, RequestStatus } from '../storage/IStorageAdapter.js';
import { BatchTraceWriter, StepTraceWriter, isControlNode, type StepTraceRecord } from './StepTrace.js';
import type { LlmCallRecord, LlmTelemetryRecord } from './llm/LlmTrace.js';
import { PostgresWakeChannel } from './WakeChannel.js';
import { sqlDialect, type SqlDialect } from '../db/sqlDialect.js';
import { AgentRoleService } from '../services/AgentRoleService.js';
import { AccessService } from '../services/AccessService.js';
import { normalizeExpression } from './expressionNormalize.js';
import { ChannelService, CHANNEL_REQUEST_EVENTS, type ChannelApi } from '../conversations/ChannelService.js';
import { ApprovalService } from '../services/ApprovalService.js';
import { PluginConfig, PluginConfigService } from '../services/PluginConfigService.js';
import { defaultOutputFormats, type OutputFormats } from './output/OutputFormats.js';
import { defaultHistoryCompactors, type HistoryCompactors } from './history/HistoryCompaction.js';
import {
  NodeRegistry, sequentialNode, parallelNode, joinNode, joinTimeoutNode, routeNode, scriptNode, setStateNode, assignNode, ifElseNode, whileNode, loopNode, forEachNode,
  interruptNode, emitEventNode, emitEventsNode, subscribeNode, unsubscribeNode, waitEventNode, humanInputNode, toolNode, reduceNode,
  graphNode, callNode, agentRefNode, actorRefNode,
  agentNode, agentOutputKey,
} from './nodes/index.js';
import type { NodeContext, NodeHandler, MaintenanceContext, MaintenanceSystem, InflightToolCall, ToolAccessResult, ToolRoleAccessResult, ServiceBinding, ServiceKey } from './nodes/index.js';
// Audit trail = Request/Response rows (see AuditService for the derived read view).

/** Statuses of a request that has not ended. */
const LIVE_STATUSES: RequestStatus[] = ['NEW', 'WAITING', 'WAITING_FOR_USER', 'WAITING_FOR_EVENT', 'PAUSED'];

/**
 * One execution attempt of a request's node, carried in the async context of its handler. A timed-out attempt is
 * `abandoned`: its signal aborts, and engine writes from it throw (its late results are discarded). `spawned`
 * counts requests the attempt created: an attempt that spawned children is never retried (they would run twice).
 */
interface AttemptScope {
  requestId: number;
  /** The request being run (its module and context decide merge rules of its state writes). */
  req: any;
  /** The resolved node: its `retry` / `timeoutMs` apply to this attempt. */
  node: CuratorAstNode;
  controller: AbortController;
  abandoned: boolean;
  spawned: number;
}

/** `store` for node handlers: repository calls from an abandoned attempt throw (see AttemptScope). */
function guardedStore(store: IStorageAdapter, assertLive: () => void): IStorageAdapter {
  const guard = <R extends object>(repo: R): R =>
    new Proxy(repo, {
      get(obj, prop) {
        const value = Reflect.get(obj, prop);
        return typeof value === 'function' ? (...args: any[]) => { assertLive(); return value.apply(obj, args); } : value;
      },
    });
  const repos = { requests: guard(store.requests), responses: guard(store.responses), events: guard(store.events) };
  return new Proxy(store, {
    get(obj, prop) {
      if (prop in repos) return repos[prop as keyof typeof repos];
      const value = Reflect.get(obj, prop);
      return typeof value === 'function' ? value.bind(obj) : value;
    },
  });
}

export interface CuratorRequestProcessorOptions {
  onEvent?: (type: string, payload: any) => void;
  maxConcurrency?: number;
  reserveWebConnections?: number;
  poolLimit?: number;
  /** 'reference' (default): child Requests point to scriptId+scriptVersion+context.astPath; 'snapshot': they carry the AST. */
  astStorage?: 'reference' | 'snapshot';
  /** Maximum nested Curator_Call depth (child mode). Default 16. */
  maxCallDepth?: number;
  /** Tool and reducer registry used for Curator_Tool / Curator_Reduce nodes and direct tool Requests. Default: the global curatorEngine. */
  engine?: ProcessorEngine;
  /** Non-serializable values merged into every tool's toolContext (e.g. `{ host }`). */
  toolContextExtras?: Record<string, any>;
  /** Default lifetime of an approval wait in ms (0 = never expires). Default 24h. Tool nodes may override (`approvalTtlMs`). */
  approvalTtlMs?: number;
  /**
   * Retention. `readOnlyRequests`: completed read-only direct tool Requests (workflow Requests are never pruned).
   * `completedContext`: 'trim' (default) clears a completed Request's context once nothing can read it; 'keep' keeps it.
   */
  retention?: { readOnlyRequests?: 'keep' | 'prune'; readOnlyTtlMs?: number; completedContext?: 'trim' | 'keep' };
  /** Clock (epoch ms) for scheduling, wait deadlines and approval expiry. Default Date.now; injectable for deterministic tests. */
  now?: () => number;
  /** Additional node handlers (plugin node types, or built-in overrides). */
  nodeHandlers?: NodeHandler[];
  /** Names of maintenance systems (built-in or plugin) to skip in the poll loop (e.g. ['pruneReadOnlyRequests']). */
  disabledMaintenance?: string[];
  /** Host services for this processor's handlers and systems; they take precedence over plugin services. */
  services?: ServiceBinding[];
  /**
   * Conversation leases (docs/DISTRIBUTED_STORAGE_PLAN.md, Phase 4): one worker at a time runs a conversation; the
   * lease is renewed while it has requests in flight and lapses `ttlMs` after (default 30s). Default: on for
   * MariaDB/MySQL and Postgres (shared by several nodes), off for SQLite (one writer); `false` turns them off.
   */
  conversationLeases?: false | { ttlMs?: number };
  /**
   * Step trace (docs/DISTRIBUTED_STORAGE_PLAN.md, Phase 5): every finished request is recorded in `StepTrace`,
   * written in batches each poll tick. `prisma`: the database to write it to (default: this processor's);
   * `ttlMs`: rows older than this are deleted hourly (default 7 days, 0 keeps them). `false` turns it off.
   */
  stepTrace?: false | { prisma?: any; ttlMs?: number };
  /**
   * LLM call trace (debugging): every request sent to an LLM, with its response, is recorded in `LlmCall`, written
   * in batches each poll tick (see llm/LlmTrace.ts). Off by default (on with `CURATOR_LLM_TRACE_DB=1`). `prisma`: the
   * database to write it to (default: this processor's); `ttlMs`: rows older than this are retired hourly (default
   * 7 days, 0 keeps them).
   */
  llmCalls?: boolean | { prisma?: any; ttlMs?: number };
  /**
   * Lightweight numeric LLM usage and context telemetry (`LlmTelemetry`): pure numeric and categorical metrics
   * (tokens, characters, latency). On by default unless `CURATOR_LLM_TELEMETRY=0` or `false`.
   */
  llmTelemetry?: boolean | { prisma?: any; ttlMs?: number };
  /**
   * Dispatched events (`BusEvent`: wait_event's mailbox, agents' `history_events`) older than `ttlMs` are retired
   * hourly, by dropping day partitions on Postgres/MariaDB (default 30 days; 0 keeps them).
   */
  busEvents?: { ttlMs?: number };
  /**
   * Cross-node wake-ups on Postgres (LISTEN/NOTIFY, see WakeChannel.ts): `announce()` notifies the other workers,
   * and with `url` (a direct session connection, not PgBouncer in transaction mode) this worker listens and polls
   * when another one announces work. On by default on Postgres (sending only without `url`); `false` turns it off.
   */
  wakeChannel?: false | { url?: string };
  /**
   * Adaptive polling: each idle tick (nothing claimed, nothing running) doubles the poll interval up to
   * `maxIntervalMs` (default 10s, never below the start interval), but never past the next scheduled request; work
   * and `wake()` reset it. `false`: a fixed interval.
   */
  idlePolling?: false | { maxIntervalMs?: number };
  /**
   * Claim order at equal `priority`: follow-up requests of flows under way go before a new flow's first request,
   * until that one has waited this long (then oldest first). Default 10s; 0: plain oldest-first.
   */
  newFlowMaxWaitMs?: number;
  /**
   * How long definitions read for every request are reused: agent lookups (and whether all agents are disabled),
   * tool access decisions (roles) and actor permissions. A change to an agent or a role applies within this time. Default 5s; 0 reads
   * them for every request.
   */
  definitionCacheMs?: number;
}

/** Registries the processor reads; `curatorEngine` by default. Plugin node types, services and systems are optional. */
export interface ProcessorEngine {
  tools: Map<string, any>;
  /** Agent definitions by name (CuratorEngine): their `requiredRole` controls who may address them. */
  agents?: Map<string, any>;
  /** Alias resolution within a project (CuratorEngine); falls back to `tools.get` when absent. */
  resolveTool?(name: string, scope: { projectId?: string | number | null }): any | undefined;
  /** Pattern listing within a project (CuratorEngine); falls back to exact `tools` keys when absent. */
  listTools?(pattern: string, scope: { projectId?: string | number | null }): { name: string; tool: any }[];
  reducers?: Map<string, CuratorReducer>;
  /** Output formatters and tool output rules (CuratorEngine); built-ins only when absent. */
  output?: OutputFormats;
  /** History compaction strategies (CuratorEngine); built-ins only when absent. */
  historyCompactors?: HistoryCompactors;
  config?: CuratorConfig;
  /** Config schemas by namespace (plugin `configSchema`; CuratorEngine). */
  configSchemas?: Map<string, Record<string, any>>;
  nodes?: { get(type: string): NodeHandler | undefined };
  services?: Map<ServiceKey<any>, any>;
  maintenanceSystems?: MaintenanceSystem[];
}

export type CuratorRequestOriginKind = 'AST' | 'REPL' | 'CLI' | 'API' | 'MCP' | 'GRAPHQL';

/** A single direct tool call (REPL / CLI / API) executed as a light Request. */
export interface RunToolRequestInput {
  toolName: string;
  /** Literal arguments, persisted on the Request (no `$`/`{{ }}` evaluation). */
  args?: Record<string, any>;
  /** Runtime-only arguments merged at execution and never persisted (e.g. derived game state). */
  runtimeArgs?: Record<string, any>;
  /** Runtime-only toolContext values (e.g. `{ host }`). */
  runtimeContext?: Record<string, any>;
  conversationId: number;
  userId: string;
  projectId?: string | null;
  agentId?: string | null;
  origin: CuratorRequestOriginKind;
  /** Extra persisted context (e.g. sessionId). */
  context?: Record<string, any>;
  /** Broadcast `result.event` via onEvent. Default true; set false when the caller broadcasts it. */
  broadcastToolEvents?: boolean;
}

export interface RunToolRequestResult {
  requestId: number;
  status: string;
  /** Raw tool output (in-process), falling back to the parsed Response content. */
  result: any;
  /** Structured record when the Response is TOOL_BLOCKED / APPROVAL_REQUIRED. */
  record?: CuratorStructuredResponse;
}

/** Options for the shared event matcher. */
export interface DispatchEventOptions {
  /** Additional wait matching beyond `waitEvent === eventName` (e.g. domain event families). */
  matchWait?: (waitEvent: string | undefined, eventName: string, payload: any) => boolean;
  /** Restrict delivery to one waiting Request in the current conversation. */
  targetRequestId?: number;
  /** Value bound to the resumed Request's alias. Default: the payload. */
  waitValue?: (payload: any) => any;
  /** Keys merged into resumed Requests' context (and context.state when present), e.g. sessionId. */
  contextPatch?: Record<string, any>;
}

/** A single emitted event (REPL / CLI / API) recorded as a Request with an EVENT_EMITTED Response. */
export interface EmitEventRequestInput extends DispatchEventOptions {
  eventName: string;
  payload?: any;
  conversationId: number;
  userId: string;
  projectId?: string | null;
  agentId?: string | null;
  targetAgentId?: string;
  origin: CuratorRequestOriginKind;
  /** Also broadcast via onEvent (ephemeral). Default true. */
  broadcast?: boolean;
}

export interface StepUntilOptions {
  conversationId?: number;
  maxSteps?: number;
  until?: (req: any) => boolean;
}

export interface StepUntilResult {
  steps: number;
  done: boolean;
  waiting: boolean;
  waitingRequest: any | null;
  waitEvent?: string;
}

export class CuratorRequestProcessor {
  private prisma: any;
  private timer: NodeJS.Timeout | null = null;
  public isAdHoc: boolean = false;
  private isPolling = false;
  /** Settles when the current poll is done (idle() waits for it: a poll can outlive stop()). */
  private pollDone: Promise<void> = Promise.resolve();
  private wakePending = false;
  private activeTasks = 0;
  private runningTasks = new Set<Promise<void>>();
  /** Conversations the polling loop serves; null serves all (see setConversationScope). */
  private conversationScope: Set<number> | null = null;
  private backoffUntil: number = 0;
  private workerId = `curator-worker-${Math.random().toString(36).substring(7)}`;
  private onEvent?: (type: string, payload: any) => void;
  private poolLimit: number;
  private reserveWebConnections: number;
  private maxConcurrency: number;
  private astStorage: 'reference' | 'snapshot';
  private maxCallDepth: number;
  /** Script version of the Request being executed; pins child Requests to the same version. */
  private execScope = new AsyncLocalStorage<{ scriptId?: number | null; scriptVersion?: number | null; priority?: number; attempt?: AttemptScope }>();
  private engine: ProcessorEngine;
  private toolContextExtras: Record<string, any>;
  /** In-process data of direct tool Requests: runtime-only inputs and the raw output/error. */
  private inflight = new Map<number, InflightToolCall>();
  private approvalTtlMs: number;
  private retention: { readOnlyRequests: 'keep' | 'prune'; readOnlyTtlMs: number; completedContext: 'trim' | 'keep' };
  private lastPruneAt = 0;
  private lastContextSweepAt = 0;
  private trace?: StepTraceWriter;
  private llmCalls?: BatchTraceWriter<LlmCallRecord>;
  private llmCallTtlMs = 0;
  private lastLlmCallRetireAt = 0;
  private llmTelemetry?: BatchTraceWriter<LlmTelemetryRecord>;
  private llmTelemetryTtlMs = 30 * 24 * 60 * 60 * 1000;
  private lastLlmTelemetryRetireAt = 0;
  private wakeChannel?: PostgresWakeChannel;
  private idlePolling: boolean;
  private idleMaxIntervalMs: number;
  private pollIntervalMs = 3000;
  private idleStreak = 0;
  private traceTtlMs = 0;
  private busEventTtlMs = 30 * 24 * 60 * 60 * 1000;
  private definitionCacheMs = 5_000;
  private definitions = new Map<string, { at: number; value: Promise<any> }>();
  private lastBusEventRetireAt = 0;
  private lastTracePruneAt = 0;
  /** When the maintenance systems last ran: polls woken by finished work skip them until an interval has passed. */
  private lastMaintenanceAt = 0;
  /** Request id -> resolved node type and start time while this worker executes it (req.ast is null in reference mode). */
  /** Requests this worker is executing: node type, start, and the content of the Response it last saved for one. */
  private executing = new Map<number, { nodeType: string; startedAt: Date; lastResponse?: string; astHash?: string; label?: string }>();
  /** Sequence of this process's progress events. */
  private progressSeq = 0;
  /** Fork specs by conversation (null: not a fork), the original runs' step index per fork, and forks past their fork point. */
  private forkSpecs = new Map<number, ForkSpec | null>();
  private forkIndexes = new Map<number, Promise<Map<string, OriginalStep>>>();
  private forkBoundaries = new Set<number>();
  /** Fork-point steps being completed: their fork's statePatch is applied right after their own state merge. */
  private boundaryPatches = new Map<number, Record<string, any>>();
  /** Merge rules of parallels by Join request id (see parallelRules). */
  private joinRules = new Map<number, MergeRules[]>();
  private clock: () => number;
  /** AST node type → handler. */
  private nodes = new NodeRegistry();
  private nodeContext!: NodeContext;
  /** Ordered passes run at the start of every poll tick. */
  private maintenance: MaintenanceSystem[] = [];
  /** Maintenance systems switched off for this processor (applies to plugin systems too). */
  private disabledMaintenance = new Set<string>();
  /** Host services for this processor (checked before the engine's plugin services). */
  private services = new Map<ServiceKey<any>, any>();
  private maintenanceContext!: MaintenanceContext;
  /** Claims (single-statement on MariaDB/Postgres) and conversation leases. */
  private store: PrismaStorageAdapter;
  private leasesOn: boolean;
  /** Conversation id -> requests of it this worker is executing (whose leases it renews). */
  private conversationsInFlight = new Map<number, number>();

  constructor(prisma: any, options: CuratorRequestProcessorOptions = {}) {
    this.prisma = withoutStoredStateCopies(prisma);
    this.clock = options.now ?? Date.now;
    this.onEvent = options.onEvent;
    let dialect: SqlDialect = 'sqlite';
    try {
      dialect = sqlDialect(this.prisma);
    } catch (_) {
      // Test doubles without a Prisma provider: the portable (SQLite) claim path
    }
    const leases = options.conversationLeases === false ? undefined : (options.conversationLeases ?? (dialect === 'sqlite' ? undefined : {}));
    this.leasesOn = leases != null;
    this.store = new PrismaStorageAdapter(this.prisma, {
      clock: this.clock,
      dialect,
      leases: leases ? { ttlMs: leases.ttlMs ?? 30_000 } : undefined,
      newFlowMaxWaitMs: options.newFlowMaxWaitMs ?? (process.env.CURATOR_NEW_FLOW_MAX_WAIT_MS ? parseInt(process.env.CURATOR_NEW_FLOW_MAX_WAIT_MS, 10) : undefined),
    });
    if (options.stepTrace !== false) {
      this.trace = new StepTraceWriter(options.stepTrace?.prisma ?? this.prisma);
      this.traceTtlMs = options.stepTrace?.ttlMs ?? 7 * 24 * 60 * 60 * 1000;
    }
    const llmCalls = options.llmCalls ?? /^(1|true)$/i.test(process.env.CURATOR_LLM_TRACE_DB ?? '');
    if (llmCalls) {
      const opts = typeof llmCalls === 'object' ? llmCalls : {};
      this.llmCalls = new BatchTraceWriter<LlmCallRecord>(opts.prisma ?? this.prisma, 'LlmCall');
      this.llmCallTtlMs = opts.ttlMs ?? 7 * 24 * 60 * 60 * 1000;
    }
    const llmTelemetry = options.llmTelemetry ?? (process.env.CURATOR_LLM_TELEMETRY !== '0' && process.env.CURATOR_LLM_TELEMETRY !== 'false');
    if (llmTelemetry) {
      const opts = typeof llmTelemetry === 'object' ? llmTelemetry : {};
      this.llmTelemetry = new BatchTraceWriter<LlmTelemetryRecord>(opts.prisma ?? this.prisma, 'LlmTelemetry');
      if (opts.ttlMs != null) this.llmTelemetryTtlMs = opts.ttlMs;
    }
    if (dialect === 'postgresql' && options.wakeChannel !== false) {
      this.wakeChannel = new PostgresWakeChannel(this.prisma, this.workerId, () => this.wake(), options.wakeChannel?.url);
    }
    this.idlePolling = options.idlePolling !== false;
    if (options.busEvents?.ttlMs != null) this.busEventTtlMs = options.busEvents.ttlMs;
    if (options.definitionCacheMs != null) this.definitionCacheMs = options.definitionCacheMs;
    this.idleMaxIntervalMs = (options.idlePolling || undefined)?.maxIntervalMs ?? 10_000;
    this.astStorage = options.astStorage ?? 'reference';
    this.maxCallDepth = options.maxCallDepth ?? 16;
    this.engine = options.engine ?? curatorEngine;
    this.toolContextExtras = options.toolContextExtras ?? {};
    this.approvalTtlMs = options.approvalTtlMs ?? 24 * 60 * 60 * 1000;
    this.retention = {
      readOnlyRequests: options.retention?.readOnlyRequests ?? 'keep',
      readOnlyTtlMs: options.retention?.readOnlyTtlMs ?? 30 * 24 * 60 * 60 * 1000,
      completedContext: options.retention?.completedContext ?? 'trim'
    };

    // Capacity & Web Headroom Configuration:
    // Guarantees background task execution never exhausts DB pool or starves web threads
    this.poolLimit = options.poolLimit ?? parseInt(process.env.MARIADB_POOL_LIMIT || process.env.DB_POOL_LIMIT || '25', 10);
    this.reserveWebConnections = options.reserveWebConnections ?? (
      process.env.CURATOR_RESERVE_WEB_CONNS ? parseInt(process.env.CURATOR_RESERVE_WEB_CONNS, 10) : Math.max(10, Math.floor(this.poolLimit * 0.6))
    );

    const availableForBg = Math.max(1, this.poolLimit - this.reserveWebConnections);
    // Background tasks typically consume 1-2 connections during queries / tool execution
    const defaultConcurrency = Math.max(1, Math.min(3, Math.floor(availableForBg / 2)));
    const explicitConcurrency = options.maxConcurrency ?? (process.env.CURATOR_MAX_CONCURRENCY ? parseInt(process.env.CURATOR_MAX_CONCURRENCY, 10) : undefined);
    
    this.maxConcurrency = explicitConcurrency ?? defaultConcurrency;
    logger.debug(`[CuratorRequestProcessor] Concurrency limit initialized to ${this.maxConcurrency} (DB Pool: ${this.poolLimit}, Reserved for Web: ${this.reserveWebConnections})`);

    // Built-in: saved plugin configuration behind $config and config_get / config_set (options may replace it)
    this.services.set(PluginConfig, new PluginConfigService(this.prisma, () => this.engine.configSchemas ?? new Map(), () => this.engine.config ?? {}));

    // Built-in: the interrupt API behind conversation_interrupts / conversation_resume (options may replace it)
    this.services.set(InterruptService, {
      list: (filter: ListInterruptsFilter) => this.listInterrupts(filter),
      resume: (input: ResumeInterruptInput) => this.resumeInterrupt(input),
    });
    // Built-in: join / leave requests into a conversation, sent as the caller (channel_request); the workflow decides
    this.services.set(ChannelService, {
      request: async ({ conversationId, action, userId, projectId }: Parameters<ChannelApi['request']>[0]) => {
        const res = await this.emitEventRequest({
          eventName: CHANNEL_REQUEST_EVENTS[action],
          payload: {},
          conversationId,
          userId,
          projectId,
          origin: 'API',
        });
        return { requestId: res.requestId };
      },
    });
    this.services.set(TimeTravelService, {
      history: (conversationId: number, projectIds: string[]) => this.listStateHistory(conversationId, projectIds),
      stateAt: (conversationId: number, seq: number | undefined, projectIds: string[]) => this.stateAtSeq(conversationId, seq, projectIds),
      fork: (input: ForkInput) => this.forkConversation(input),
    });
    for (const { key, value } of options.services ?? []) this.services.set(key, value);
    this.initNodes(options.nodeHandlers ?? []);
    this.initMaintenance(options.disabledMaintenance ?? []);
  }

  /** Processor services first, then plugin services registered on the engine (including later registrations). */
  private tryService<T>(key: ServiceKey<T>): T | undefined {
    return this.services.has(key) ? this.services.get(key) : this.engine.services?.get(key);
  }

  private service<T>(key: ServiceKey<T>): T {
    const value = this.tryService(key);
    if (value === undefined) throw new Error(`No service provides '${key.name}' (add it to a plugin's services or the processor's services option)`);
    return value;
  }

  /** Binds (or replaces) a service for this processor's node handlers and maintenance systems. */
  public provideService<T>(key: ServiceKey<T>, value: T) {
    this.services.set(key, value);
  }

  private initNodes(extra: NodeHandler[]) {
    this.nodeContext = {
      service: (key) => this.service(key),
      tryService: (key) => this.tryService(key),
      events: {
        dispatch: (eventName, payload, req, targetAgentId, opts) => this.dispatchEvent(eventName, payload, req, targetAgentId, opts),
        addOrigin: (payload, req) => this.addEventOrigin(payload, req),
        resolveCursor: (reqId, conversationId, replay) => this.resolveEventCursor(reqId, conversationId, replay),
        advanceCursor: (reqId, seq) => this.advanceEventCursor(reqId, seq),
        flowChain: (reqId) => this.flowChain(reqId),
        identityOf: (req) => this.identityOf(req),
      },
      tools: {
        get: (name, req) => this.engine.resolveTool?.(name, { projectId: req?.projectId }) ?? this.engine.tools.get(name),
        list: (pattern, req) => {
          if (this.engine.listTools) return this.engine.listTools(pattern, { projectId: req?.projectId });
          const tool = this.engine.tools.get(pattern);
          return tool ? [{ name: pattern, tool }] : [];
        },
        reducer: (name) => this.engine.reducers?.get(name),
        output: this.engine.output ?? defaultOutputFormats,
        checkAccess: (req, toolName, tool) => this.checkToolAccess(req, toolName, tool),
        checkRoleAccess: (req, toolName, tool) => this.checkToolRoleAccess(req, toolName, tool),
        approvalTtlMs: this.approvalTtlMs,
        contextExtras: this.toolContextExtras,
        inflight: (requestId) => this.inflight.get(requestId),
      },
      calls: { maxDepth: this.maxCallDepth, astStorage: this.astStorage },
      history: { compactor: (name) => (this.engine.historyCompactors ?? defaultHistoryCompactors).get(name) },
      llm: {
        provider: (name, baseUrl) => LlmFactory.getProvider(name, baseUrl),
        recordCall: this.llmCalls?.enabled ? (row) => this.llmCalls!.record(row) : undefined,
        recordTelemetry: this.llmTelemetry?.enabled ? (row) => this.llmTelemetry!.record(row) : undefined,
      },
      store: guardedStore(this.store, () => this.assertLive()),
      prisma: this.prisma,
      now: () => this.clock(),
      abortSignal: () => this.currentAttempt()?.controller.signal,
      emit: (type, payload) => this.emit(type, payload),
      progress: (event) => this.progress(event),
      saveResponse: (req, content) => this.saveResponse(req, content),
      completeRequest: (id, status, skipNotify, data) => this.completeRequest(id, status, skipNotify, data),
      failRequest: (req, reason) => this.failRequest(req, reason),
      spawnChildAndParkParent: (req, childData, patch, status) => this.spawnChildAndParkParent(req, childData, patch, status),
      createRequest: (args) => this.createValidatedRequest(args),
      resolveScheduledAt: (node) => this.resolveScheduledAt(node),
      parseContext: (ctx) => this.parseContext(ctx),
      isDynamicExpr: (v): v is string => this.isDynamicExpr(v),
      evaluateExpression: (expr, req) => this.evaluateExpressionAsync(expr, req),
      evaluateArgs: (args, req, literalArgs) => this.evaluateArgs(args, req, literalArgs),
      interpolateTemplate: (template, req) => this.interpolateTemplate(template, req),
      getConversationState: (conv) => this.getConversationState(conv),
      readState: async (conversationId, scope) => {
        const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
        return this.stateView(this.getConversationState(conv), scope);
      },
      writeState: async (conversationId, scope, updates, opts) => { await this.writeState(conversationId, scope, updates, undefined, { rules: opts?.rules as MergeRules | undefined }); },
      resolveHandler: (handler, req) => this.resolveHandler(handler, req),
      mergeRules: (req) => this.mergeRulesFor(req),
      closeJoin: (joinId, flags, reason) => this.closeJoin(joinId, flags, reason),
    };

    // Built-in node types; plugin types registered on the engine are looked up after these (see processRequest).
    const builtins: NodeHandler[] = [
      sequentialNode, parallelNode, joinNode, joinTimeoutNode, routeNode, scriptNode, setStateNode, assignNode, ifElseNode, whileNode, loopNode, forEachNode,
      interruptNode, emitEventNode, emitEventsNode, subscribeNode, unsubscribeNode, waitEventNode, humanInputNode, toolNode, reduceNode,
      graphNode, callNode, agentRefNode, actorRefNode, agentNode,
    ];
    for (const handler of builtins) this.nodes.register(handler);
    for (const handler of extra) this.nodes.register(handler, { override: this.nodes.has(handler.type) });
  }

  /** Registers (or, with `override`, replaces) the handler for an AST node type. */
  public registerNodeHandler(handler: NodeHandler, opts: { override?: boolean } = {}) {
    this.nodes.register(handler, opts);
  }

  private initMaintenance(disabled: string[]) {
    this.maintenanceContext = {
      prisma: this.prisma,
      now: () => this.clock(),
      emit: (type, payload) => this.emit(type, payload),
      service: (key) => this.service(key),
      tryService: (key) => this.tryService(key),
    };
    this.disabledMaintenance = new Set(disabled);
    const builtins: MaintenanceSystem[] = [
      { name: 'unlockStaleRequests', run: () => this.unlockStaleRequests() },
      ...(this.leasesOn
        ? [
            { name: 'renewConversationLeases', run: () => this.store.renewLeases(this.workerId, [...this.conversationsInFlight.keys()]) },
            { name: 'recoverLapsedLeases', run: () => this.recoverLapsedLeases() },
          ]
        : []),
      { name: 'flushStepTrace', run: () => this.flushStepTrace() },
      { name: 'flushLlmCalls', run: () => this.flushLlmCalls() },
      { name: 'flushLlmTelemetry', run: () => this.flushLlmTelemetry() },
      { name: 'retireBusEvents', run: () => this.retireBusEvents() },
      { name: 'pollScheduledAgents', run: () => this.pollScheduledAgents() },
      { name: 'expireApprovalWaits', run: () => this.expireApprovalWaits() },
      { name: 'expireHumanWaits', run: () => this.expireHumanWaits() },
      { name: 'pruneReadOnlyRequests', run: async () => { await this.pruneReadOnlyRequests(); } },
      { name: 'trimCompletedContexts', run: async () => { await this.trimCompletedContexts(); } },
      { name: 'resumeUserResponses', run: () => this.resumeUserRespondedRequests() },
    ];
    this.maintenance = builtins.filter(s => !this.disabledMaintenance.has(s.name));
  }

  /** This processor's systems, then the engine's plugin systems, minus disabled ones. */
  private scheduledMaintenance(): MaintenanceSystem[] {
    const own = new Set(this.maintenance.map(s => s.name));
    const plugin = (this.engine.maintenanceSystems ?? []).filter(s => !own.has(s.name) && !this.disabledMaintenance.has(s.name));
    return [...this.maintenance, ...plugin];
  }

  /**
   * Adds a maintenance system to the poll schedule, by default at the end.
   * `before` / `after` name an existing system to position it relative to.
   */
  public registerMaintenanceSystem(system: MaintenanceSystem, position: { before?: string; after?: string } = {}) {
    if (this.maintenance.some(s => s.name === system.name)) throw new Error(`Maintenance system '${system.name}' is already registered`);
    const anchor = position.before ?? position.after;
    const idx = anchor ? this.maintenance.findIndex(s => s.name === anchor) : -1;
    if (anchor && idx === -1) throw new Error(`Unknown maintenance system '${anchor}'`);
    if (idx === -1) this.maintenance.push(system);
    else this.maintenance.splice(position.before ? idx : idx + 1, 0, system);
  }

  /** Removes a system from this processor's schedule (a plugin system is disabled for this processor). */
  public removeMaintenanceSystem(name: string): boolean {
    const scheduled = this.scheduledMaintenance().some(s => s.name === name);
    this.maintenance = this.maintenance.filter(s => s.name !== name);
    this.disabledMaintenance.add(name);
    return scheduled;
  }

  public maintenanceSystems(): string[] {
    return this.scheduledMaintenance().map(s => s.name);
  }

  private emit(type: string, payload: any) {
    // Node handlers announce an opened interrupt as `curator:interrupt`: it goes out as a progress event only
    if (type === INTERRUPT_OPENED) {
      if (payload?.requestId != null) this.progress({ kind: 'wait.opened', conversationId: payload.conversationId, requestId: payload.requestId, interrupt: payload });
      return;
    }
    try {
      this.onEvent?.(type, payload);
    } catch (_) {}
  }

  /** `$config` for a request: defaults plus saved values (PluginConfigService) of its project and user. */
  private async configFor(req: any): Promise<CuratorConfig> {
    const service = this.tryService(PluginConfig);
    if (!service) return this.engine.config ?? {};
    try {
      return await service.resolve({ projectId: req.projectId ?? null, userId: req.userId ?? null });
    } catch (err: any) {
      logger.warn(`[CuratorRequestProcessor] Saved config unavailable, using defaults: ${err?.message ?? err}`);
      return this.engine.config ?? {};
    }
  }

  /** Emits a typed progress event (`curator:progress`, see ProgressEvents.ts). */
  private progress(event: ProgressEventInput) {
    this.emit(PROGRESS_EVENT, { v: PROGRESS_EVENT_VERSION, seq: ++this.progressSeq, ts: this.clock(), ...event });
  }

  /** The attempt running in this async context, if any (see AttemptScope). */
  private currentAttempt(): AttemptScope | undefined {
    return this.execScope.getStore()?.attempt;
  }

  /** Stops the writes of an abandoned (timed-out) attempt: they would race its retry or failure handling. */
  private assertLive() {
    const attempt = this.currentAttempt();
    if (attempt?.abandoned) throw new AbandonedAttemptError(attempt.requestId);
  }

  /**
   * `args.createdBy`: the request creating this one (default: the attempt running in this async context; null: none).
   * It is stored as `Request.createdBy` (lineage: fork replay rebuilds the run's tree from it), and in a fork
   * conversation the new request's path is stamped in its context too (`__forkPath`).
   */
  private async createValidatedRequest(args: any) {
    this.assertLive();
    const scope = this.execScope.getStore();
    if (scope?.attempt) scope.attempt.spawned++;
    args = { ...args, data: await this.withLineage(args.data, 'createdBy' in args ? args.createdBy : scope?.attempt?.requestId ?? null, args.forkPath) };
    if (scope?.scriptVersion && args.data.scriptId != null && args.data.scriptId === scope.scriptId && args.data.scriptVersion === undefined) {
      args = { ...args, data: { ...args.data, scriptVersion: scope.scriptVersion } };
    }
    // Priority: the explicit one, else the node's own, else the spawning Request's (a flow keeps its priority)
    if (args.data.priority == null) {
      const priority = args.data.ast?.priority ?? scope?.priority;
      const { priority: _unset, ...rest } = args.data;
      args = { ...args, data: priority != null ? { ...rest, priority } : rest };
    }
    if (args.data.ast == null && args.data.scriptId != null) {
      // Reference mode: the node lives in ScriptVersion (validated on save), addressed by context.astPath.
      const { ast: _omit, ...refData } = args.data;
      if (refData.scheduledAt === null || refData.scheduledAt === undefined) delete refData.scheduledAt;
      return this.store.requests.create(refData);
    }
    const validation = validateCuratorAst(args.data.ast);
    if (!validation.valid) {
      throw new Error(`Invalid child Curator AST: ${validation.errors.join('; ')}`);
    }
    const cleanData = { ...args.data, ast: validation.node };
    if (cleanData.scheduledAt === null || cleanData.scheduledAt === undefined) {
      delete cleanData.scheduledAt;
    }
    return this.store.requests.create(cleanData);
  }

  /**
   * Request data with its lineage: `createdBy`, and in a fork the step's path in its context. A context copied from
   * the creator (e.g. a branch's) carries the creator's path, so it is always replaced.
   */
  private async withLineage(data: any, createdBy: number | null, forkPath?: string): Promise<any> {
    const withCreator = createdBy != null ? { ...data, createdBy } : data;
    const parsed = data.context == null ? null : this.parseContext(data.context);
    const path = forkPath ?? (createdBy != null ? await this.forkPathFor(data.conversationId, createdBy) : null);
    if (!path && parsed?.[FORK_PATH_KEY] === undefined) return withCreator;
    const context: Record<string, any> = { ...(parsed || {}) };
    delete context[FORK_PATH_KEY];
    if (path) context[FORK_PATH_KEY] = path;
    return { ...withCreator, context };
  }

  /** In a fork conversation: the path of the next request `createdBy` creates (`<creator path>.<k>`); else null. */
  private async forkPathFor(conversationId: number | undefined, createdBy: number): Promise<string | null> {
    if (conversationId == null || !(await this.forkSpec(conversationId))) return null;
    const creator = await this.store.requests.get(createdBy);
    const creatorPath = creator ? this.parseContext(creator.context)[FORK_PATH_KEY] : undefined;
    if (!creatorPath) return null;
    // The creator runs one attempt at a time, so the children it created so far give the next one its index
    const k = await this.store.requests.count({ conversationId, createdBy });
    return `${creatorPath}.${k}`;
  }

  /** The fork spec of a conversation (its `__fork` event), or null when it is not a fork. Cached per process. */
  private async forkSpec(conversationId: number): Promise<ForkSpec | null> {
    if (this.forkSpecs.has(conversationId)) return this.forkSpecs.get(conversationId)!;
    let spec: ForkSpec | null = null;
    if (this.prisma.eventLog?.findFirst) {
      const row = await this.prisma.eventLog.findFirst({ where: { conversationId, eventName: FORK_EVENT }, orderBy: { id: 'asc' } });
      spec = (row?.payload as ForkSpec) ?? null;
    }
    if (this.forkSpecs.size >= 10_000) this.forkSpecs.clear();
    this.forkSpecs.set(conversationId, spec);
    return spec;
  }

  private getConversationState(conv: any): Record<string, any> {
    if (!conv) return {};
    const raw = conv.state ?? conv.metadata;
    if (!raw) return {};
    let parsed: any = raw;
    if (typeof raw === 'string') {
      try { parsed = JSON.parse(raw); } catch { return {}; }
    }
    if (!parsed || typeof parsed !== 'object') return {};
    // The snapshot cursor of the event-sourced view is bookkeeping, not conversation state.
    const { [STATE_SEQ_KEY]: _seq, ...state } = parsed;
    return state;
  }

  /**
   * Private scopes: a flow carrying `context.__scope` reads shared state plus its own bucket
   * (`state.__scopes[scope]`) and writes only to that bucket. Other buckets are never exposed.
   */
  private stateView(raw: Record<string, any>, scope?: string | null): Record<string, any> {
    const { __scopes, ...shared } = raw || {};
    return scope != null ? { ...shared, ...((__scopes || {})[scope] || {}) } : shared;
  }

  /**
   * Appends a state patch. `writer` is the request whose step writes (default: the attempt running in this async
   * context): it is recorded as the event's source, and its module's and parallel's `stateSchema` decide how the
   * keys merge (StateMerge.ts). `raw` writes the values as given (no merge rules: overrides). `output` marks the
   * writer's result merged on hand-over (a fork re-derives it instead of replaying the event).
   */
  private async writeState(
    conversationId: any,
    scope: string | null | undefined,
    updates: Record<string, any>,
    writer?: any,
    opts: { raw?: boolean; output?: boolean; rules?: MergeRules } = {}
  ) {
    this.assertLive();
    const req = writer ?? this.currentAttempt()?.req;
    const ctx = req ? this.parseContext(req.context) : {};
    const branch = scope == null && ctx[BRANCH_KEY] ? { branch: ctx[BRANCH_KEY] } : {};
    const rules = opts.raw ? undefined : opts.rules ?? (req ? await this.mergeRulesFor(req) : undefined);
    // Event-sourced: append a patch to the EventLog and refresh the materialized view (no read-modify-write race).
    const written = await appendStatePatch(this.prisma, conversationId, { scope: scope ?? null, set: updates, ...branch, ...(opts.output ? { output: true as const } : {}) }, {
      source: req?.id ?? null,
      rules,
      reducer: (name) => this.engine.reducers?.get(name),
    });
    this.progress({ kind: 'state.changed', conversationId: Number(conversationId), requestId: req?.id ?? undefined, stateSeq: written.seq, scope: scope ?? null, keys: Object.keys(updates) });
    return written;
  }

  /**
   * Merge rules of a request's writes: its module's `stateSchema`, then those of the parallels it runs in, outermost
   * first (each parallel's rules are on its Join's node, found through the branch tag `__branch`).
   */
  private async mergeRulesFor(req: any): Promise<MergeRules | undefined> {
    const ctx = this.parseContext(req.context);
    let moduleRules: MergeRules | undefined;
    if (req.scriptId != null && req.scriptVersion != null) {
      try {
        const { ast } = await getScriptVersionAst(this.prisma, req.scriptId, req.scriptVersion);
        if (ast?.type === 'Curator_Module' && (ast as any).stateSchema) moduleRules = rulesOf((ast as any).stateSchema);
      } catch { /* not a stored version: no module rules */ }
    }
    const rules = rulesOf(moduleRules, ...(await this.parallelRules(ctx[BRANCH_KEY]?.join)));
    return Object.keys(rules).length ? rules : undefined;
  }

  /** Rules of the parallel whose Join is `joinId` and of the parallels around it, outermost first. Cached: a Join's node never changes. */
  private async parallelRules(joinId: number | undefined, depth = 0): Promise<MergeRules[]> {
    if (joinId == null || depth > 64) return [];
    const cached = this.joinRules.get(joinId);
    if (cached) return cached;
    const join = await this.store.requests.get(joinId);
    if (!join) return [];
    const own = (this.parseAst(join.ast) as any)?.fanIn?.rules as MergeRules | undefined;
    const chain = [...(await this.parallelRules(this.parseContext(join.context)[BRANCH_KEY]?.join, depth + 1)), ...(own ? [own] : [])];
    if (this.joinRules.size >= 5_000) this.joinRules.clear();
    this.joinRules.set(joinId, chain);
    return chain;
  }

  private parseContext(ctx: any): any {
    if (typeof ctx === 'string') { try { return JSON.parse(ctx); } catch { return {}; } }
    return ctx || {};
  }

  private parseAst(ast: any): any {
    if (typeof ast === 'string') {
      try { return JSON.parse(ast); } catch { return null; }
    }
    return ast || null;
  }

  /** Spawns a validated child request and parks the parent request waiting for it. */
  private async spawnChildAndParkParent(
    req: any,
    childData: Record<string, any>,
    parentContextUpdates: Record<string, any> = {},
    parentStatus: 'WAITING' | 'NEW' = 'WAITING'
  ) {
    await this.createValidatedRequest({
      data: {
        userId: req.userId || 1,
        projectId: req.projectId,
        agentId: req.agentId,
        scriptId: req.scriptId,
        conversationId: req.conversationId,
        status: 'NEW',
        pendingDependencies: 0,
        notifyId: req.id,
        ...childData,
      },
    });
    await this.store.requests.update(req.id, {
      status: parentStatus,
      lockedBy: null,
      lockedAt: null,
      pendingDependencies: 1,
      context: { ...this.parseContext(req.context), ...parentContextUpdates },
    });
  }

  /** Identity used to address events: the private scope, else the request's agent. */
  private identityOf(req: any): string | null {
    const scope = this.parseContext(req.context).__scope;
    if (scope != null) return String(scope);
    return req.agentId != null ? String(req.agentId) : null;
  }

  public isStopped: boolean = false;

  public async start(intervalMs: number = 3000) {
    this.isStopped = false;
    await this.syncToolsToDb();
    await this.syncAgentsToDb();
    logger.debug(`[CuratorRequestProcessor] Starting worker ${this.workerId} with ${intervalMs}ms interval...`);
    this.pollIntervalMs = intervalMs;
    this.idleStreak = 0;
    this.wakeChannel?.start();
    this.schedulePoll(intervalMs);
    this.pollRequests();
  }

  /** The one pending poll timer: replaces any earlier one. */
  private schedulePoll(delayMs: number) {
    if (this.isStopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.pollRequests(), delayMs);
    this.timer.unref?.();
  }

  /**
   * Delay until the next poll: the start interval while there is work; when idle it doubles per tick up to the
   * idle maximum, but never past the next scheduled request.
   */
  private async nextPollDelay(claimed: number): Promise<number> {
    const base = this.pollIntervalMs;
    if (!this.idlePolling || claimed > 0 || this.activeTasks > 0) {
      this.idleStreak = 0;
      return base;
    }
    this.idleStreak = Math.min(this.idleStreak + 1, 16);
    const backoff = Math.min(base * 2 ** this.idleStreak, Math.max(base, this.idleMaxIntervalMs));
    if (backoff <= base) return base;
    try {
      const next = await this.store.requests.first(
        { status: 'NEW', scheduledAfter: new Date(this.clock()), ...this.scopeFilter() },
        { orderBy: 'scheduledAt' }
      );
      if (next?.scheduledAt) return Math.min(backoff, Math.max(base, new Date(next.scheduledAt).getTime() - this.clock()));
    } catch (_) {
      return base;
    }
    return backoff;
  }

  private async syncToolsToDb() {
    try {
      logger.debug(`[CuratorRequestProcessor] Syncing tools from CuratorEngine registry...`);
      let count = 0;

      // Seed baseline security roles
      await AgentRoleService.ensureDefaultRoles(this.prisma);

      // Ensure base roles exist (system roles use id = name; Role.name is only unique per project)
      const adminRole = await this.prisma.role.upsert({
        where: { id: 'Admin' },
        update: { description: 'Full system administrator with all tool and agent permissions' },
        create: { id: 'Admin', name: 'Admin', description: 'Full system administrator with all tool and agent permissions' }
      });

      const workerRole = await this.prisma.role.upsert({
        where: { id: 'AgentWorker' },
        update: { description: 'Standard automated agent worker with safe execution permissions' },
        create: { id: 'AgentWorker', name: 'AgentWorker', description: 'Standard automated agent worker with safe execution permissions' }
      });
      // Role inheritance: Admin includes subRole AgentWorker
      await this.prisma.roleInheritance.upsert({
        where: {
          parentId_subRoleId: {
            parentId: adminRole.id,
            subRoleId: workerRole.id
          }
        },
        update: {},
        create: {
          parentId: adminRole.id,
          subRoleId: workerRole.id
        }
      });

      for (const [name, tool] of curatorEngine.tools.entries()) {
        const accessLevel = (tool as any).accessLevel ?? 'safe_write';
        const requiresConfirmation = (tool as any).requiresConfirmation ?? false;

        await this.prisma.tool.upsert({
          where: { name },
          update: { description: (tool as any).description ?? '', version: '1.0.0', accessLevel, requiresConfirmation },
          create: { name, description: (tool as any).description ?? '', version: '1.0.0', accessLevel, requiresConfirmation }
        });

        count++;
      }
      logger.debug(`[CuratorRequestProcessor] Synced ${count} tools and base roles.`);
    } catch (err) {
      logger.error('[CuratorRequestProcessor] Failed to sync tools to DB:', err);
    }
  }

  private async syncAgentsToDb() {
    try {
      logger.debug(`[CuratorRequestProcessor] Syncing agents from CuratorEngine registry...`);
      let count = 0;

      const workerRole = await this.prisma.role.findUnique({ where: { id: 'AgentWorker' } });

      for (const [name, agentDef] of curatorEngine.agents.entries()) {
        // Ensure system user and project exist
        const user = await this.prisma.user.upsert({
          where: { email: 'system@local' },
          update: {},
          create: { id: '1', name: 'System User', email: 'system@local' }
        });

        const project = await this.prisma.project.upsert({
          where: { id: '1' },
          update: {},
          create: { id: '1', name: 'System Project', userId: user.id }
        });

        const cleanAst = (agentDef as any).ast || {
          type: (agentDef as any).type || 'Curator_Tool',
          toolName: (agentDef as any).toolName,
          args: (agentDef as any).args || {}
        };

        // Same identity as the host seeder (seedAgentsAndTools): id = def.id || key, name = def.name || key.
        // Matching only on the registry key duplicated agents whose definition has a display name.
        const agentId = (agentDef as any).id || name;
        const agentName = (agentDef as any).name || name;
        const existing = await this.prisma.agent.findFirst({
          where: { OR: [{ id: agentId }, { name: agentName }] },
          include: { script: { select: { name: true } } }
        });

        // Keep a script the seeder assigned; only (re)write the one this sync owns.
        let scriptId: number | null = existing?.scriptId ?? null;
        if (!existing?.script || existing.script.name === name) {
          const script = await this.prisma.script.upsert({
            where: { name },
            update: { body: `// Workflow: ${name}`, ast: cleanAst, userId: user.id, projectId: project.id },
            create: { name, body: `// Workflow: ${name}`, ast: cleanAst, userId: user.id, projectId: project.id }
          });
          scriptId = script.id;
        }

        const isAgentEnabled = (agentDef as any).enabled === true;
        // No schedule = trigger-only ('manual'); the AgentScheduleSupervisor starts no loop for it.
        const schedule = (agentDef as any).schedule ?? 'manual';
        const agent = existing
          ? await this.prisma.agent.update({
              where: { id: existing.id },
              data: { scriptId, userId: user.id, projectId: project.id, schedule }
            })
          : await this.prisma.agent.create({
              data: { id: agentId, name: agentName, scriptId, userId: user.id, projectId: project.id, enabled: isAgentEnabled, schedule }
            });

        if (workerRole) {
          await this.prisma.agentRole.upsert({
            where: {
              agentId_roleId: {
                agentId: agent.id,
                roleId: workerRole.id
              }
            },
            update: {},
            create: {
              agentId: agent.id,
              roleId: workerRole.id
            }
          });
        }

        count++;
      }
      logger.debug(`[CuratorRequestProcessor] Synced ${count} agents.`);

      // Clean up any lingering active/pending requests for disabled agents
      try {
        const disabledAgents = await this.prisma.agent.findMany({
          where: { enabled: false },
          select: { id: true, name: true, scriptId: true }
        });
        const totalCount = await this.prisma.agent.count();
        const enabledCount = await this.prisma.agent.count({ where: { enabled: true } });

        if (totalCount > 0 && enabledCount === 0) {
          logger.debug(`[CuratorRequestProcessor] All agents are disabled. Cancelling all active/pending/waiting requests in DB...`);
          await this.store.requests.updateWhere({ status: LIVE_STATUSES }, { status: 'CANCELLED', lockedBy: null, lockedAt: null });
        } else if (disabledAgents.length > 0) {
          for (const da of disabledAgents) {
            const conditions: RequestFilter[] = [{ agentId: [da.id, da.name] }];
            if (da.scriptId) conditions.push({ scriptId: da.scriptId });

            const relatedReqs = await this.store.requests.find({ any: conditions });
            const convIds = Array.from(new Set(relatedReqs.map(r => r.conversationId).filter(Boolean)));
            if (convIds.length > 0) {
              conditions.push({ conversationId: convIds });
            }

            await this.store.requests.updateWhere({ any: conditions, status: LIVE_STATUSES }, { status: 'CANCELLED', lockedBy: null, lockedAt: null });
          }
        }
      } catch (cleanErr) {
        logger.warn('[CuratorRequestProcessor] Error cleaning up requests for disabled agents:', cleanErr);
      }
    } catch (err) {
      logger.error('[CuratorRequestProcessor] Failed to sync agents to DB:', err);
    }
  }

  private lastScheduleMinuteBucket: number = 0;

  /**
   * Limits the polling loop (pickup, prompt timeouts, resumes) to these conversations; null serves all.
   * An embedded host uses it so other conversations in a shared database (old tables) are left alone.
   */
  public setConversationScope(ids: Iterable<number> | null) {
    this.conversationScope = ids ? new Set(ids) : null;
    this.wake();
  }

  /** Request filter for the conversation scope: an explicit conversation, else the polling scope. */
  private scopeFilter(conversationId?: number): RequestFilter {
    if (conversationId !== undefined) return { conversationId };
    return this.conversationScope ? { conversationId: [...this.conversationScope] } : {};
  }

  public stop() {
    this.isStopped = true;
    void this.wakeChannel?.close();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      logger.debug(`[CuratorRequestProcessor] Worker ${this.workerId} stopped.`);
    }
  }

  private async pollScheduledAgents() {
    const now = new Date(this.clock());
    const currentMinuteBucket = Math.floor(now.getTime() / 60000);
    if (this.lastScheduleMinuteBucket === currentMinuteBucket) {
      return; // Already evaluated schedules in this minute
    }
    this.lastScheduleMinuteBucket = currentMinuteBucket;

    try {
      // Scheduling is a Curator_Loop; this supervisor only keeps one live loop per enabled, scheduled Agent.
      const result = await superviseAgentLoops(this.prisma, async (agent, loopAst) => {
        let conversation = await this.prisma.conversation.findFirst({
          where: { userId: agent.userId, projectId: agent.projectId }
        });
        if (!conversation) {
          conversation = await this.prisma.conversation.create({
            data: { userId: agent.userId, projectId: agent.projectId }
          });
        }

        const newReq = await this.createValidatedRequest({
          data: {
            userId: agent.userId,
            projectId: agent.projectId,
            conversationId: conversation.id,
            scriptId: agent.scriptId,
            agentId: agent.id,
            status: 'NEW',
            pendingDependencies: 0,
            ast: loopAst
          }
        });
        logger.debug(`[CuratorRequestProcessor] Scheduler loop for agent '${agent.name}' started on '${agent.schedule}' (Request #${newReq.id})`);
        this.emit('log', { message: `[Curator] Scheduler loop for agent '${agent.name}' started on '${agent.schedule}' (Request #${newReq.id})` });
      });
      if (result.started.length || result.restarted.length || result.cancelled.length) {
        this.emit('database_change', { tables: ['requests', 'agents'] });
      }
    } catch (err: any) {
      logger.error('[CuratorRequestProcessor] Error polling scheduled agents:', err);
    }
  }

  /**
   * Returns how many new tasks can be started without exceeding the safe concurrency threshold.
   */
  public getAvailableConcurrencySlots(): number {
    if (Date.now() < this.backoffUntil) return 0;
    return Math.max(0, this.maxConcurrency - this.activeTasks);
  }

  /** Resumes conversations whose lease lapsed while their owner held claimed requests (a crashed node). */
  private async recoverLapsedLeases() {
    try {
      const released = await this.store.recoverLapsedLeases(this.workerId);
      if (released > 0) {
        logger.warn(`[CuratorRequestProcessor] Took over lapsed conversation leases; released ${released} request(s).`);
        this.wake();
      }
    } catch (_) {}
  }

  /**
   * Recovers stale or abandoned tasks locked by a crashed/restarted worker > 5 mins ago.
   */
  private async unlockStaleRequests() {
    try {
      const stale = await this.store.requests.releaseStale(new Date(Date.now() - 5 * 60 * 1000));
      if (stale > 0) {
        logger.warn(`[CuratorRequestProcessor] Recovered ${stale} stale/abandoned requests.`);
      }
    } catch (_) {}
  }

  /** Wakes requests WAITING_FOR_USER that just received a response (maintenance system). */
  private async resumeUserRespondedRequests() {
    const userRespondedRequests = await this.store.requests.find(
      {
        // A locked WAITING request is being executed (e.g. an agent saving its tool-call turns), not parked.
        any: [{ status: 'WAITING_FOR_USER' }, { status: 'WAITING', lockedBy: null }],
        hasResponses: true,
        ...this.scopeFilter(),
      },
      { take: 5 }
    );

    for (const req of userRespondedRequests) {
      // Approval waits are resumed only by an approval (approveRequest) or by expiry, never by a Response.
      if ((req.context as any)?.pendingToolCall) continue;

      // System records written on the parked Request itself (prompt, approval notice, ...) are not human input.
      const latest = await this.store.responses.latest(req.id);
      let latestParsed: any = null;
      try { latestParsed = typeof latest?.content === 'string' ? JSON.parse(latest.content) : null; } catch (_) {}
      if (CuratorRequestProcessor.isStructuredRecord(latestParsed) && latestParsed.type !== 'CHOICE_RECEIVED') continue;

      // Check targetUserId — if set, only a response from that specific user counts
      const targetUserId = (req.context as any)?.targetUserId;
      if (targetUserId != null) {
        if (!latest || latest.userId == null || String(latest.userId) !== String(targetUserId)) {
          continue; // Not yet answered by the right player
        }
      }

      logger.debug(`[CuratorRequestProcessor] Request ${req.id} received human input. Resuming...`);
      // We lock it briefly so another worker doesn't double-complete it
      await this.store.requests.update(req.id, { status: 'WAITING', lockedBy: this.workerId, lockedAt: new Date() });

      let inputContent: any = latest?.content;
      let parsedContent: any = inputContent;
      try {
        parsedContent = JSON.parse(inputContent);
      } catch (_) {}

      const asKey = (req.context as any)?.choiceAs || (req.context as any)?.as;
      if (asKey) {
        req.context = req.context || {};
        req.context[asKey] = parsedContent;
      }

      // This invokes the same merge-and-notify flow as if an agent finished!
      await this.completeRequest(req.id, 'COMPLETED');
    }
  }

  /** `wake`: a poll for work just submitted in this process, which runs maintenance at most once per interval. */
  private async pollRequests(trigger: 'timer' | 'wake' = 'timer') {
    if (this.isStopped || !this.timer) return;
    if (this.isPolling) return;
    this.isPolling = true;
    let pollFinished!: () => void;
    this.pollDone = new Promise(resolve => (pollFinished = resolve));
    let claimed = 0;
    try {
      if (Date.now() < this.backoffUntil) {
        return;
      }

      // Maintenance systems, in order (see initMaintenance / registerMaintenanceSystem). Under load most polls are
      // wake-ups after a finished request: those claim at once instead of running every system again.
      if (trigger === 'timer' || Date.now() - this.lastMaintenanceAt >= this.pollIntervalMs) {
        this.lastMaintenanceAt = Date.now();
        for (const system of this.scheduledMaintenance()) await system.run(this.maintenanceContext);
      }

      // 2. Check available concurrency capacity before taking new tasks
      const availableSlots = this.getAvailableConcurrencySlots();
      if (availableSlots <= 0) {
        return;
      }

      // 3. Claim NEW requests matching current capacity (one statement on MariaDB/Postgres; leases when on)
      const lockedRequests = await this.store.claimRows(this.workerId, {
        limit: availableSlots,
        now: new Date(this.clock()),
        conversationIds: this.conversationScope ? [...this.conversationScope] : undefined,
      });
      claimed = lockedRequests.length;
      if (lockedRequests.length === 0) return;

      // 4. Dispatch tasks asynchronously within safe concurrency limits
      for (const req of lockedRequests) {
        this.runTask(req);
      }
    } catch (error: any) {
      if (error?.message?.includes('pool failed to retrieve a connection') || error?.message?.includes('Connection pool exhausted')) {
        logger.warn(`[CuratorRequestProcessor] Database connection pool saturated. Backing off for 5s to reserve web headroom...`);
        this.backoffUntil = Date.now() + 5000;
      } else {
        logger.error('[CuratorRequestProcessor] Error polling requests:', error);
      }
    } finally {
      if (!this.isStopped) this.schedulePoll(await this.nextPollDelay(claimed));
      this.isPolling = false;
      pollFinished();
      if (this.wakePending) {
        this.wakePending = false;
        setImmediate(() => this.pollRequests('wake'));
      }
    }
  }

  /**
   * Polls on the next turn of the event loop instead of waiting for the interval: call after work was
   * submitted in this process. The interval stays the fallback for scheduled and cross-process work.
   */
  public wake(): void {
    this.idleStreak = 0;
    if (this.isStopped || !this.timer) return;
    if (this.isPolling) {
      this.wakePending = true;
      return;
    }
    setImmediate(() => this.pollRequests('wake'));
  }

  /**
   * `wake()` plus a hint to the other workers on the database (Postgres NOTIFY): call after work arrived from
   * outside its conversation's owner (an event, an API trigger, a resume), which may hold that conversation's lease.
   */
  public announce(): void {
    this.wake();
    this.wakeChannel?.notify();
  }

  /**
   * Synchronously polls and executes runnable requests in sequence.
   * Enables direct step execution (e.g. human turn to human turn) in embedded CLI and tests.
   * Can be filtered to a specific conversation (e.g. specific table) or step all pending tasks.
   */
  public async step(options?: { conversationId?: number; take?: number }): Promise<number> {
    await this.expireHumanWaits(options?.conversationId);
    const availableSlots = options?.take ?? this.getAvailableConcurrencySlots();
    if (availableSlots <= 0) return 0;

    const lockedRequests = await this.store.claimRows(this.workerId, {
      limit: availableSlots,
      now: new Date(this.clock()),
      conversationIds: options?.conversationId !== undefined ? [options.conversationId] : undefined,
    });

    for (const req of lockedRequests) {
      await this.inConversation(req, () => this.processRequest(req));
    }

    return lockedRequests.length;
  }

  /**
   * Universally steps an AST workflow synchronously in-process
   * until an asynchronous wait gate is reached (WAITING_FOR_EVENT / WAITING_FOR_USER / PAUSED)
   * or execution completes.
   */
  public async stepUntil(options?: StepUntilOptions): Promise<StepUntilResult> {
    const maxSteps = options?.maxSteps ?? 500;
    let steps = 0;
    const convId = options?.conversationId;

    while (steps < maxSteps) {
      // 1. Execute one request (step() also expires timed waits). A flow parked at a wait does not stop the others:
      //    concurrent flows (systems, subscriptions) keep running until nothing in the conversation is runnable.
      //    One at a time so requests spawned meanwhile are ordered by priority too.
      const processed = await this.step({ conversationId: convId, take: 1 });

      if (processed === 0) {
        // Idle: report the wait gate the conversation is parked at, if any
        const finalWait = await this.store.requests.first(
          { ...(convId !== undefined ? { conversationId: convId } : {}), status: ['WAITING_FOR_EVENT', 'WAITING_FOR_USER', 'PAUSED'] },
          { orderBy: 'updatedAt desc' }
        );

        if (finalWait) {
          const ctx = (finalWait.context as any) || {};
          return {
            steps,
            done: false,
            waiting: true,
            waitingRequest: finalWait,
            waitEvent: ctx.waitEvent,
          };
        }

        // Work scheduled for later (e.g. a rate-limit retry) keeps the conversation alive
        const deferred = await this.store.requests.count({
          ...(convId !== undefined ? { conversationId: convId } : {}),
          status: 'NEW',
          scheduledAfter: new Date(this.clock()),
        });

        return {
          steps,
          done: deferred === 0,
          waiting: false,
          waitingRequest: null,
        };
      }

      steps++;

      // 2. Optional custom predicate check
      if (options?.until) {
        const latestReq = await this.store.requests.first(convId !== undefined ? { conversationId: convId } : {}, { orderBy: 'updatedAt desc' });
        if (latestReq && options.until(latestReq)) {
          return {
            steps,
            done: latestReq.status === 'COMPLETED',
            waiting:
              latestReq.status === 'WAITING_FOR_EVENT' ||
              latestReq.status === 'WAITING_FOR_USER' ||
              latestReq.status === 'PAUSED',
            waitingRequest: latestReq,
            waitEvent: (latestReq.context as any)?.waitEvent,
          };
        }
      }
    }

    return {
      steps,
      done: false,
      waiting: false,
      waitingRequest: null,
    };
  }

  private async runTask(req: any) {
    this.activeTasks++;
    const task = (async () => {
      try {
        // Yield to the Node.js event loop before starting heavy task to let web requests process smoothly
        await new Promise(resolve => setImmediate(resolve));
        await this.inConversation(req, () => this.processRequest(req));
      } catch (err) {
        logger.error(`[CuratorRequestProcessor] Task execution error for request ${req.id}:`, err);
      } finally {
        this.activeTasks = Math.max(0, this.activeTasks - 1);
        // Evaluate next pending tasks at once (children it spawned); wake() queues the poll if one is running
        this.wake();
      }
    })();
    this.runningTasks.add(task);
    try {
      await task;
    } finally {
      this.runningTasks.delete(task);
    }
  }

  /** Counts the request as in flight in its conversation while `run` executes (its lease is renewed meanwhile). */
  private async inConversation<T>(req: any, run: () => Promise<T>): Promise<T> {
    const id = Number(req.conversationId);
    this.conversationsInFlight.set(id, (this.conversationsInFlight.get(id) ?? 0) + 1);
    try {
      return await run();
    } finally {
      const left = (this.conversationsInFlight.get(id) ?? 1) - 1;
      if (left > 0) this.conversationsInFlight.set(id, left);
      else this.conversationsInFlight.delete(id);
    }
  }

  /** Resolves once no polled task is running; call after stop() so nothing is torn down mid-request. */
  public async idle(): Promise<void> {
    await this.pollDone;
    while (this.runningTasks.size > 0) {
      await Promise.allSettled([...this.runningTasks]);
    }
    // A stopped worker hands its conversations over at once instead of letting the leases lapse
    if (this.isStopped && this.leasesOn) await this.store.releaseLeases(this.workerId).catch(() => {});
    await this.trace?.flush();
    await this.llmCalls?.flush();
    await this.llmTelemetry?.flush();
  }

  /** Writes buffered trace rows (every tick) and retires rows past the TTL (hourly: partitions or deletes). */
  private async flushStepTrace() {
    if (!this.trace) return;
    await this.trace.flush();
    if (this.traceTtlMs > 0 && Date.now() - this.lastTracePruneAt >= 60 * 60 * 1000) {
      this.lastTracePruneAt = Date.now();
      await this.trace.retire(this.traceTtlMs, new Date(this.clock())).catch((err: any) =>
        logger.warn(`[CuratorRequestProcessor] Retiring StepTrace rows failed: ${err?.message || err}`)
      );
    }
  }

  /** Writes buffered LLM call rows (every tick) and retires rows past the TTL (hourly). */
  private async flushLlmCalls() {
    if (!this.llmCalls) return;
    await this.llmCalls.flush();
    if (this.llmCallTtlMs > 0 && Date.now() - this.lastLlmCallRetireAt >= 60 * 60 * 1000) {
      this.lastLlmCallRetireAt = Date.now();
      await this.llmCalls.retire(this.llmCallTtlMs, new Date(this.clock())).catch((err: any) =>
        logger.warn(`[CuratorRequestProcessor] Retiring LlmCall rows failed: ${err?.message || err}`)
      );
    }
  }

  /** Writes buffered numeric LLM telemetry rows (every tick) and retires rows past the TTL (hourly). */
  private async flushLlmTelemetry() {
    if (!this.llmTelemetry) return;
    await this.llmTelemetry.flush();
    if (this.llmTelemetryTtlMs > 0 && Date.now() - this.lastLlmTelemetryRetireAt >= 60 * 60 * 1000) {
      this.lastLlmTelemetryRetireAt = Date.now();
      await this.llmTelemetry.retire(this.llmTelemetryTtlMs, new Date(this.clock())).catch((err: any) =>
        logger.warn(`[CuratorRequestProcessor] Retiring LlmTelemetry rows failed: ${err?.message || err}`)
      );
    }
  }

  /** Retires dispatched events past their TTL (hourly: drops day partitions, or deletes on SQLite). */
  private async retireBusEvents() {
    if (!(this.busEventTtlMs > 0) || !this.prisma.busEvent || Date.now() - this.lastBusEventRetireAt < 60 * 60 * 1000) return;
    this.lastBusEventRetireAt = Date.now();
    try {
      for (const failure of await retireByAge(this.prisma, 'BusEvent', this.busEventTtlMs, new Date(this.clock()))) {
        logger.warn(`[CuratorRequestProcessor] BusEvent partition statement failed: ${failure}`);
      }
    } catch (err: any) {
      logger.warn(`[CuratorRequestProcessor] Retiring BusEvent rows failed: ${err?.message || err}`);
    }
  }

  /** The node type of a request: the resolved one while this worker executes it, else its stored AST's. */
  private nodeTypeOf(req: any): string | null {
    return this.executing.get(req.id)?.nodeType ?? this.parseAst(req.ast)?.type ?? null;
  }

  /** Runs a request; afterwards the contexts of children that had completed before this run (it consumed them) are trimmed. */
  public async processRequest(request: any) {
    const consumed = await this.consumableChildren(request.id);
    try {
      await this.executeRequest(request);
    } finally {
      if (consumed.length > 0) {
        await clearRequestContexts(this.prisma, consumed).catch((err: any) =>
          logger.warn(`[CuratorRequestProcessor] Retention: trimming children of req ${request.id} failed: ${err?.message || err}`)
        );
      }
    }
  }

  private async consumableChildren(requestId: number): Promise<number[]> {
    if (this.retention.completedContext !== 'trim') return [];
    try {
      return await completedChildrenWithContext(this.prisma, requestId);
    } catch (err: any) {
      logger.warn(`[CuratorRequestProcessor] Retention: listing children of req ${requestId} failed: ${err?.message || err}`);
      return [];
    }
  }

  /** Forgets cached definitions (agents, tool access): call after changing agents or roles in this process. */
  public invalidateDefinitions(): void {
    this.definitions.clear();
  }

  /** A definition read (see `definitionCacheMs`), shared by every request for that long; failures are not kept. */
  private definition<T>(key: string, load: () => Promise<T>): Promise<T> {
    if (!(this.definitionCacheMs > 0)) return load();
    const now = Date.now();
    const hit = this.definitions.get(key);
    if (hit && now - hit.at < this.definitionCacheMs) return hit.value;
    if (this.definitions.size >= 2_000) {
      for (const [k, v] of this.definitions) if (now - v.at >= this.definitionCacheMs) this.definitions.delete(k);
      if (this.definitions.size >= 2_000) this.definitions.clear();
    }
    const value = load();
    this.definitions.set(key, { at: now, value });
    value.catch(() => this.definitions.delete(key));
    return value;
  }

  private async executeRequest(request: any) {
    logger.debug(`[CuratorRequestProcessor] Processing request ${request.id}`);
    this.emit('request_start', { requestId: request.id });
    // The node whose fault policy applies (null until resolved: resolution failures fall back to the default policy)
    let policyNode: CuratorAstNode | null = null;
    let attempt: AttemptScope | undefined;
    try {
      // A claimed row was read just after its claim; a bare `{ id }` is loaded
      const req: any = 'status' in request && 'ast' in request ? request : await this.store.requests.get(request.id);
      if (!req) throw new Error(`Request ${request.id} not found`);

      let agent: any = null;
      try {
        const [totalAgents, enabledCount] = await this.definition('agents:counts', () =>
          Promise.all([this.prisma.agent.count(), this.prisma.agent.count({ where: { enabled: true } })])
        );
        if (totalAgents > 0 && enabledCount === 0) {
          logger.debug(`[CuratorRequestProcessor] Cancelling request ${req.id}: all agents are disabled.`);
          await this.saveResponse(req, 'ERROR: cancelled, all agents are disabled');
          await this.completeRequest(req.id, 'CANCELLED');
          return;
        }

        const agentNamed = (idOrName: string) =>
          this.definition(`agent:${idOrName}`, () => this.prisma.agent.findFirst({ where: { OR: [{ id: idOrName }, { name: idOrName }] } }));
        if (req.agentId) {
          agent = await agentNamed(req.agentId);
        }
        if (!agent && req.scriptId) {
          agent = await this.definition(`agent:script:${req.scriptId}`, () => this.prisma.agent.findFirst({ where: { scriptId: req.scriptId } }));
        }
        if (!agent && req.conversationId) {
          const relatedAgentId = await this.definition(`agent:conversation:${req.conversationId}`, async () =>
            (await this.prisma.request.findFirst({
              where: { conversationId: req.conversationId, agentId: { not: null } },
              select: { agentId: true }
            }))?.agentId ?? null
          );
          if (relatedAgentId) agent = await agentNamed(relatedAgentId);
        }

        if (!agent && req.ast?.name) {
          const astName: string = req.ast.name;
          agent = await this.definition(`agent:ast:${astName}`, () =>
            this.prisma.agent.findFirst({
              where: {
                OR: [
                  { name: astName },
                  { name: { contains: astName.replace(/^(seq|pipeline)_scrape_/, '') } }
                ]
              }
            })
          );
        }

        if (agent && agent.enabled === false) {
          logger.debug(`[CuratorRequestProcessor] Cancelling request ${req.id}: associated agent '${agent.name}' is disabled.`);
          await this.saveResponse(req, `ERROR: cancelled, associated agent '${agent.name}' is disabled`);
          await this.completeRequest(req.id, 'CANCELLED');
          return;
        }
      } catch (_) {}

      // Addressing an agent is role-controlled: checked on a run's first request (requests it creates are covered by
      // tool narrowing), for explicit agent requests only.
      if (req.agentId && req.parentId == null && req.createdBy == null) {
        const access = await this.checkAgentAddressAccess(req, agent);
        if (!access.allowed) {
          logger.debug(`[CuratorRequestProcessor] Request ${req.id} refused: ${access.reason}`);
          await this.saveResponse(req, JSON.stringify({ type: 'AGENT_BLOCKED', agent: agent?.name ?? req.agentId, reason: access.reason }));
          await this.completeRequest(req.id, 'FAILED');
          return;
        }
      }

      await this.ensureScriptReference(req);
      let resolvedNode: CuratorAstNode | null;
      try {
        resolvedNode = (await resolveRequestNode(this.prisma, req)).node;
      } catch (resolveErr: any) {
        const message = `Cannot resolve AST: ${resolveErr.message}`;
        logger.error(`[CuratorRequestProcessor] Request ${request.id} rejected: ${message}`);
        await this.saveResponse(req, `ERROR: ${message}`);
        await this.completeRequest(request.id, 'FAILED');
        return;
      }
      const validation = validateCuratorAst(resolvedNode);
      if (!validation.valid) {
        const message = `Invalid Curator AST: ${validation.errors.join('; ')}`;
        logger.error(`[CuratorRequestProcessor] Request ${request.id} rejected: ${message}`);
        await this.saveResponse(req, `ERROR: ${message}`);
        await this.completeRequest(request.id, 'FAILED');
        return;
      }
      const ast: CuratorAstNode = validation.node!;
      policyNode = ast;
      attempt = { requestId: req.id, req, node: ast, controller: new AbortController(), abandoned: false, spawned: 0 };

      await this.execScope.run({ scriptId: req.scriptId, scriptVersion: req.scriptVersion, priority: req.priority ?? undefined, attempt }, () => curatorContext.run({
        userId: req.userId,
        projectId: req.projectId || 1,
        userIds: [req.userId],
        projectIds: [req.projectId || 1],
        sessionId: req.conversationId,
        requestId: req.id,
        prisma: this.prisma
      }, async () => {
        if (!ast) {
          await this.completeRequest(request.id, 'COMPLETED');
          return;
        }

        // Lifecycle hooks (entryAction / exitAction): expand once into a sequential wrapper around the core node.
        if ((ast.entryAction || ast.exitAction) && !(req.context as any)?.__hooksExpanded__) {
          const { entryAction, exitAction, ...coreNode } = ast as any;
          const steps: CuratorAstNode[] = [];
          if (entryAction) steps.push(entryAction);
          steps.push(coreNode as CuratorAstNode);
          if (exitAction) steps.push(exitAction);
          await this.nodes.get('Curator_Sequential')!.run({ type: 'Curator_Sequential', subAgents: steps }, { ...req, context: { ...(req.context || {}), __hooksExpanded__: true } }, this.nodeContext);
          return;
        }

        const label = stepProgressLabel(
          ast as any,
          (name) => this.engine.resolveTool?.(name, { projectId: req.projectId ?? undefined }) ?? this.engine.tools.get(name),
          (name) => this.engine.agents?.get(name)
        );
        this.executing.set(req.id, {
          nodeType: ast.type,
          startedAt: new Date(this.clock()),
          // Replayable steps record their node's hash in StepTrace (a fork matches steps by it)
          ...(REPLAYABLE_NODE_TYPES.has(ast.type) ? { astHash: nodeHash(ast) } : {}),
          ...(label ? { label } : {}),
        });
        this.progress({ kind: 'step.started', conversationId: req.conversationId, requestId: req.id, nodeType: ast.type, attempt: (req.retryCount ?? 0) + 1, ...(label ? { label } : {}) });
        // In a fork, a step recorded before the fork point returns its recorded result instead of running
        if (await this.replayIfForked(req, ast)) return;
        const handler = this.nodes.get(ast.type) ?? this.engine.nodes?.get(ast.type);
        if (!handler) {
          logger.warn(`[CuratorRequestProcessor] Request ${req.id} has unknown AST type: ${(ast as any).type}. Skipping.`);
          await this.saveResponse(req, `ERROR: unknown AST type '${(ast as any).type}'`);
          await this.completeRequest(req.id, 'SKIPPED');
          return;
        }
        return await this.runAttempt(handler, ast, req, attempt!);
      }));
    } catch (error: any) {
      const msg = messageOf(error);
      const req = await this.store.requests.get(request.id);
      if (req && (await this.retryIfAllowed(req, policyNode, attempt, error))) return;

      logger.error(`[CuratorRequestProcessor] Failed request ${request.id}:`, error);
      try {
        await this.saveResponse(request, `ERROR: ${msg}`);
      } catch (dbErr) {
        logger.error(`[CuratorRequestProcessor] Failed to write error response:`, dbErr);
      }
      await this.completeRequest(request.id, 'FAILED');
    } finally {
      this.executing.delete(request.id);
    }
  }

  /** Stamps an object payload with the conversation (as `conversationId` / `tableId`) and session it was emitted from. */
  private addEventOrigin(payload: any, req: any) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
    if (req.conversationId !== undefined && req.conversationId !== null) {
      if (payload.conversationId === undefined) {
        payload.conversationId = req.conversationId;
      }
      if (payload.tableId === undefined) {
        payload.tableId = String(req.conversationId);
      }
    }
    if (payload.sessionId === undefined) {
      const sessId = req.context?.sessionId || (req.context as any)?.state?.sessionId || req.sessionId;
      if (sessId) {
        payload.sessionId = sessId;
      }
    }
  }

  /**
   * Single event matcher for subscribe and wait (design 4.3):
   *  - EventSubscription rows (static + conversation-scoped) spawn handler Requests (`parentId` = emitter);
   *  - parked WAITING_FOR_EVENT / WAITING_FOR_USER Requests with a matching `waitEvent` are resumed.
   */
  public async dispatchEvent(eventName: string, payload: any, req: any, targetAgentId?: string, opts: DispatchEventOptions = {}): Promise<CuratorEventEmitResult> {
    const target = targetAgentId != null && targetAgentId !== '' ? String(targetAgentId) : null;
    const eventSeq = await this.logEvent(req.conversationId, eventName, payload, target, req.id ?? null);

    const subscriptions = this.prisma.eventSubscription
      ? await this.prisma.eventSubscription.findMany({
          where: {
            eventName,
            isActive: true,
            OR: [
              { conversationId: req.conversationId },
              { conversationId: null }
            ]
          },
          include: { script: true }
        })
      : [];

    const spawned: number[] = [];
    for (const sub of subscriptions) {
      if (target && String(sub.agentId) !== target) continue;
      if (!sub.script) continue;
      const alias = sub.payloadAs || 'event';

      if (sub.when) {
        const matches = await this.evaluateExpressionAsync(sub.when, {
          conversationId: req.conversationId,
          context: { [alias]: payload, event: payload, payload, params: { [alias]: payload } }
        });
        if (!matches) continue;
      }

      // The declaring Script's AST is the source of truth; reference its active version when versioned.
      let astData: any;
      let astPath: string | undefined;
      let scriptVersion: number | undefined;
      // A handler runs at its own priority, not the emitter's
      let priority: number | undefined;
      try {
        if (sub.script.currentVersion > 0) {
          const loaded = await getScriptVersionAst(this.prisma, sub.scriptId, sub.script.currentVersion);
          scriptVersion = loaded.version;
          astPath = entryAstPath(loaded.ast, sub.entry);
          const entryNode = getEntry(loaded.ast, sub.entry ?? undefined).node;
          priority = entryNode.priority;
          if (this.astStorage === 'snapshot') {
            astData = loaded.ast.type === 'Curator_Module' ? expandInlineCalls(entryNode, loaded.ast as any) : entryNode;
          }
        } else {
          const legacy = typeof sub.script.ast === 'string' ? JSON.parse(sub.script.ast) : sub.script.ast;
          if (!legacy) continue;
          astData = getEntry(legacy, sub.entry ?? undefined).node;
          priority = astData.priority;
        }
      } catch (err: any) {
        logger.warn(`[CuratorRequestProcessor] Subscription ${sub.id} for '${eventName}' skipped: ${err.message}`);
        continue;
      }

      const child = await this.createValidatedRequest({
        createdBy: req.id ?? null,
        data: {
          userId: sub.userId,
          projectId: sub.projectId,
          conversationId: req.conversationId,
          parentId: req.id, // causality: spawned by this emit Request
          scriptId: sub.scriptId,
          scriptVersion,
          agentId: sub.agentId ?? undefined,
          status: 'NEW',
          ast: astData,
          priority: priority ?? 0,
          // An addressed event spawns a private handler: it cannot read or write other flows' state.
          // `emittedBy`: who sent the event (set here, never from the payload), e.g. the person asking to join a channel
          context: {
            params: { [alias]: payload },
            input: payload,
            eventName,
            origin: 'AST',
            astPath,
            emittedBy: { userId: req.userId != null ? String(req.userId) : null, agentId: AgentRoleService.actorAgentId(req) ?? null, projectId: req.projectId ?? null },
            ...(target ? { __scope: target } : {}),
          }
        }
      });
      spawned.push(child.id);
    }

    // Wake up WAITING_FOR_EVENT and WAITING_FOR_USER requests matching waitEvent
    const waitingRequests = await this.store.requests.find({ conversationId: req.conversationId, status: ['WAITING_FOR_EVENT', 'WAITING_FOR_USER'] });

    const woken: number[] = [];
    for (const waitReq of waitingRequests) {
      if (opts.targetRequestId !== undefined && waitReq.id !== opts.targetRequestId) continue;
      const ctx = waitReq.context as any;
      const waitingEvents = Array.isArray(ctx?.waitEvents) && ctx.waitEvents.length > 0 ? ctx.waitEvents : (ctx?.waitEvent ? [ctx.waitEvent] : []);
      const matches = waitingEvents.includes(eventName) || (opts.matchWait?.(ctx?.waitEvent, eventName, payload) ?? false);
      if (matches && target && this.identityOf(waitReq) !== target) continue;
      if (matches) {
        logger.debug(`[CuratorRequestProcessor] Waking up request ${waitReq.id} waiting for event ${eventName}`);
        await this.wakeWaitingRequest(waitReq, eventName, opts.waitValue ? opts.waitValue(payload) : payload, { contextPatch: opts.contextPatch });
        woken.push(waitReq.id);
        if (eventSeq !== null) await this.advanceEventCursor(waitReq.id, eventSeq);
      }
    }

    logger.debug(`[CuratorRequestProcessor] Event '${eventName}': spawned ${spawned.length}, woke ${woken.length}`);
    return { eventName, spawned, woken };
  }

  /** Appends to the conversation's bus events; returns its sequence id (null if the DB has no BusEvent table). */
  /**
   * Resumes a parked wait (event wait or human prompt) with `value`: binds it to the wait's alias (context and
   * state), marks the wait answered and makes the request runnable. `bindInput` also sets `context.input` when
   * there is no alias (a resumed prompt without `as` reads its answer from there).
   */
  private async wakeWaitingRequest(
    waitReq: any,
    eventName: string,
    rawValue: any,
    opts: { contextPatch?: Record<string, any>; bindInput?: boolean } = {}
  ) {
    const ctx = this.parseContext(waitReq.context);
    let value = rawValue;
    const isMultiWait = Array.isArray(ctx?.waitEvents) && ctx.waitEvents.length > 1;
    if (isMultiWait && value && typeof value === 'object' && !Array.isArray(value) && value._eventName === undefined) {
      value = { ...value, _eventName: eventName };
    }

    const aliasKey = ctx.payloadAlias || ctx.choiceAs || ctx.as;
    let newState: Record<string, any> = isMultiWait ? { lastWokenEvent: eventName } : {};
    if (aliasKey) {
      newState = { ...newState, [aliasKey]: value };
    }

    const updatedContext = { ...ctx };
    delete updatedContext.waitEvent;
    delete updatedContext.waitEvents;
    delete updatedContext.payloadAlias;
    delete updatedContext[INTERRUPT_KEY];
    updatedContext.__humanInputReceived__ = true;
    if (isMultiWait) {
      updatedContext.lastWokenEvent = eventName;
    }
    if (!aliasKey && opts.bindInput) updatedContext.input = value;
    if (aliasKey || isMultiWait) {
      if (aliasKey) updatedContext[aliasKey] = value;
      updatedContext.state = { ...(updatedContext.state || {}), ...newState };

      await this.writeState(waitReq.conversationId, ctx?.__scope, newState, waitReq);
    }
    if (opts.contextPatch) {
      Object.assign(updatedContext, opts.contextPatch);
      // Request-only state keys: context.state is not stored, so they ride along under their own key
      updatedContext[STATE_PATCH_KEY] = { ...(updatedContext[STATE_PATCH_KEY] || {}), ...opts.contextPatch };
    }

    await this.store.requests.update(waitReq.id, { status: 'NEW', lockedBy: null, lockedAt: null, context: updatedContext });
  }

  private async logEvent(conversationId: number, eventName: string, payload: any, target: string | null = null, source: number | null = null): Promise<number | null> {
    if (!this.prisma.busEvent || conversationId == null) return null;
    const row = await this.store.events.append({ conversationId, eventName, payload: payload === undefined ? null : payload, target, source });
    return row.id;
  }

  /** Request ids of a flow: the request and everything it notifies, stopping before a Join. */
  private async flowChain(reqId: number | null | undefined): Promise<Set<number>> {
    const ids = new Set<number>();
    let id = reqId ?? null;
    for (let depth = 0; id != null && depth < 500; depth++) {
      const r = await this.store.requests.get(id);
      if (!r || this.parseAst(r.ast)?.type === 'Curator_Join') break;
      ids.add(id);
      id = r.notifyId;
    }
    return ids;
  }

  private async latestEventSeq(conversationId: number): Promise<number> {
    if (!this.prisma.busEvent) return 0;
    return (await this.store.events.latest(conversationId))?.id ?? 0;
  }

  /**
   * Raises the cursor of `reqId` and of every request it notifies (its flow, forward along notifyId),
   * stopping before a Join so parallel branches keep independent cursors.
   */
  private async advanceEventCursor(reqId: number, seq: number) {
    let id: number | null = reqId;
    for (let depth = 0; id != null && depth < 500; depth++) {
      const r = await this.store.requests.get(id);
      if (!r || this.parseAst(r.ast)?.type === 'Curator_Join') return;
      await this.store.requests.updateWhere({ ids: [id], eventCursorBelow: seq }, { eventCursor: seq });
      id = r.notifyId;
    }
  }

  /**
   * The flow's cursor: the request's own, else the nearest one it notifies. When the flow never waited, falls
   * back to the last event logged before the flow's anchor (chain end / Join) was created, so events emitted
   * before its first wait are still delivered.
   */
  private async resolveEventCursor(reqId: number, conversationId: number, replay = false): Promise<number> {
    let id: number | null = reqId;
    let anchor: Date | null = null;
    for (let depth = 0; id != null && depth < 500; depth++) {
      const r = await this.store.requests.get(id);
      if (!r) break;
      anchor = r.createdAt;
      if (this.parseAst(r.ast)?.type === 'Curator_Join') break;
      if (r.eventCursor != null) return r.eventCursor;
      id = r.notifyId;
    }
    if (replay) return 0;
    if (!anchor) return this.latestEventSeq(conversationId);
    return (await this.store.events.latest(conversationId, { before: anchor }))?.id ?? 0;
  }

  /**
   * Parses a node's `scheduledAt` field into a Date for use in Request.scheduledAt.
   * Supports:
   *  - ISO 8601 strings: "2026-12-25T09:00:00Z"
   *  - Human duration strings: "in 5 minutes", "in 2 hours", "in 1 day"
   *  - undefined/null → returns undefined (execute immediately)
   */
  private resolveScheduledAt(nodeAst: any): Date | undefined {
    const raw: string | undefined = nodeAst?.scheduledAt;
    if (!raw) return undefined;
    const lower = raw.trim().toLowerCase();
    const inMatch = lower.match(/^in\s+(\d+(?:\.\d+)?)\s*(second|minute|hour|day|week)s?$/);
    if (inMatch) {
      const amount = parseFloat(inMatch[1]);
      const unit = inMatch[2];
      const msMap: Record<string, number> = {
        second: 1000,
        minute: 60_000,
        hour: 3_600_000,
        day: 86_400_000,
        week: 604_800_000
      };
      return new Date(this.clock() + amount * (msMap[unit] || 0));
    }
    // Try ISO parse
    const d = new Date(raw);
    return isNaN(d.getTime()) ? undefined : d;
  }

  /** Q4: composite ad-hoc root ASTs become anonymous ScriptVersions; versioned roots record their version. */
  private async ensureScriptReference(req: any) {
    if (req.parentId || req.notifyId || !this.prisma.scriptVersion) return;
    try {
      if (req.scriptId) {
        if (req.scriptVersion) return;
        const script = await this.prisma.script.findUnique({ where: { id: req.scriptId }, select: { currentVersion: true } });
        if (!script?.currentVersion) return;
        await this.store.requests.update(req.id, { scriptVersion: script.currentVersion });
        req.scriptVersion = script.currentVersion;
        return;
      }
      const ast = typeof req.ast === 'string' ? JSON.parse(req.ast) : req.ast;
      // Light single-tool Requests stay snapshot-only (no script per distinct argument set).
      if (!ast?.type || ast.type === 'Curator_Tool') return;
      const saved = await saveAdhocScript(this.prisma, ast, { userId: req.userId, projectId: req.projectId });
      await this.store.requests.update(req.id, { scriptId: saved.scriptId, scriptVersion: saved.version });
      req.scriptId = saved.scriptId;
      req.scriptVersion = saved.version;
    } catch (err: any) {
      logger.warn(`[CuratorRequestProcessor] Request ${req.id}: script reference not recorded: ${err.message}`);
    }
  }

  private isDynamicExpr(v: unknown): v is string {
    return (
      typeof v === 'string' &&
      (v.startsWith('{{') ||
        v.startsWith('$') ||
        (v.startsWith('(') && v.endsWith('(context)')) ||
        (/^(?:\(|not\s+|!|Boolean\(|String\()/.test(v) && /\$(?:context|state|params|config|actor)\b/.test(v)))
    );
  }

  /** Evaluates `$context...` / `{{ }}` / `(fn)(context)` values of an args object in the caller's context. */
  private async evaluateArgs(args: Record<string, any> | undefined, req: any, literalArgs = false): Promise<Record<string, any>> {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(args || {})) {
      if (literalArgs) {
        out[k] = v;
      } else if (this.isDynamicExpr(v)) {
        out[k] = await this.evaluateExpressionAsync(v, req);
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        out[k] = await this.evaluateArgs(v as Record<string, any>, req, literalArgs);
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  /**
   * Runs one attempt of `handler`. With `timeoutMs`, an attempt still running past it is abandoned: its signal
   * aborts, its later engine writes throw, and the attempt fails with a NodeTimeoutError.
   */
  private async runAttempt(handler: NodeHandler, ast: CuratorAstNode, req: any, attempt: AttemptScope) {
    const timeoutMs = (ast as any).timeoutMs;
    const run = handler.run(ast, req, this.nodeContext);
    if (!(timeoutMs > 0)) return await run;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const err = new NodeTimeoutError(timeoutMs);
        attempt.abandoned = true;
        attempt.controller.abort(err);
        reject(err);
      }, timeoutMs);
    });
    // The abandoned run may still settle later; its outcome is discarded
    run.catch(() => {});
    try {
      return await Promise.race([run, timedOut]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Applies the node's fault policy to a failed attempt of `req` (still non-terminal): reschedules it and returns
   * true, or returns false to let the failure stand. An attempt that spawned requests is never retried.
   */
  private async retryIfAllowed(req: any, node: CuratorAstNode | null, attempt: AttemptScope | undefined, error: unknown): Promise<boolean> {
    const decision: RetryDecision = decideRetry((node as any)?.retry, req.retryCount ?? 0, error);
    if (!decision.retry) {
      if (decision.reason === 'exhausted') {
        logger.debug(`[CuratorRequestProcessor] Request ${req.id}: ${decision.errorClass} after ${decision.attempt}/${decision.maxAttempts} attempts, giving up`);
      }
      return false;
    }
    if (attempt && attempt.spawned > 0) {
      logger.warn(`[CuratorRequestProcessor] Request ${req.id} not retried: the failed attempt created ${attempt.spawned} request(s)`);
      return false;
    }
    const msg = messageOf(error);
    const scheduledAt = new Date(this.clock() + decision.delayMs);
    logger.debug(`[CuratorRequestProcessor] Request ${req.id}: ${decision.errorClass}, retrying in ${Math.round(decision.delayMs / 1000)}s (attempt ${decision.attempt + 1}/${decision.maxAttempts})`);
    await this.store.requests.update(req.id, { status: 'NEW', lockedBy: null, lockedAt: null, retryCount: (req.retryCount ?? 0) + 1, scheduledAt });
    this.progress({ kind: 'step.retrying', conversationId: req.conversationId, requestId: req.id, attempt: decision.attempt, maxAttempts: decision.maxAttempts, errorClass: decision.errorClass, delayMs: decision.delayMs, error: msg });
    this.trace?.record({
      conversationId: req.conversationId,
      requestId: req.id,
      projectId: req.projectId ?? null,
      nodeType: this.nodeTypeOf(req),
      status: 'RETRY',
      output: `${decision.errorClass}: ${msg}`.slice(0, 2000),
      startedAt: this.executing.get(req.id)?.startedAt ?? null,
      worker: this.workerId,
      createdAt: new Date(this.clock()),
    });
    return true;
  }

  private async failRequest(req: any, reason: string) {
    // A handler failing its own running attempt: the node's fault policy may run it again instead
    const attempt = this.currentAttempt();
    if (attempt && attempt.requestId === req.id && !attempt.abandoned) {
      const current = await this.store.requests.get(req.id);
      if (current && !TERMINAL_STATUSES.has(current.status) && (await this.retryIfAllowed(current, attempt.node, attempt, reason))) return;
    }
    logger.error(`[CuratorRequestProcessor] Request ${req.id} failed: ${reason}`);
    await this.saveResponse(req, `ERROR: ${reason}`);
    await this.completeRequest(req.id, 'FAILED');
  }

  /**
   * Paths B/C: one direct tool call (REPL, CLI, API) as a light Request, executed synchronously through
   * the same handler as AST tool nodes (RBAC, approval gate, secrets, Response). Throws on tool error
   * or when access is denied; returns status WAITING_FOR_USER when approval is required.
   */
  /**
   * A direct tool run's object result gets `uiSurface` from the `surface` output rules (plugin `toolOutput`, the
   * tool's `output`) when it has none; other results are returned as they are.
   */
  private withSurface(result: unknown, toolName: string, tool: any): unknown {
    if (!result || typeof result !== 'object' || Array.isArray(result) || 'uiSurface' in (result as any)) return result;
    const output = this.engine.output ?? defaultOutputFormats;
    const surface = output.surfaceForToolResult(result, { names: [toolName], tool });
    return surface ? { ...(result as Record<string, unknown>), uiSurface: surface } : result;
  }

  public async runToolRequest(input: RunToolRequestInput): Promise<RunToolRequestResult> {
    const resolved = this.engine.resolveTool?.(input.toolName, { projectId: input.projectId }) ?? this.engine.tools.get(input.toolName);
    if (!resolved) throw new Error(`Tool '${input.toolName}' not found`);
    // Created locked (WAITING + lockedBy) so the poller never picks it up concurrently.
    const created = await this.store.requests.create({
      userId: input.userId,
      projectId: input.projectId ?? null,
      conversationId: input.conversationId,
      agentId: input.agentId ?? undefined,
      toolName: input.toolName,
      status: 'WAITING',
      lockedBy: this.workerId,
      lockedAt: new Date(),
      ast: { type: 'Curator_Tool', toolName: input.toolName, args: input.args ?? {} },
      context: { ...(input.context || {}), origin: input.origin, literalArgs: true } as any,
    });
    this.inflight.set(created.id, { runtimeArgs: input.runtimeArgs, runtimeContext: input.runtimeContext, broadcastToolEvents: input.broadcastToolEvents });
    try {
      await this.processRequest({ id: created.id });
      const flight = this.inflight.get(created.id);
      if (flight?.error) throw flight.error;

      const done = await this.store.requests.get(created.id);
      const content = done?.output ?? (await this.store.responses.latest(created.id))?.content ?? null;
      let parsed: any = content;
      if (typeof content === 'string') {
        try { parsed = JSON.parse(content); } catch { /* plain text */ }
      }
      const record = CuratorRequestProcessor.isStructuredRecord(parsed) ? (parsed as CuratorStructuredResponse) : undefined;
      if (done?.status === 'FAILED') {
        throw new Error(record?.reason || (typeof content === 'string' ? content : `Tool '${input.toolName}' failed`));
      }
      const result = record ? undefined : (flight?.raw !== undefined ? flight.raw : parsed);
      return {
        requestId: created.id,
        status: done?.status ?? 'UNKNOWN',
        result: this.withSurface(result, input.toolName, resolved),
        record
      };
    } finally {
      this.inflight.delete(created.id);
      // Tools such as approvals can resume parked requests, possibly of a conversation another worker owns
      this.announce();
    }
  }

  /**
   * One emitted event (REPL, CLI, API) recorded as a Request whose Response is EVENT_EMITTED.
   * Uses the same matcher as Curator_EmitEvent (subscriptions + waits).
   */
  public async emitEventRequest(input: EmitEventRequestInput): Promise<CuratorEventEmitResult & { requestId: number }> {
    const req = await this.store.requests.create({
      userId: input.userId,
      projectId: input.projectId ?? null,
      conversationId: input.conversationId,
      agentId: input.agentId ?? undefined,
      status: 'WAITING',
      lockedBy: this.workerId,
      lockedAt: new Date(),
      ast: { type: 'Curator_EmitEvent', eventName: input.eventName, payload: input.payload ?? null },
      context: { origin: input.origin } as any,
    });
    try {
      const result = await this.dispatchEvent(input.eventName, input.payload, req, input.targetAgentId, input);
      if (input.broadcast !== false) this.emit(input.eventName, input.payload);
      const record: CuratorStructuredResponse = { type: 'EVENT_EMITTED', ok: true, event: result };
      await this.saveResponse(req, JSON.stringify(record));
      await this.completeRequest(req.id, 'COMPLETED');
      return { ...result, requestId: req.id };
    } catch (err: any) {
      await this.failRequest(req, `Emit '${input.eventName}': ${err.message}`);
      throw err;
    } finally {
      // Waits and subscriptions the event matched are runnable now, possibly on the worker owning their conversation
      this.announce();
    }
  }


  /** Open interrupts (parked waits a human or client resolves), oldest first. See Interrupts.ts. */
  public async listInterrupts(filter: ListInterruptsFilter): Promise<CuratorInterrupt[]> {
    const parked = await this.store.requests.find(
      { status: ['WAITING_FOR_USER', 'WAITING_FOR_EVENT'], ...this.scopeFilter(filter.conversationId) },
      { orderBy: 'updatedAt', take: 200 }
    );
    const open: CuratorInterrupt[] = [];
    for (const req of parked) {
      const interrupt = describeInterrupt(req, this.parseContext(req.context));
      if (!interrupt) continue;
      if (!canReadProject(req.projectId, filter.projectIds)) continue;
      if (filter.kind && interrupt.kind !== filter.kind) continue;
      open.push(interrupt);
    }
    return open;
  }

  /**
   * Resumes an open interrupt with `value` (validated against its `resumeSchema`): a prompt or event wait gets the
   * value bound to its alias; an approval is granted (`{ approved: true, scope? }`) or denied, which ends the step
   * like an expired approval (`onApprovalExpired`). The resume is announced as a `wait.resumed` progress event.
   * Throws when the interrupt is unknown, not visible to the caller, no longer open, for another user, or the
   * value is invalid.
   */
  public async resumeInterrupt(input: ResumeInterruptInput): Promise<ResumeInterruptResult> {
    const id = String(input.interruptId ?? '');
    const requestId = interruptRequestId(id);
    if (requestId == null) throw new Error(`Malformed interrupt id '${id}' (expected '<requestId>.<n>')`);
    const req = await this.store.requests.get(requestId);
    const ctx = req ? this.parseContext(req.context) : {};
    const interrupt = req ? describeInterrupt(req, ctx) : undefined;
    if (!req || !canReadProject(req.projectId, input.projectIds)) {
      throw new Error(`Interrupt ${id} not found`);
    }
    if (!interrupt || interrupt.id !== id || (req.status !== 'WAITING_FOR_USER' && req.status !== 'WAITING_FOR_EVENT')) {
      throw new Error(`Interrupt ${id} is no longer open`);
    }
    if (interrupt.targetUserId != null && String(interrupt.targetUserId) !== String(input.userId)) {
      throw new Error(`Interrupt ${id} is addressed to another user`);
    }
    const errors = validateResumeValue(interrupt, input.value);
    if (errors.length) throw new Error(`Invalid resume value for interrupt ${id}: ${errors.join('; ')}`);

    // Claim it so a concurrent resume, expiry or timeout cannot also close it
    const claimed = await this.store.requests.updateWhere(
      { ids: [req.id], status: req.status },
      { status: 'WAITING', lockedBy: this.workerId, lockedAt: new Date() }
    );
    if (claimed === 0) throw new Error(`Interrupt ${id} is no longer open`);

    let outcome: ResumeInterruptResult['outcome'] = 'resumed';
    try {
      if (interrupt.kind === 'approval') {
        const answer = input.value as ApprovalResume;
        const pending = ctx.pendingToolCall;
        if (!pending) throw new Error(`Interrupt ${id} has no pending tool call`);
        if (answer.approved) {
          const scope = answer.scope ?? 'ONETIME';
          // A one-time approval rides on the request (__humanApproved__); wider scopes need the ToolApproval table
          if (this.prisma.toolApproval?.create) {
            await ApprovalService.grantApproval(this.prisma, {
              toolName: pending.name, scope, approvedBy: input.userId, agentId: req.agentId,
              conversationId: req.conversationId, requestId: req.id, userId: input.userId,
            });
          } else if (scope !== 'ONETIME') {
            throw new Error(`Approval scope ${scope} needs the ToolApproval table, which this database does not have`);
          }
          // Same resume the server's approveRequest performs: the step runs again and passes the access check
          const nextCtx: any = { ...ctx, __humanApproved__: true, __approvalScope__: scope };
          delete nextCtx[INTERRUPT_KEY];
          delete nextCtx.__paused__;
          await this.store.requests.update(req.id, { status: 'NEW', lockedBy: null, lockedAt: null, context: nextCtx });
        } else {
          outcome = 'denied';
          await this.closeApprovalWait(req, ctx, {
            type: 'APPROVAL_DENIED', ok: false, tool: pending.name, reason: answer.reason ?? `Denied by ${input.userId}`,
          });
        }
      } else {
        const eventName = interrupt.kind === 'event' ? String(interrupt.payload?.eventNames?.[0] ?? ctx.waitEvent ?? '') : 'curator:choice';
        await this.wakeWaitingRequest(req, eventName, input.value, { bindInput: interrupt.kind === 'human_input' });
      }
    } catch (err) {
      // Not resumed: park it again so it can still be answered (or expire)
      await this.store.requests.updateWhere({ ids: [req.id], status: 'WAITING', lockedBy: this.workerId }, { status: req.status, lockedBy: null, lockedAt: null });
      throw err;
    }

    this.progress({ kind: 'wait.resumed', conversationId: req.conversationId, requestId: req.id, interruptId: id, waitKind: interrupt.kind, outcome });
    this.announce();
    return { interruptId: id, requestId: req.id, kind: interrupt.kind, outcome };
  }

  // --- State history, fork & replay (TimeTravel.ts) ---

  /**
   * StepTrace fields a fork needs that nothing else keeps (request contexts are trimmed): a replayable step's node
   * hash and final context, a root's context. Results stay in Responses / `output`, state writes in the EventLog.
   */
  private async replayRecord(req: any, nodeType: string | null, status: string): Promise<Partial<StepTraceRecord>> {
    const ctx = this.parseContext(req.context);
    if (nodeType && REPLAYABLE_NODE_TYPES.has(nodeType) && TERMINAL_STATUSES.has(status)) {
      try {
        const astHash = this.executing.get(req.id)?.astHash ?? (await this.resolvedNodeHash(req));
        return { astHash, context: SecretService.sanitizeContext(withoutBookkeeping(ctx)) };
      } catch (err: any) {
        logger.warn(`[CuratorRequestProcessor] Replay record of request ${req.id} skipped: ${err?.message ?? err}`);
        return {};
      }
    }
    // A root (created by nothing): the context a fork re-runs it with
    if (req.createdBy == null) return { context: SecretService.sanitizeContext(this.rootContextOf(ctx)) };
    return {};
  }

  /** A root's context without run bookkeeping (its `input` stays: it is the run's input). */
  private rootContextOf(ctx: any): Record<string, any> {
    return { ...withoutBookkeeping(ctx), ...(ctx?.input !== undefined ? { input: ctx.input } : {}) };
  }

  private async resolvedNodeHash(req: any): Promise<string | null> {
    const { node } = await resolveRequestNode(this.prisma, req);
    return node ? nodeHash(node) : null;
  }

  /** The original run's steps by path, for fork `conversationId` (built once per process). */
  private forkIndex(conversationId: number, spec: ForkSpec): Promise<Map<string, OriginalStep>> {
    let index = this.forkIndexes.get(conversationId);
    if (!index) {
      index = this.runSteps(spec.from).then((rows) => indexRun(rows, spec.rootRequestId).byPath);
      index.catch(() => this.forkIndexes.delete(conversationId));
      if (this.forkIndexes.size >= 1_000) this.forkIndexes.clear();
      this.forkIndexes.set(conversationId, index);
    }
    return index;
  }

  /**
   * Every request of a conversation as a step: StepTrace for finished ones (it outlives context trimming), the
   * Request row for the rest.
   */
  private async runSteps(conversationId: number): Promise<StepRow[]> {
    await this.trace?.flush();
    const traced = new Map<number, any>();
    for (const row of (await this.trace?.forConversation(conversationId)) ?? []) {
      if (row.status !== 'RETRY') traced.set(row.requestId, row);
    }
    // Requests are deleted only with their whole conversation, so the Request rows are the run's tree
    return (await this.store.requests.find({ conversationId })).map((req): StepRow => {
      const t = traced.get(req.id);
      return {
        requestId: req.id,
        createdBy: req.createdBy ?? null,
        status: t?.status ?? req.status,
        nodeType: t?.nodeType ?? this.parseAst(req.ast)?.type ?? null,
        astHash: t?.astHash ?? null,
        context: t?.context ?? null,
        output: t?.output ?? null,
        finished: t ? finishOrderOf(t) : null,
      };
    });
  }

  private async forkBoundaryPassed(conversationId: number): Promise<boolean> {
    if (this.forkBoundaries.has(conversationId)) return true;
    const passed = (await this.prisma.eventLog.count({ where: { conversationId, eventName: FORK_BOUNDARY_EVENT } })) > 0;
    if (passed) this.forkBoundaries.add(conversationId);
    return passed;
  }

  /**
   * In a fork: returns the recorded result of a step the original run finished before the fork point (true),
   * fails a step the original never had before it (replay diverged: true), or lets the step run (false).
   */
  private async replayIfForked(req: any, ast: CuratorAstNode): Promise<boolean> {
    if (!REPLAYABLE_NODE_TYPES.has(ast.type) || req.conversationId == null) return false;
    const spec = await this.forkSpec(req.conversationId);
    if (!spec) return false;
    const ctx = this.parseContext(req.context);
    const path: string | undefined = ctx[FORK_PATH_KEY];
    if (!path) return false;

    const original = (await this.forkIndex(req.conversationId, spec)).get(path);
    const decision = decideReplay(spec, original, ast, nodeHash(ast), await this.forkBoundaryPassed(req.conversationId));
    if (decision.action === 'live') return false;
    if (decision.action === 'diverge') {
      await this.failRequest(req, `Fork replay diverged at step ${path}: ${decision.reason}`);
      return true;
    }

    const orig = decision.original;
    // The state the step wrote itself (its output merged on hand-over is re-derived when this one completes), as
    // written before merge rules: this fork's state is the original's here, so the rules give the same values
    const written = await this.prisma.eventLog.findMany({ where: { conversationId: spec.from, source: orig.requestId, eventName: STATE_PATCH }, orderBy: { id: 'asc' } });
    for (const e of written) {
      if (e.payload?.output) continue;
      await this.writeState(req.conversationId, e.payload?.scope ?? null, e.payload?.incoming ?? e.payload?.set ?? {}, req);
    }
    const result = orig.output ?? (await this.store.responses.latest(orig.requestId))?.content ?? null;
    const nextCtx: Record<string, any> = {
      ...withoutBookkeeping(orig.context ?? {}),
      [FORK_PATH_KEY]: path,
      ...(ctx.__scope != null ? { __scope: ctx.__scope } : {}),
    };
    req.context = nextCtx;
    const patch = decision.boundary && spec.statePatch && Object.keys(spec.statePatch).length > 0 ? spec.statePatch : null;
    if (decision.boundary) {
      await this.prisma.eventLog.create({ data: { conversationId: req.conversationId, eventName: FORK_BOUNDARY_EVENT, source: req.id, payload: { path } } });
      this.forkBoundaries.add(req.conversationId);
      if (patch && req.notifyId) this.boundaryPatches.set(req.id, patch);
    }
    if (result != null) await this.saveResponse(req, result);
    this.progress({ kind: 'step.replayed', conversationId: req.conversationId, requestId: req.id, originalRequestId: orig.requestId, path, boundary: decision.boundary });
    await this.completeRequest(req.id, orig.status, false, { context: nextCtx });
    // Nothing downstream merged it (a root step): apply it now
    if (patch && (!req.notifyId || this.boundaryPatches.delete(req.id))) await this.writeState(req.conversationId, null, patch, req, { raw: true });
    return true;
  }

  /** The conversation, when the caller's projects may read it. */
  private async readableConversation(conversationId: number, projectIds: string[]) {
    const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv || !canReadProject(conv.projectId, projectIds)) throw new Error(`Conversation ${conversationId} not found`);
    return conv;
  }

  /** A conversation's state changes (its state events), oldest first. Compacted conversations keep one event. */
  public async listStateHistory(conversationId: number, projectIds: string[]): Promise<StateHistoryEntry[]> {
    await this.readableConversation(conversationId, projectIds);
    const events = await this.prisma.eventLog.findMany({
      where: { conversationId, eventName: { in: [STATE_PATCH, STATE_REWIND] } },
      orderBy: { id: 'asc' },
    });
    const steps = new Map((await this.runSteps(conversationId)).map((s) => [s.requestId, s]));
    return events.map((e: any) => {
      const step = e.source != null ? steps.get(e.source) : undefined;
      return {
        seq: e.id,
        kind: e.eventName === STATE_REWIND ? 'rewind' : 'patch',
        requestId: e.source ?? null,
        nodeType: step?.nodeType ?? null,
        scope: e.payload?.scope ?? null,
        keys: Object.keys(e.payload?.set ?? {}),
        forkable: !!step && step.status === 'COMPLETED' && !!step.nodeType && REPLAYABLE_NODE_TYPES.has(step.nodeType) && step.astHash != null,
      } satisfies StateHistoryEntry;
    });
  }

  /** The conversation state right after state event `seq` (default: now). */
  public async stateAtSeq(conversationId: number, seq: number | undefined, projectIds: string[]) {
    await this.readableConversation(conversationId, projectIds);
    return stateAt(this.prisma, conversationId, seq);
  }

  /**
   * Forks a conversation right after a finished replayable step: a new conversation runs the original root again,
   * replaying recorded steps up to the fork point (no tool calls, model calls or prompts repeat), applies
   * `statePatch` there, and runs live from then on. The original is not changed.
   */
  public async forkConversation(input: ForkInput): Promise<ForkResult> {
    const conv = await this.readableConversation(input.conversationId, input.projectIds);
    let atRequestId = input.atRequestId;
    if (atRequestId == null && input.atSeq != null) {
      const event = await this.prisma.eventLog.findFirst({ where: { conversationId: conv.id, id: input.atSeq } });
      if (!event) throw new Error(`State event ${input.atSeq} not found in conversation ${conv.id}`);
      if (event.source == null) throw new Error(`State event ${input.atSeq} was not written by a step; fork at a step instead`);
      atRequestId = event.source;
    }
    if (atRequestId == null) throw new Error('Fork needs atRequestId or atSeq');

    const rows = await this.runSteps(conv.id);
    const at = rows.find((r) => r.requestId === atRequestId);
    if (!at) throw new Error(`Request ${atRequestId} is not part of conversation ${conv.id}`);
    if (at.status !== 'COMPLETED' || !at.nodeType || !REPLAYABLE_NODE_TYPES.has(at.nodeType) || !at.astHash || !at.finished) {
      throw new Error(`Request ${atRequestId} is not a finished, recorded step (agent, tool, reducer, human input or event wait); fork at one of those`);
    }
    const rootId = rootOf(rows, atRequestId);
    if (rootId == null) throw new Error(`Request ${atRequestId} has no recorded lineage (it predates fork support or its records were retired)`);
    const { pathOf } = indexRun(rows, rootId);
    const boundaryPath = pathOf.get(atRequestId)!;

    const root = await this.store.requests.get(rootId);
    const rootTrace = rows.find((r) => r.requestId === rootId);
    if (!root) throw new Error(`Root request ${rootId} of the run is gone; this run can no longer be forked`);
    const rootContext = root.context != null ? this.rootContextOf(this.parseContext(root.context)) : (rootTrace?.context ?? {});

    const fork = await this.prisma.conversation.create({ data: { userId: input.userId, projectId: conv.projectId ?? null } });
    const spec: ForkSpec = {
      from: conv.id,
      atRequestId,
      boundaryPath,
      rootRequestId: rootId,
      atFinished: at.finished,
      statePatch: input.statePatch ?? null,
      scriptVersion: input.scriptVersion ?? root.scriptVersion ?? null,
      originalScriptVersion: root.scriptVersion ?? null,
    };
    // Written before the root request exists, so every request of the fork sees it is a fork
    await this.prisma.eventLog.create({ data: { conversationId: fork.id, eventName: FORK_EVENT, payload: spec as any } });
    this.forkSpecs.set(fork.id, spec);

    const created = await this.createValidatedRequest({
      createdBy: null,
      forkPath: ROOT_PATH,
      data: {
        userId: input.userId,
        projectId: root.projectId ?? null,
        conversationId: fork.id,
        agentId: root.agentId ?? undefined,
        scriptId: root.scriptId ?? undefined,
        scriptVersion: input.scriptVersion ?? root.scriptVersion ?? undefined,
        toolName: root.toolName ?? undefined,
        priority: root.priority ?? undefined,
        status: 'NEW',
        pendingDependencies: 0,
        ast: root.ast ?? undefined,
        context: rootContext,
      },
    });
    this.progress({ kind: 'run.forked', conversationId: fork.id, from: conv.id, atRequestId, rootRequestId: created.id });
    this.announce();
    return { conversationId: fork.id, rootRequestId: created.id, boundaryPath };
  }

  /** Resolves a handler ref to its Script row id and entry (local refs use the executing script). */
  private async resolveHandler(handler: string, req: any): Promise<{ scriptId: number; entry: string | null }> {
    const parsed = parseCuratorRef(handler);
    if (!parsed) throw new Error(`Invalid handler ref '${handler}'`);
    if (!parsed.script) {
      if (!req.scriptId) throw new Error(`Local handler '${handler}' used outside a stored script`);
      return { scriptId: req.scriptId, entry: parsed.entry ?? null };
    }
    const script = await this.prisma.script.findUnique({ where: { name: parsed.script }, select: { id: true } });
    if (!script) throw new Error(`Script '${parsed.script}' not found`);
    return { scriptId: script.id, entry: parsed.entry ?? null };
  }

  /** Whether the request's user may address its agent (`agent:<name>`, `agent:*` or the definition's `requiredRole`). */
  private async checkAgentAddressAccess(req: any, agentRow: any): Promise<{ allowed: boolean; reason?: string }> {
    const name = String(agentRow?.name ?? req.agentId);
    const definition: any = this.engine.agents?.get?.(name);
    const userId = req.userId || req.context?.userId;
    const projectId = req.projectId || req.context?.projectId;
    const actor = { userId: userId ? String(userId) : undefined, projectId: projectId ? String(projectId) : undefined };
    const policy = { requiredRole: definition?.requiredRole };
    return this.definition(`agent-access:${JSON.stringify([actor, name, policy])}`, () =>
      AccessService.canUse(this.prisma, actor, 'agent', name, policy)
    );
  }

  private async checkToolRoleAccess(req: any, toolName: string, tool: any): Promise<ToolRoleAccessResult> {
    // Allow-list only: no role database, no error, nothing grants access by default
    if (!this.prisma) return { allowed: false, reason: `Access Denied: no role database to check tool '${toolName}' against.` };
    const accessLevel = (tool as any).accessLevel || 'safe_write';
    const requiresConfirmation = (tool as any).requiresConfirmation || (tool as any).requiresHumanApproval || accessLevel === 'destructive' || accessLevel === 'elevated';
    const effectiveAgentId = AgentRoleService.actorAgentId(req);
    const effectiveUserId = req.userId || req.context?.userId;
    const effectiveProjectId = req.projectId || req.context?.projectId;
    try {
      const actor = {
        agentId: effectiveAgentId ? String(effectiveAgentId) : undefined,
        userId: effectiveUserId ? String(effectiveUserId) : undefined,
        projectId: effectiveProjectId ? String(effectiveProjectId) : undefined,
      };
      const policy = { name: toolName, requiredRole: (tool as any).requiredRole, accessLevel, requiresHumanApproval: requiresConfirmation };
      return await this.definition(`access:${JSON.stringify([actor, policy])}`, () =>
        AgentRoleService.validateActorToolAccess(this.prisma, actor, toolName, policy)
      );
    } catch (roleErr: any) {
      logger.warn('[CuratorRequestProcessor] AgentRoleService check failed:', roleErr);
      return { allowed: false, reason: `Access Denied: the role check for tool '${toolName}' failed: ${roleErr?.message ?? roleErr}` };
    }
  }

  private async checkToolAccess(req: any, toolName: string, tool: any): Promise<ToolAccessResult> {
    const accessLevel = (tool as any).accessLevel || 'safe_write';
    const requiresConfirmation = (tool as any).requiresConfirmation || (tool as any).requiresHumanApproval || accessLevel === 'destructive' || accessLevel === 'elevated';

    // 1. Actor Role Whitelisting (Agent or Human User; an agent acting for a user is narrowed to both)
    {
      const roleCheck = await this.checkToolRoleAccess(req, toolName, tool);
      if (!roleCheck.allowed) {
        // Recorded by the caller as a TOOL_BLOCKED Response.
        return {
          allowed: false,
          requiresConfirmation: false,
          reason: roleCheck.reason,
          roles: roleCheck.roleNames
        };
      }
    }

    // 2. Human-in-the-Loop Gating: Check if tool mandates human confirmation / approval
    let approvalResult: any = { approved: false };
    if (requiresConfirmation) {
      approvalResult = await ApprovalService.checkApproval(this.prisma, {
        toolName,
        agentId: req.agentId ? String(req.agentId) : null,
        conversationId: req.conversationId,
        context: req.context
      });

      if (!approvalResult.approved) {
        // Recorded by the caller as an APPROVAL_REQUIRED Response.
        return {
          allowed: false,
          requiresConfirmation: true,
          reason: approvalResult.reason || `Tool '${toolName}' (${accessLevel}) requires user confirmation before execution.`
        };
      }
    }

    return {
      allowed: true, 
      requiresConfirmation: false, 
      approvalScope: approvalResult.scope 
    };
  }

  /**
   * Approval waits (WAITING_FOR_USER + context.pendingToolCall) are resumed only by an approval.
   * Past `pendingToolCall.expiresAt` they are closed with an APPROVAL_EXPIRED Response, and the AST decides
   * the outcome via the tool node's `onApprovalExpired`: 'fail' (default) fails the step, 'continue'
   * completes it with `{ ok: false, expired: true }` under `as` / toolName so the flow can branch.
   */
  private async expireApprovalWaits() {
    const parked = await this.store.requests.find({ status: 'WAITING_FOR_USER' }, { orderBy: 'updatedAt', take: 50 });
    const now = this.clock();
    for (const req of parked) {
      const ctx = (typeof req.context === 'string' ? JSON.parse(req.context) : req.context) || {};
      const pending = ctx.pendingToolCall;
      if (!pending?.expiresAt || Date.parse(pending.expiresAt) > now) continue;

      // Claim it atomically so only one worker expires it.
      const claimed = await this.store.requests.updateWhere(
        { ids: [req.id], status: 'WAITING_FOR_USER' },
        { status: 'WAITING', lockedBy: this.workerId, lockedAt: new Date() }
      );
      if (claimed === 0) continue;

      logger.debug(`[CuratorRequestProcessor] Approval wait for '${pending.name}' on request ${req.id} expired.`);
      await this.closeApprovalWait(req, ctx, {
        type: 'APPROVAL_EXPIRED', ok: false, tool: pending.name, expiresAt: pending.expiresAt, reason: ctx.reason
      });
    }
  }

  /**
   * Ends an approval wait without approval (expired or denied): records `record`, then follows the tool node's
   * `onApprovalExpired` ('fail' fails the step, 'continue' completes it with `{ ok: false, expired|denied: true }`
   * under `as` / the tool name so the flow can branch). `req` must be claimed by this worker.
   */
  private async closeApprovalWait(req: any, ctx: any, record: CuratorStructuredResponse) {
    const pending = ctx.pendingToolCall;
    const nextCtx: any = { ...ctx };
    delete nextCtx.pendingToolCall;
    delete nextCtx[INTERRUPT_KEY];
    const proceed = pending.onExpired === 'continue';
    if (proceed) {
      const outcome = { ok: false, ...(record.type === 'APPROVAL_DENIED' ? { denied: true } : { expired: true }), type: record.type, tool: pending.name };
      nextCtx[pending.name] = outcome;
      if (pending.as) nextCtx[pending.as] = outcome;
    }
    req.context = nextCtx;
    await this.saveResponse(req, JSON.stringify(record));
    await this.completeRequest(req.id, proceed ? 'COMPLETED' : 'FAILED', false, { context: nextCtx });
  }

  /**
   * Human prompts with `timeoutSeconds` park with `context.waitDeadline`. Past it, the prompt completes with a
   * HUMAN_TIMEOUT Response (nothing is bound to `as`), so the script can re-ask (loop), nudge or give up.
   */
  private async expireHumanWaits(conversationId?: number) {
    const parked = await this.store.requests.find(
      { status: ['WAITING_FOR_USER', 'WAITING_FOR_EVENT'], ...this.scopeFilter(conversationId) },
      { orderBy: 'updatedAt', take: 50 }
    );
    const now = this.clock();
    for (const req of parked) {
      const ctx = this.parseContext(req.context);
      if (!ctx.waitDeadline || ctx.pendingToolCall || Date.parse(ctx.waitDeadline) > now) continue;

      const claimed = await this.store.requests.updateWhere(
        { ids: [req.id], status: req.status },
        { status: 'WAITING', lockedBy: this.workerId, lockedAt: new Date() }
      );
      if (claimed === 0) continue;

      const isEventWait = req.status === 'WAITING_FOR_EVENT';
      logger.debug(`[CuratorRequestProcessor] Human prompt on request ${req.id} timed out.`);
      const nextCtx: any = { ...ctx };
      delete nextCtx.waitEvent;
      delete nextCtx.waitEvents;
      delete nextCtx.waitDeadline;
      delete nextCtx.payloadAlias;
      delete nextCtx[INTERRUPT_KEY];
      req.context = nextCtx;
      const record: CuratorStructuredResponse = { type: isEventWait ? 'WAIT_TIMEOUT' : 'HUMAN_TIMEOUT', ok: false, deadline: ctx.waitDeadline, reason: isEventWait ? ctx.waitEvent : ctx.choicePrompt };
      await this.saveResponse(req, JSON.stringify(record));

      const reqAst = this.parseAst(req.ast);
      if (reqAst?.onTimeout) {
        await this.createValidatedRequest({
          createdBy: req.id,
          data: {
            userId: req.userId,
            projectId: req.projectId,
            agentId: req.agentId,
            scriptId: req.scriptId,
            conversationId: req.conversationId,
            status: 'NEW',
            pendingDependencies: 0,
            notifyId: req.notifyId,
            ast: reqAst.onTimeout,
            context: nextCtx,
          },
        });
        await this.completeRequest(req.id, 'COMPLETED', true, { context: nextCtx, notifyId: null });
        continue;
      }

      await this.completeRequest(req.id, 'COMPLETED', false, { context: nextCtx });
    }
  }

  /**
   * Retention cleanup (policy `readOnlyRequests: 'prune'`): deletes COMPLETED direct (root, non-workflow)
   * tool Requests of read-only tools older than `readOnlyTtlMs`, with their Responses.
   * Workflow Requests, failures and anything with children are never pruned. Runs at most every 10 minutes.
   */
  public async pruneReadOnlyRequests(force = false): Promise<number> {
    if (this.retention.readOnlyRequests !== 'prune') return 0;
    if (!force && Date.now() - this.lastPruneAt < 10 * 60 * 1000) return 0;
    this.lastPruneAt = Date.now();

    const readOnlyTools: string[] = [];
    for (const [name, tool] of this.engine.tools.entries()) {
      const level = String((tool as any)?.accessLevel || '').toLowerCase();
      if (level === 'safe_read' || level === 'read_only' || level === 'readonly') readOnlyTools.push(name);
    }
    if (readOnlyTools.length === 0) return 0;

    const cutoff = new Date(Date.now() - this.retention.readOnlyTtlMs);
    const victims = await this.prisma.request.findMany({
      where: {
        status: 'COMPLETED',
        toolName: { in: readOnlyTools },
        parentId: null,
        scriptId: null,
        createdAt: { lt: cutoff },
        children: { none: {} }
      },
      select: { id: true },
      take: 500
    });
    if (victims.length === 0) return 0;
    const deleted = await this.store.requests.delete(victims.map((v: any) => v.id));
    logger.debug(`[CuratorRequestProcessor] Retention: pruned ${deleted} read-only tool request(s) older than ${cutoff.toISOString()}.`);
    return deleted;
  }

  /**
   * Retention sweep (policy `completedContext: 'trim'`): clears the context of COMPLETED Requests whose notify
   * target is gone or terminal, 10 minutes after they last changed. Runs every 10 minutes, or every tick while
   * a backlog remains.
   */
  public async trimCompletedContexts(force = false): Promise<number> {
    if (this.retention.completedContext !== 'trim') return 0;
    if (!force && Date.now() - this.lastContextSweepAt < 10 * 60 * 1000) return 0;
    this.lastContextSweepAt = Date.now();

    const maxBatches = 10;
    const batchSize = 500;
    const trimmed = await sweepCompletedContexts(this.prisma, {
      olderThan: new Date(Date.now() - 10 * 60 * 1000), // updatedAt is wall-clock time, not the injectable clock
      maxBatches,
      batchSize,
    });
    if (trimmed > 0) logger.debug(`[CuratorRequestProcessor] Retention: trimmed the context of ${trimmed} completed request(s).`);
    if (trimmed >= maxBatches * batchSize) this.lastContextSweepAt = 0; // backlog left: continue next tick
    return trimmed;
  }

  private async interpolateTemplate(template: string | undefined, req: any): Promise<string | undefined> {
    if (!template) return template;
    
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: req.conversationId }
    });
    
    const state = this.getConversationState(conversation);
    
    const regex = /{([^}]+)}/g;
    let result = template;
    let match;
    
    while ((match = regex.exec(template)) !== null) {
      const fullMatch = match[0];
      const expression = match[1].trim();
      const isOptional = expression.endsWith('?');
      const varName = isOptional ? expression.slice(0, -1).trim() : expression;
      
      let replacementValue: string | undefined;

      if (varName.startsWith('artifact.')) {
        const artifactName = varName.substring(9).trim(); // "artifact.".length == 9
        const resource = await this.prisma.resource.findFirst({
          where: {
            OR: [
              { title: artifactName },
              { uri: artifactName }
            ]
          }
        });
        
        if (resource && resource.content) {
          replacementValue = resource.content;
        } else if (!isOptional) {
          throw new Error(`Template Error: Artifact '${artifactName}' not found or has no content`);
        }
      } else if (varName.startsWith('context.')) {
        const contextKey = varName.substring(8).trim();
        const ctx = req.context || {};
        if (contextKey in ctx && ctx[contextKey] !== undefined && ctx[contextKey] !== null) {
          replacementValue = typeof ctx[contextKey] === 'string' ? ctx[contextKey] : JSON.stringify(ctx[contextKey]);
        } else if (!isOptional) {
          throw new Error(`Template Error: Context variable '${contextKey}' is not defined`);
        }
      } else {
        // State variable or fallback to context variable
        const ctx = req.context || {};
        if (varName in state && state[varName] !== undefined && state[varName] !== null) {
          replacementValue = typeof state[varName] === 'string'
            ? state[varName]
            : (typeof state[varName] === 'object' && state[varName] !== null
                ? JSON.stringify(state[varName])
                : String(state[varName]));
        } else if (varName in ctx && ctx[varName] !== undefined && ctx[varName] !== null) {
          replacementValue = typeof ctx[varName] === 'string' ? ctx[varName] : JSON.stringify(ctx[varName]);
        } else if (varName.startsWith('$') || varName.includes('.') || varName.includes('[')) {
          try {
            const evaluated = await this.evaluateExpressionAsync(varName.startsWith('$') ? varName : `$context.${varName}`, req);
            if (evaluated !== undefined && evaluated !== null) {
              replacementValue = typeof evaluated === 'string'
                ? evaluated
                : (typeof evaluated === 'object' ? JSON.stringify(evaluated) : String(evaluated));
            }
          } catch (_) {}
        }
        
        if (replacementValue === undefined && !isOptional) {
          throw new Error(`Template Error: State variable '${varName}' is not defined`);
        }
      }

      if (replacementValue !== undefined) {
        result = result.replace(fullMatch, () => replacementValue!);
      } else if (isOptional) {
        result = result.replace(fullMatch, () => ''); // Replace with empty string if optional and missing
      }
    }
    
    return result;
  }

  /** Records a step result: a Response for history steps, `Request.output` for control-flow steps (see StepTrace.ts). */
  private async saveResponse(req: any, content: string) {
    this.assertLive();
    try {
      if (isControlNode(this.nodeTypeOf(req))) {
        await this.store.requests.update(req.id, { output: content });
        return;
      }
      await this.store.responses.append({ requestId: req.id, conversationId: req.conversationId, projectId: req.projectId ?? null, content });
      const running = this.executing.get(req.id);
      if (running) running.lastResponse = content;
    } catch (err: any) {
      // P2028: transaction already closed (common when an error rolled back the TX).
      // Log at warn level and continue — the error is already recorded elsewhere.
      if (err?.code === 'P2028' || err?.message?.includes('Transaction already closed')) {
        logger.warn(`[CuratorRequestProcessor] saveResponse skipped for req ${req.id}: ${err.message}`);
      } else {
        throw err;
      }
    }
  }

  private static readonly STRUCTURED_RECORD_TYPES = new Set([
    'TOOL_BLOCKED', 'GUARDRAIL_BLOCKED', 'APPROVAL_REQUIRED', 'APPROVAL_EXPIRED', 'APPROVAL_DENIED', 'HUMAN_TIMEOUT', 'WAIT_TIMEOUT', 'EVENT_EMITTED', 'EVENTS_EMITTED', 'CHOICE_PROMPT', 'CHOICE_RECEIVED',
    'SUBSCRIBED', 'UNSUBSCRIBED', 'MODEL_CHANGED', 'TOOL_CALLS', 'HISTORY_SUMMARY'
  ]);

  /** True for CuratorStructuredResponse audit records (not tool/workflow output). */
  private static isStructuredRecord(value: any): boolean {
    return typeof value?.type === 'string' && CuratorRequestProcessor.STRUCTURED_RECORD_TYPES.has(value.type) && 'ok' in value;
  }

  /**
   * The one exit for every unsuccessful end (FAILED / SKIPPED / CANCELLED), so none can leave a waiter parked:
   * the request is dead-lettered, its live children are cancelled (poison pill), and whatever waits on it is
   * poisoned (a Join just counts it as arrived, tolerating failed branches).
   */
  private async handleUnsuccessful(req: any, status: string, skipNotify: boolean) {
    const reason =
      req.output ??
      (await this.store.responses.latest(req.id))?.content ??
      `Request ended ${status} without a recorded reason`;
    const reqAst = this.parseAst(req.ast);

    if (status === 'FAILED' && reqAst?.onError && !skipNotify) {
      logger.debug(`[CuratorRequestProcessor] Request ${req.id} failed, spawning onError fallback AST.`);
      await this.cancelOrphans(req.id);
      await this.createValidatedRequest({
        createdBy: req.id,
        data: {
          userId: req.userId,
          projectId: req.projectId,
          agentId: req.agentId,
          scriptId: req.scriptId,
          conversationId: req.conversationId,
          status: 'NEW',
          pendingDependencies: 0,
          notifyId: req.notifyId,
          ast: reqAst.onError,
          context: { ...this.parseContext(req.context), lastError: reason },
        },
      });
      await this.store.requests.update(req.id, { notifyId: null });
      return;
    }

    await recordDeadLetter(this.prisma, req, status, reason);
    if (status === 'FAILED' && !req.notifyId && !req.parentId) await this.recordWorkflowFailure(req, reason);
    await this.cancelOrphans(req.id);
    if (req.notifyId && !skipNotify) await this.poisonDownstream(req, status);
  }

  /**
   * A failed top-level request with nothing downstream (no parent, no notify target) ends its conversation's
   * workflow: record that as a state event, so the failure is part of the append-only history (and visible
   * to state projectors) rather than only a request flag. `reason` links to the upstream dead letter.
   */
  private async recordWorkflowFailure(req: any, reason: string) {
    if (req.conversationId == null) return;
    const ast = this.parseAst(req.ast);
    try {
      await appendStatePatch(this.prisma, req.conversationId, {
        set: {
          lastFailure: {
            requestId: req.id,
            nodeId: ast?.id ?? null,
            nodeType: ast?.type ?? null,
            reason: String(reason).slice(0, 2000),
            failedAt: new Date().toISOString(),
          },
        },
      }, { source: req.id });
    } catch (err: any) {
      logger.warn(`[CuratorRequestProcessor] Could not record workflow failure for request ${req.id}: ${err?.message ?? err}`);
    }
  }

  /** Poison pill downwards: children of a dead request are cancelled; their own children follow recursively. */
  private async cancelOrphans(parentId: number) {
    const orphans = await this.store.requests.find({ parentId, status: LIVE_STATUSES });
    for (const orphan of orphans) {
      await this.saveResponse(orphan, `ERROR: cancelled, parent request ${parentId} ended without completing`);
      await this.completeRequest(orphan.id, 'CANCELLED', true);
    }
  }

  /**
   * Closes a Join early (branch failure policy, join timeout): cancels the unfinished requests of its branches
   * (nested parallels' branches too) that no worker is running, then makes the Join runnable with `flags` in its
   * context. A step already running finishes, but nothing it notifies runs. False when the Join was not waiting.
   */
  private async closeJoin(joinId: number, flags: Record<string, any>, reason: string): Promise<boolean> {
    const join = await this.store.requests.get(joinId);
    if (!join || TERMINAL_STATUSES.has(join.status) || (join.pendingDependencies ?? 0) <= 0) return false;

    const live = await this.store.requests.find({ conversationId: join.conversationId, status: LIVE_STATUSES });
    const joins = [joinId];
    const cancel: any[] = [];
    while (joins.length) {
      const j = joins.shift()!;
      for (const r of live) {
        // Running now: claimed (locked) and not parked. Parked waits keep the lock of the worker that parked them.
        const running = r.lockedBy != null && (r.status === 'NEW' || r.status === 'WAITING');
        if (r.id === joinId || running || cancel.includes(r)) continue;
        if (this.parseContext(r.context)[BRANCH_KEY]?.join !== j) continue;
        cancel.push(r);
        if (this.parseAst(r.ast)?.type === 'Curator_Join') joins.push(r.id);
      }
    }
    for (const r of cancel) {
      await this.saveResponse(r, `ERROR: cancelled, parallel branch closed (${reason})`);
      await this.completeRequest(r.id, 'CANCELLED', true);
    }

    // Wake the Join with the flags, as a compare-and-swap on its count (a branch may be arriving right now)
    for (let attempt = 1; attempt <= 50; attempt++) {
      const current = attempt === 1 ? join : await this.store.requests.get(joinId);
      if (!current || TERMINAL_STATUSES.has(current.status)) return false;
      const woke = await this.store.requests.updateWhere(
        { ids: [joinId], pendingDependencies: current.pendingDependencies ?? 0, status: ['NEW', 'WAITING'] as RequestStatus[] },
        { pendingDependencies: 0, status: 'NEW', lockedBy: null, lockedAt: null, context: { ...this.parseContext(current.context), ...flags } }
      );
      if (woke > 0) {
        this.announce();
        return true;
      }
    }
    logger.error(`[CuratorRequestProcessor] closeJoin: could not wake join ${joinId}`);
    return false;
  }

  /**
   * Tells the request waiting on a dead one:
   * In parallel flows (or any fan-in / Join barrier), one failing branch must not poison the entire flow
   * when other branches are successful or still running.
   */
  private async poisonDownstream(req: any, status: string) {
    // Fan-in counts are written conditionally on the count read here; a concurrent completion changed it: read again
    for (let attempt = 1; attempt <= 50; attempt++) {
      if (await this.poisonDownstreamOnce(req, status)) return;
    }
    logger.error(`[CuratorRequestProcessor] poisonDownstream: could not count failed req ${req.id} at req ${req.notifyId}`);
  }

  /** One attempt of poisonDownstream: false when the target's dependency count changed since it was read. */
  private async poisonDownstreamOnce(req: any, status: string): Promise<boolean> {
    const target = await this.store.requests.get(req.notifyId);
    if (!target || TERMINAL_STATUSES.has(target.status)) return true;

    const targetAst = this.parseAst(target.ast);
    const siblings = await this.store.requests.find({ notifyId: target.id });
    const isFanIn = siblings.length > 1 || (target.pendingDependencies || 0) > 1 || targetAst?.type === 'Curator_Join';

    if (isFanIn) {
      const pending = Math.max(0, (target.pendingDependencies || 0) - 1);
      const data: RequestPatch = { pendingDependencies: pending };
      const counted = async () =>
        (await this.store.requests.updateWhere({ ids: [target.id], pendingDependencies: target.pendingDependencies }, data)) > 0;

      // The parallel's failure policy: close the Join now instead of waiting for the other branches
      const policy = targetAst?.type === 'Curator_Join' ? (targetAst as any).fanIn?.onBranchFailure : undefined;
      if ((policy === 'cancel_siblings' || policy === 'fail_fast') && pending > 0) {
        if (!(await counted())) return false;
        await this.closeJoin(target.id, policy === 'fail_fast' ? { [JOIN_FAIL_FAST_KEY]: true } : {}, `branch failed (${policy})`);
        return true;
      }

      const otherBranches = siblings.filter((s: any) => s.id !== req.id);
      const hasLiveBranches = otherBranches.some((s: any) => !TERMINAL_STATUSES.has(s.status));
      const hasSuccessfulBranches = otherBranches.some((s: any) => s.status === 'COMPLETED');

      if (pending === 0) {
        if (hasSuccessfulBranches || targetAst?.type === 'Curator_Join') {
          // At least one branch succeeded (or Join will aggregate completed responses)
          if (target.status === 'WAITING' || target.status === 'NEW') {
            data.status = 'NEW';
            data.lockedBy = null;
            data.lockedAt = null;
          }
          return counted();
        } else if (!hasLiveBranches) {
          // All branches finished and NONE were successful: poison the target
          if (!(await counted())) return false;
          this.emit('request_poisoned', { requestId: target.id, source: req.id, status });
          await this.saveResponse(target, `ERROR: all upstream parallel branches failed`);
          await this.completeRequest(target.id, 'FAILED');
          return true;
        }
      }

      // Other branches are still running or pending > 0: do not poison target yet
      return counted();
    }

    // Direct 1-to-1 sequential dependency: upstream death poisons target
    this.emit('request_poisoned', { requestId: target.id, source: req.id, status });
    await this.saveResponse(target, `ERROR: upstream request ${req.id} ${status}`);
    await this.completeRequest(target.id, 'FAILED');
    return true;
  }

  /**
   * Counts one finished dependency of a waiting request, as a compare-and-swap on the count (retried when a
   * concurrent completion changed it), so concurrent completions all count. Only the one taking the count from 1
   * to 0 wakes the target: no other write of a completion can un-claim it once a worker runs it.
   * `known` is the target as the caller just read it: the first attempt uses it instead of reading, and writes
   * `known.data` in the same statement (the target never becomes claimable before that data is written). If that
   * attempt loses, the data is written on its own and the count retried.
   */
  private async dependencyDone(
    targetId: number,
    known?: { pendingDependencies?: number | null; status: string; data?: RequestPatch }
  ): Promise<void> {
    for (let attempt = 1; attempt <= 50; attempt++) {
      const target = attempt === 1 && known
        ? known
        : await this.store.requests.get(targetId);
      const pending = target?.pendingDependencies ?? 0;
      const data = attempt === 1 ? known?.data : undefined;
      if (pending <= 0) {
        if (data) await this.store.requests.update(targetId, data);
        return;
      }
      const wake = pending === 1 && (target!.status === 'WAITING' || target!.status === 'NEW');
      const counted = await this.store.requests.updateWhere(
        { ids: [targetId], pendingDependencies: pending, ...(wake ? { status: ['WAITING', 'NEW'] as RequestStatus[] } : {}) },
        { ...data, ...(wake ? { pendingDependencies: 0, status: 'NEW' as const, lockedBy: null, lockedAt: null } : { pendingDependencies: pending - 1 }) }
      );
      if (counted > 0) return;
      if (data) await this.store.requests.update(targetId, data);
    }
    logger.error(`[CuratorRequestProcessor] dependencyDone: could not count a finished dependency of req ${targetId}`);
  }

  /** Sets the final status (with `data`, e.g. `{ context }`, in the same update) and notifies the waiting request. */
  private async completeRequest(requestId: number, status: string = 'COMPLETED', skipNotify: boolean = false, data?: RequestPatch) {
    this.assertLive();
    let req: any;
    try {
      req = await this.store.requests.update(requestId, { ...data, status: status as RequestStatus, lockedBy: null, lockedAt: null });
    } catch (err: any) {
      if (err?.code === 'P2028' || err?.message?.includes('Transaction already closed')) {
        logger.warn(`[CuratorRequestProcessor] completeRequest: status update skipped for req ${requestId} (closed tx): ${err.message}`);
        return;
      }
      throw err;
    }
    this.emit('request_done', { requestId, success: status === 'COMPLETED', status });
    const { startedAt, label } = this.executing.get(requestId) ?? {};
    this.progress({
      kind: 'step.finished', conversationId: req.conversationId, requestId, nodeType: this.nodeTypeOf(req),
      status: status as StepStatus, durationMs: startedAt ? Math.max(0, this.clock() - startedAt.getTime()) : null,
      ...(label ? { label } : {}),
    });
    // A flow ends at a step that hands over to nothing (hand-overs pass skipNotify; a failure with onError continues)
    if (!skipNotify && !req.notifyId && TERMINAL_STATUSES.has(status) && !(status === 'FAILED' && this.parseAst(req.ast)?.onError)) {
      this.progress({ kind: 'run.finished', conversationId: req.conversationId, requestId, status: status as StepStatus });
    }
    const nodeType = this.nodeTypeOf(req);
    if (this.trace?.enabled) {
      this.trace.record({
        conversationId: req.conversationId,
        requestId,
        projectId: req.projectId ?? null,
        nodeType,
        status,
        output: isControlNode(nodeType) ? req.output ?? null : null,
        startedAt: this.executing.get(requestId)?.startedAt ?? null,
        worker: this.workerId,
        createdAt: new Date(this.clock()),
        ...(await this.replayRecord(req, nodeType, status)),
      });
    }

    if (status !== 'COMPLETED') {
      await this.handleUnsuccessful(req, status, skipNotify);
      return;
    }

    if (req.notifyId && !skipNotify) {
      try {
        // The Response this worker just saved (engine Responses are written only by saveResponse), else the latest stored
        const lastContent =
          req.output ??
          this.executing.get(requestId)?.lastResponse ??
          (await this.store.responses.latest(requestId))?.content;

        const targetReq = await this.store.requests.get(req.notifyId);
        if (targetReq && !TERMINAL_STATUSES.has(targetReq.status)) {
          const updatedData: any = {};

          // --- CONVERSATION STATE MERGING ---
          let newUpdates: any = {};

          const agentKey = req.ast?.type === 'Curator_Agent' ? agentOutputKey(req.ast) : undefined;
          let parsed: any = null;
          if (lastContent) {
            try {
              parsed = JSON.parse(lastContent);
              if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) && CuratorRequestProcessor.isStructuredRecord(parsed)) {
                // Structured audit records (EVENT_EMITTED, CALL_STARTED, ...) are not workflow data.
                newUpdates = {};
              } else if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
                if (agentKey) {
                  newUpdates = { [agentKey]: parsed };
                } else if ((req.ast?.type === 'Curator_Tool' || req.ast?.type === 'Curator_Reduce') && req.ast.spread === false) {
                  // Non-spreading tool or reducer: its output is state only under its bound key, never field by field
                  newUpdates = { [req.ast.as || req.ast.toolName || req.ast.reducer]: parsed };
                } else {
                  newUpdates = parsed;
                }
              } else {
                newUpdates = agentKey ? { [agentKey]: lastContent } : { output: lastContent };
              }
            } catch (e) {
              newUpdates = agentKey ? { [agentKey]: lastContent } : { output: lastContent };
            }
          }

          const sourceScope = this.parseContext(req.context).__scope;
          const targetIsJoin = this.parseAst(targetReq.ast)?.type === 'Curator_Join';
          const shouldPersistInState = req.ast?.type !== 'Curator_Agent' && !req.ast?.ephemeral;
          // The state the write produced; read only when nothing was written
          let written =
            shouldPersistInState && Object.keys(newUpdates).length > 0
              ? await this.writeState(targetReq.conversationId, sourceScope, newUpdates, req, { output: true })
              : null;
          // A fork's fork-point step: its statePatch lands after the step's own output, before anything reads it
          const boundaryPatch = this.boundaryPatches.get(req.id);
          if (boundaryPatch) {
            this.boundaryPatches.delete(req.id);
            written = await this.writeState(targetReq.conversationId, null, boundaryPatch, req, { raw: true });
          }
          const stateNow = written
            ? written.state
            : this.getConversationState(await this.prisma.conversation.findUnique({ where: { id: targetReq.conversationId } }));
          // A private flow's output stays in its scope; its Join sees only shared state.
          const mergedState = this.stateView(stateNow, targetIsJoin ? null : sourceScope);

          // Carry forward named tool output keys from source request context
          // (e.g. `discovery`, `episode`) so downstream nodes can reference them.
          const targetContext = this.parseContext(targetReq.context);
          const sourceContext = this.parseContext(req.context);

          if (agentKey) {
            const agentOutput = newUpdates[agentKey] ?? (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : lastContent);
            targetContext[agentKey] = agentOutput;
            targetContext.$response = agentOutput;
            targetContext.$last = agentOutput;
          }
          const skipKeys = new Set([...ENGINE_PROGRESS_KEYS, 'waitEvent', 'payloadAlias', 'astPath', '__joinScope', FORK_PATH_KEY, 'iteration', 'index']);
          // A parked Curator_Call caller is isolated from its callee: the result flows back only via `as`.
          if (!targetContext.callPending && !(targetIsJoin && sourceScope != null)) {
            for (const [k, v] of Object.entries(sourceContext)) {
              if (skipKeys.has(k)) continue;
              // A Join keeps the branch tag of the parallel's parent (set when the parallel started)
              if (targetIsJoin && k === BRANCH_KEY) continue;
              targetContext[k] = v;
            }
          }
          // A scope follows its own chain only; the continuation after a Join gets the scope of the parallel's parent.
          if (targetIsJoin) {
            if (targetContext.__joinScope != null) targetContext.__scope = targetContext.__joinScope;
            else delete targetContext.__scope;
          }
          targetContext.input = JSON.stringify(mergedState);
          targetContext.state = mergedState;
          updatedData.context = targetContext;

          // Context and dependency count in one write: the target becomes claimable only with its context written
          await this.dependencyDone(req.notifyId, { ...targetReq, data: updatedData });
        }
      } catch (notifyErr: any) {
        if (notifyErr?.code === 'P2028' || notifyErr?.message?.includes('Transaction already closed')) {
          logger.warn(`[CuratorRequestProcessor] completeRequest: notify skipped for req ${requestId} (closed tx)`);
        } else {
          logger.error(`[CuratorRequestProcessor] completeRequest: notify error for req ${requestId}:`, notifyErr);
        }
      }
    }
  }

  private async evaluateExpressionAsync(expr: string, req: any): Promise<any> {
    const conv = await this.prisma.conversation.findUnique({ where: { id: req.conversationId } });
    let reqContext = req.context || {};
    if (typeof reqContext === 'string') {
      try { reqContext = JSON.parse(reqContext); } catch (_) {}
    }
    req.context = reqContext;
    const scope = req.context.__scope;
    // The event log is authoritative: its live view wins over the snapshot copied into this request when it
    // was scheduled (other flows may have written state since). Snapshot-only keys (e.g. a resumed
    // request's contextPatch) survive.
    const snapshot = scope == null
      ? {
        ...(typeof req.context.state === 'object' && req.context.state !== null ? req.context.state : {}),
        ...(req.context[STATE_PATCH_KEY] || {}),
      }
      : {};
    const convState = this.stateView({ ...snapshot, ...this.getConversationState(conv) }, scope);
    req.context.state = convState;

    // Strip {{...}} mustache wrappers — the VM just needs the raw JS expression
    let cleanExpr = (expr || '').trim();
    if (cleanExpr.startsWith('{{') && cleanExpr.endsWith('}}')) {
      cleanExpr = cleanExpr.slice(2, -2).trim();
    }

    // `not` / `and` / `or` become operators and chains on $state, $context, ... become null-safe (`?.`), so missing
    // intermediate objects evaluate to `undefined`; text inside string literals is left as written.
    cleanExpr = normalizeExpression(cleanExpr);

    // Build sandbox: start with state keys at top level, then add well-known aliases,
    // then spread the full req.context so any named tool output (e.g. `discovery`) is accessible.
    const safeSandbox: Record<string, any> = {};
    // First copy state keys
    for (const [k, v] of Object.entries(convState)) {
      try { JSON.stringify(v); safeSandbox[k] = v; } catch (_) {}
    }
    // Then overlay context keys (tool outputs, iterator vars)
    for (const [k, v] of Object.entries(req.context)) {
      if (k === 'state') continue;
      try { JSON.stringify(v); safeSandbox[k] = v; } catch (_) {}
    }
    // Ensure safeSandbox.context transparently delegates property accesses to convState
    // so both context variables (tool returns) and state variables (setState) are accessible on ctx.
    const mergedContext = new Proxy(req.context, {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (typeof prop === 'string' && prop in convState) return convState[prop];
        return undefined;
      },
      has(target, prop) {
        return prop in target || (typeof prop === 'string' && prop in convState);
      }
    });

    // Always ensure these are present
    safeSandbox.state = convState;
    safeSandbox.input = req.context.input;
    safeSandbox.context = mergedContext;
    safeSandbox.$context = mergedContext;
    safeSandbox.$state = convState;
    safeSandbox.$params = req.context.params ?? {};
    safeSandbox.$response = req.context?.$response;
    safeSandbox.$last = req.context?.$last ?? req.context?.$response;
    // Configuration: plugin/host defaults with saved values of this request's project and user (read-only)
    safeSandbox.$config = await this.configFor(req);

    const vmContext = vm.createContext(safeSandbox);
    try {
      return vm.runInContext(cleanExpr, vmContext, { timeout: 1000 });
    } catch (e) {
      logger.error(`[CuratorRequestProcessor] Expression evaluation failed for: ${cleanExpr}`, e);
      return false;
    }
  }

}
