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
import { appendStatePatch, STATE_SEQ_KEY } from './ConversationStateLog.js';
import { STATE_PATCH_KEY, withoutStoredStateCopies } from './RequestContextStorage.js';
import { recordDeadLetter, TERMINAL_STATUSES } from './DeadLetters.js';
import { clearRequestContexts, completedChildrenWithContext, sweepCompletedContexts, retireByAge } from './Retention.js';
import { PrismaStorageAdapter } from '../storage/PrismaStorageAdapter.js';
import type { RequestFilter, RequestPatch, RequestStatus } from '../storage/IStorageAdapter.js';
import { StepTraceWriter, isControlNode } from './StepTrace.js';
import { PostgresWakeChannel } from './WakeChannel.js';
import { sqlDialect, type SqlDialect } from '../db/sqlDialect.js';
import { AgentRoleService } from '../services/AgentRoleService.js';
import { ApprovalService } from '../services/ApprovalService.js';
import { defaultOutputFormats, type OutputFormats } from './output/OutputFormats.js';
import { defaultHistoryCompactors, type HistoryCompactors } from './history/HistoryCompaction.js';
import {
  NodeRegistry, sequentialNode, parallelNode, joinNode, routeNode, scriptNode, setStateNode, assignNode, ifElseNode, whileNode, loopNode, forEachNode,
  interruptNode, emitEventNode, emitEventsNode, subscribeNode, unsubscribeNode, waitEventNode, humanInputNode, toolNode, reduceNode,
  graphNode, callNode, agentRefNode, actorRefNode,
  agentNode, agentOutputKey,
} from './nodes/index.js';
import type { NodeContext, NodeHandler, MaintenanceContext, MaintenanceSystem, InflightToolCall, ToolAccessResult, ToolRoleAccessResult, ServiceBinding, ServiceKey } from './nodes/index.js';
// Audit trail = Request/Response rows (see AuditService for the derived read view).

/** Statuses of a request that has not ended. */
const LIVE_STATUSES: RequestStatus[] = ['NEW', 'WAITING', 'WAITING_FOR_USER', 'WAITING_FOR_EVENT', 'PAUSED'];

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
  private execScope = new AsyncLocalStorage<{ scriptId?: number | null; scriptVersion?: number | null; priority?: number }>();
  private engine: ProcessorEngine;
  private toolContextExtras: Record<string, any>;
  /** In-process data of direct tool Requests: runtime-only inputs and the raw output/error. */
  private inflight = new Map<number, InflightToolCall>();
  private approvalTtlMs: number;
  private retention: { readOnlyRequests: 'keep' | 'prune'; readOnlyTtlMs: number; completedContext: 'trim' | 'keep' };
  private lastPruneAt = 0;
  private lastContextSweepAt = 0;
  private trace?: StepTraceWriter;
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
  private executing = new Map<number, { nodeType: string; startedAt: Date; lastResponse?: string }>();
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
      llm: { provider: (name, baseUrl) => LlmFactory.getProvider(name, baseUrl) },
      store: this.store,
      prisma: this.prisma,
      now: () => this.clock(),
      emit: (type, payload) => this.emit(type, payload),
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
      writeState: async (conversationId, scope, updates) => { await this.writeState(conversationId, scope, updates); },
      resolveHandler: (handler, req) => this.resolveHandler(handler, req),
    };

    // Built-in node types; plugin types registered on the engine are looked up after these (see processRequest).
    const builtins: NodeHandler[] = [
      sequentialNode, parallelNode, joinNode, routeNode, scriptNode, setStateNode, assignNode, ifElseNode, whileNode, loopNode, forEachNode,
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
    try {
      this.onEvent?.(type, payload);
    } catch (_) {}
  }

  private async createValidatedRequest(args: any) {
    const scope = this.execScope.getStore();
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

  private async writeState(conversationId: any, scope: string | null | undefined, updates: Record<string, any>) {
    // Event-sourced: append a patch to the EventLog and refresh the materialized view (no read-modify-write race).
    return appendStatePatch(this.prisma, conversationId, { scope: scope ?? null, set: updates });
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
      logger.debug(`[CuratorRequestProcessor] Syncing tools & permissions from CuratorEngine registry...`);
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
      // Permission/RolePermission exist only in the MariaDB schema
      const prismaAny = this.prisma as any;
      const hasPermissions = !!prismaAny.permission && !!prismaAny.rolePermission;

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

        if (!hasPermissions) {
          count++;
          continue;
        }

        // Upsert permission for tool
        const permName = `tool:${name}:execute`;
        const perm = await prismaAny.permission.upsert({
          where: { name: permName },
          update: { description: `Execute tool ${name}`, toolName: name, accessLevel, requiresConfirmation },
          create: { name: permName, description: `Execute tool ${name}`, toolName: name, accessLevel, requiresConfirmation }
        });

        // Attach to Admin role
        await prismaAny.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: adminRole.id,
              permissionId: perm.id
            }
          },
          update: {},
          create: {
            roleId: adminRole.id,
            permissionId: perm.id
          }
        });

        // If safe, attach to AgentWorker role
        if (accessLevel === 'read_only' || accessLevel === 'safe_write') {
          await prismaAny.rolePermission.upsert({
            where: {
              roleId_permissionId: {
                roleId: workerRole.id,
                permissionId: perm.id
              }
            },
            update: {},
            create: {
              roleId: workerRole.id,
              permissionId: perm.id
            }
          });
        }

        count++;
      }
      logger.debug(`[CuratorRequestProcessor] Synced ${count} tools with permissions & nested roles.`);
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
      const latest: any = await this.store.responses.latest(req.id);
      let latestParsed: any = null;
      try { latestParsed = typeof latest?.content === 'string' ? JSON.parse(latest.content) : null; } catch (_) {}
      if (CuratorRequestProcessor.isStructuredRecord(latestParsed) && latestParsed.type !== 'CHOICE_RECEIVED') continue;

      // Check targetUserId — if set, only a response from that specific user counts
      const targetUserId = (req.context as any)?.targetUserId;
      if (targetUserId) {
        if (!latest || latest.userId !== targetUserId) {
          continue; // Not yet answered by the right player
        }
      }

      logger.debug(`[CuratorRequestProcessor] Request ${req.id} received human input. Resuming...`);
      // We lock it briefly so another worker doesn't double-complete it
      await this.store.requests.update(req.id, { status: 'WAITING', lockedBy: this.workerId, lockedAt: new Date() });

      let inputContent = latest?.content;
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

      await this.execScope.run({ scriptId: req.scriptId, scriptVersion: req.scriptVersion, priority: req.priority ?? undefined }, () => curatorContext.run({
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

        this.executing.set(req.id, { nodeType: ast.type, startedAt: new Date(this.clock()) });
        const handler = this.nodes.get(ast.type) ?? this.engine.nodes?.get(ast.type);
        if (!handler) {
          logger.warn(`[CuratorRequestProcessor] Request ${req.id} has unknown AST type: ${(ast as any).type}. Skipping.`);
          await this.saveResponse(req, `ERROR: unknown AST type '${(ast as any).type}'`);
          await this.completeRequest(req.id, 'SKIPPED');
          return;
        }
        return await handler.run(ast, req, this.nodeContext);
      }));
    } catch (error: any) {
      const msg = error.message || String(error);
      const retryMatch = msg.match(/Please retry in ([\d\.]+)s/);
      const isRateLimit = msg.includes('429') || msg.includes('Quota exceeded') || !!retryMatch;
      const MAX_RETRIES = 5;

      const req = await this.store.requests.get(request.id);
      if (isRateLimit && req && req.retryCount < MAX_RETRIES) {
        let delayMs = 5000 * Math.pow(2, req.retryCount);
        if (retryMatch) delayMs = parseFloat(retryMatch[1]) * 1000 + 1000;
        const scheduledAt = new Date(this.clock() + delayMs);
        logger.debug(`[CuratorRequestProcessor] Rate limit. Rescheduling request ${request.id} in ${Math.round(delayMs/1000)}s (Attempt ${req.retryCount + 1}/${MAX_RETRIES})`);
        await this.store.requests.update(request.id, { status: 'NEW', lockedBy: null, lockedAt: null, retryCount: req.retryCount + 1, scheduledAt });
        return;
      }

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
          context: { params: { [alias]: payload }, input: payload, eventName, origin: 'AST', astPath, ...(target ? { __scope: target } : {}) }
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
        let value = opts.waitValue ? opts.waitValue(payload) : payload;
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
        updatedContext.__humanInputReceived__ = true;
        if (isMultiWait) {
          updatedContext.lastWokenEvent = eventName;
        }
        if (aliasKey || isMultiWait) {
           if (aliasKey) updatedContext[aliasKey] = value;
           updatedContext.state = { ...(updatedContext.state || {}), ...newState };

           await this.writeState(waitReq.conversationId, ctx?.__scope, newState);
        }
        if (opts.contextPatch) {
          Object.assign(updatedContext, opts.contextPatch);
          // Request-only state keys: context.state is not stored, so they ride along under their own key
          updatedContext[STATE_PATCH_KEY] = { ...(updatedContext[STATE_PATCH_KEY] || {}), ...opts.contextPatch };
        }

        await this.store.requests.update(waitReq.id, { status: 'NEW', context: updatedContext });
        woken.push(waitReq.id);
        if (eventSeq !== null) await this.advanceEventCursor(waitReq.id, eventSeq);
      }
    }

    logger.debug(`[CuratorRequestProcessor] Event '${eventName}': spawned ${spawned.length}, woke ${woken.length}`);
    return { eventName, spawned, woken };
  }

  /** Appends to the conversation's bus events; returns its sequence id (null if the DB has no BusEvent table). */
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

  private async failRequest(req: any, reason: string) {
    logger.error(`[CuratorRequestProcessor] Request ${req.id} failed: ${reason}`);
    await this.saveResponse(req, `ERROR: ${reason}`);
    await this.completeRequest(req.id, 'FAILED');
  }

  /**
   * Paths B/C: one direct tool call (REPL, CLI, API) as a light Request, executed synchronously through
   * the same handler as AST tool nodes (RBAC, approval gate, secrets, Response). Throws on tool error
   * or when access is denied; returns status WAITING_FOR_USER when approval is required.
   */
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
      return {
        requestId: created.id,
        status: done?.status ?? 'UNKNOWN',
        result: record ? undefined : (flight?.raw !== undefined ? flight.raw : parsed),
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

  private async resolveActorPermissions(actor: { userId?: string; agentId?: string }): Promise<Set<string>> {
    const permissions = new Set<string>();
    const visitedRoles = new Set<string>();
    const roleQueue: string[] = [];

    try {
      if (actor.userId) {
        const userRoles = await this.prisma.userRole.findMany({
          where: { userId: actor.userId },
          select: { roleId: true }
        });
        for (const ur of userRoles) roleQueue.push(ur.roleId);
      }

      if (actor.agentId) {
        const agentRoles = await this.prisma.agentRole.findMany({
          where: { agentId: actor.agentId },
          select: { roleId: true }
        });
        for (const ar of agentRoles) roleQueue.push(ar.roleId);
      }

      // Recursively traverse role inheritance graph (nested subroles)
      while (roleQueue.length > 0) {
        const roleId = roleQueue.shift()!;
        if (visitedRoles.has(roleId)) continue;
        visitedRoles.add(roleId);

        // Fetch role's permissions
        const rolePerms = await this.prisma.rolePermission.findMany({
          where: { roleId },
          include: { permission: true }
        });
        for (const rp of rolePerms) {
          if (rp.permission?.name) {
            permissions.add(rp.permission.name);
            if (rp.permission.toolName) permissions.add(`tool:${rp.permission.toolName}:execute`);
          }
        }

        // Fetch inherited subroles
        const inherited = await this.prisma.roleInheritance.findMany({
          where: { parentId: roleId },
          select: { subRoleId: true }
        });
        for (const inh of inherited) {
          if (!visitedRoles.has(inh.subRoleId)) {
            roleQueue.push(inh.subRoleId);
          }
        }
      }
    } catch (err) {
      logger.error('[CuratorRequestProcessor] Error resolving actor permissions:', err);
    }

    return permissions;
  }

  private async checkToolRoleAccess(req: any, toolName: string, tool: any): Promise<ToolRoleAccessResult> {
    if (!this.prisma) return { allowed: true };
    const accessLevel = (tool as any).accessLevel || 'safe_write';
    const requiresConfirmation = (tool as any).requiresConfirmation || (tool as any).requiresHumanApproval || accessLevel === 'destructive' || accessLevel === 'elevated';
    const effectiveAgentId = req.agentId || req.context?.agentId || req.context?.activeAgentId || req.context?.actorId;
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
    } catch (roleErr) {
      logger.warn('[CuratorRequestProcessor] AgentRoleService check failed:', roleErr);
      return { allowed: true };
    }
  }

  private async checkToolAccess(req: any, toolName: string, tool: any): Promise<ToolAccessResult> {
    const accessLevel = (tool as any).accessLevel || 'safe_write';
    const requiresConfirmation = (tool as any).requiresConfirmation || (tool as any).requiresHumanApproval || accessLevel === 'destructive' || accessLevel === 'elevated';

    // 1. Actor Role Whitelisting (Agent or Human User)
    if (this.prisma) {
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

    // 3. Check granular actor permissions in database if present
    try {
      const totalPermissionsCount = (await this.definition('permissions:count', async () => (await this.prisma.permission?.count?.()) || 0)) as number;
      if (totalPermissionsCount > 0) {
        const actorPerms = await this.definition(`permissions:${req.userId ?? ''}:${req.agentId ?? ''}`, () =>
          this.resolveActorPermissions({ userId: req.userId, agentId: req.agentId })
        );
        if (actorPerms.size > 0) {
          const hasDirectPerm = actorPerms.has(`tool:${toolName}:execute`) || actorPerms.has('*') || actorPerms.has('admin');
          if (!hasDirectPerm) {
            return {
              allowed: false,
              requiresConfirmation: false,
              reason: `Actor lacks required permission 'tool:${toolName}:execute'.`
            };
          }
        }
      }
    } catch (err) {
      logger.warn('[CuratorRequestProcessor] Permission check encountered error, defaulting to safe allow:', err);
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
      const record: CuratorStructuredResponse = {
        type: 'APPROVAL_EXPIRED', ok: false, tool: pending.name, expiresAt: pending.expiresAt, reason: ctx.reason
      };
      const nextCtx: any = { ...ctx };
      delete nextCtx.pendingToolCall;
      const proceed = pending.onExpired === 'continue';
      if (proceed) {
        const outcome = { ok: false, expired: true, type: 'APPROVAL_EXPIRED', tool: pending.name };
        nextCtx[pending.name] = outcome;
        if (pending.as) nextCtx[pending.as] = outcome;
      }
      req.context = nextCtx;
      await this.saveResponse(req, JSON.stringify(record));
      await this.completeRequest(req.id, proceed ? 'COMPLETED' : 'FAILED', false, { context: nextCtx });
    }
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
      req.context = nextCtx;
      const record: CuratorStructuredResponse = { type: isEventWait ? 'WAIT_TIMEOUT' : 'HUMAN_TIMEOUT', ok: false, deadline: ctx.waitDeadline, reason: isEventWait ? ctx.waitEvent : ctx.choicePrompt };
      await this.saveResponse(req, JSON.stringify(record));

      const reqAst = this.parseAst(req.ast);
      if (reqAst?.onTimeout) {
        await this.createValidatedRequest({
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
    'TOOL_BLOCKED', 'APPROVAL_REQUIRED', 'APPROVAL_EXPIRED', 'HUMAN_TIMEOUT', 'WAIT_TIMEOUT', 'EVENT_EMITTED', 'EVENTS_EMITTED', 'CHOICE_PROMPT', 'CHOICE_RECEIVED',
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
      });
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
    const nodeType = this.nodeTypeOf(req);
    this.trace?.record({
      conversationId: req.conversationId,
      requestId,
      projectId: req.projectId ?? null,
      nodeType,
      status,
      output: isControlNode(nodeType) ? req.output ?? null : null,
      startedAt: this.executing.get(requestId)?.startedAt ?? null,
      worker: this.workerId,
      createdAt: new Date(this.clock()),
    });

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
          const written =
            shouldPersistInState && Object.keys(newUpdates).length > 0
              ? await this.writeState(targetReq.conversationId, sourceScope, newUpdates)
              : null;
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
          const skipKeys = new Set(['forEachIndex', 'forEachCollection', 'ifElseEvaluated',
            'spawnedChild', 'routeDecided', 'pendingToolCall', 'waitEvent', 'payloadAlias', 'astPath',
            '__humanInputReceived__', '__joinScope', 'waitDeadline',
            'loopIteration', 'loopRunning', 'loopCollection', 'iteration', 'index']);
          // A parked Curator_Call caller is isolated from its callee: the result flows back only via `as`.
          if (!targetContext.callPending && !(targetIsJoin && sourceScope != null)) {
            for (const [k, v] of Object.entries(sourceContext)) {
              if (!skipKeys.has(k)) targetContext[k] = v;
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

    // Normalize natural CoffeeScript boolean operators into valid JS expressions
    cleanExpr = cleanExpr
      .replace(/\bnot\s+/g, '!')
      .replace(/\s+and\s+/g, ' && ')
      .replace(/\s+or\s+/g, ' || ');

    // Make property chains on $state, $context, $params, $config, $actor, and __item null-safe (`?.`)
    // so missing intermediate objects evaluate to `undefined` instead of throwing a TypeError in the VM.
    cleanExpr = cleanExpr.replace(
      /(\$(?:state|context|params|config|actor|last|response)\b|__item\d*\b)((?:\??\.[a-zA-Z_$][\w$]*|\[[^\]]+\])+)/g,
      (_match, root, chain) => `${root}${chain.replace(/\.(?=[a-zA-Z_$])/g, '?.')}`
    );

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
    // Host/plugin configuration: read-only (frozen by the engine), the same for every flow
    safeSandbox.$config = this.engine.config ?? {};

    const vmContext = vm.createContext(safeSandbox);
    try {
      return vm.runInContext(cleanExpr, vmContext);
    } catch (e) {
      logger.error(`[CuratorRequestProcessor] Expression evaluation failed for: ${cleanExpr}`, e);
      return false;
    }
  }

}
