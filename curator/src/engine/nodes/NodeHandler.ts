/**
 * Node handler contract: one module per AST node type, dispatched by `NodeRegistry`.
 * A handler only touches the engine through `NodeContext`, so it can be tested with a fake context
 * and registered by plugins without editing `CuratorRequestProcessor`.
 */
import type { CuratorEventEmitResult, CuratorReducer } from '../CuratorContracts.js';
import type { DispatchEventOptions } from '../CuratorRequestProcessor.js';
import type { ILlmProvider } from '../llm/ILlmProvider.js';
import type { LlmCallSink, LlmTelemetrySink } from '../llm/LlmTrace.js';
import type { OutputFormats } from '../output/OutputFormats.js';
import type { CuratorHistoryCompactor } from '../history/HistoryCompaction.js';
import type { IStorageAdapter } from '../../storage/IStorageAdapter.js';
import type { ProgressEventInput } from '../ProgressEvents.js';

/**
 * Typed handle for a plugin-provided service (like a Bevy resource type). Keys are compared by identity,
 * so two plugins can never collide on a name; `name` is only used in error messages.
 */
export interface ServiceKey<T> {
  readonly name: string;
  /** Type carrier only; never set. */
  readonly __service?: T;
}

export function defineService<T>(name: string): ServiceKey<T> {
  return Object.freeze({ name }) as ServiceKey<T>;
}

export interface ServiceBinding<T = any> {
  key: ServiceKey<T>;
  value: T;
}

/** Pairs a service key with its implementation, for `services` lists of plugins and processor options. */
export function provide<T>(key: ServiceKey<T>, value: T): ServiceBinding<T> {
  return { key, value };
}

/** Lookup of plugin / host services, shared by node handlers and maintenance systems. */
export interface ServiceAccess {
  /** The service bound to `key`; throws when nothing provides it. */
  service<T>(key: ServiceKey<T>): T;
  /** The service bound to `key`, or undefined (for optional dependencies). */
  tryService<T>(key: ServiceKey<T>): T | undefined;
}

/** Event log, delivery and wait-cursor primitives (`ctx.events`). */
export interface NodeEventServices {
  /** Logs an event, starts matching subscriptions and resumes matching waits. */
  dispatch(eventName: string, payload: any, req: any, targetAgentId?: string, opts?: DispatchEventOptions): Promise<CuratorEventEmitResult>;
  /** Stamps conversation / session origin fields onto an object payload (in place). */
  addOrigin(payload: any, req: any): void;
  /** BusEvent id the flow of `reqId` has consumed up to (`replay` with no cursor yet starts from 0). */
  resolveCursor(reqId: number, conversationId: number, replay?: boolean): Promise<number>;
  /** Raises the cursor of `reqId` and every request it notifies, stopping before a Join. */
  advanceCursor(reqId: number, seq: number): Promise<void>;
  /** Request ids of a flow: the request and everything it notifies, stopping before a Join. */
  flowChain(reqId: number | null | undefined): Promise<Set<number>>;
  /** Identity used to address events: the private scope, else the request's agent. */
  identityOf(req: any): string | null;
}

/** In-process data of a direct tool Request: runtime-only inputs and the raw output/error. */
export interface InflightToolCall {
  runtimeArgs?: Record<string, any>;
  runtimeContext?: Record<string, any>;
  broadcastToolEvents?: boolean;
  raw?: any;
  error?: any;
}

export interface ToolAccessResult {
  allowed: boolean;
  requiresConfirmation: boolean;
  reason?: string;
  approvalScope?: string;
  roles?: string[];
}

export interface ToolRoleAccessResult {
  allowed: boolean;
  reason?: string;
  roleNames?: string[];
}

/** LLM provider lookup (`ctx.llm`). */
export interface NodeLlmServices {
  /** Provider by name (default provider when omitted); `baseUrl` targets an OpenAI-compatible endpoint. */
  provider(name?: string, baseUrl?: string): ILlmProvider;
  /** Records each LLM call in `LlmCall` (see llm/LlmTrace.ts); absent when that trace is off. */
  recordCall?: LlmCallSink;
  /** Records lightweight numeric LLM usage telemetry in `LlmTelemetry`. */
  recordTelemetry?: LlmTelemetrySink;
}

/** Tool / reducer registry and the tool access gate (`ctx.tools`). */
export interface NodeToolServices {
  /** Resolves a tool by key, or by alias within `req`'s project (see `CuratorEngine.resolveTool`). */
  get(name: string, req?: any): any | undefined;
  /** Tools matching a name or `*` pattern as visible to `req`'s project; `name` is the alias to offer. */
  list?(pattern: string, req?: any): { name: string; tool: any }[];
  reducer(name: string): CuratorReducer | undefined;
  /** Output formatters and tool output rules (`llm` / `display` forms of tool results). */
  output: OutputFormats;
  /** RBAC and confirmation gate for running `tool` on behalf of `req`. */
  checkAccess(req: any, toolName: string, tool: any): Promise<ToolAccessResult>;
  /** Role / project check only (no confirmation gate): whether `tool` may be offered to `req`'s actor. */
  checkRoleAccess(req: any, toolName: string, tool: any): Promise<ToolRoleAccessResult>;
  /** Default lifetime of an approval wait in ms (0 = never expires). */
  approvalTtlMs: number;
  /** Non-serializable values merged into every tool's toolContext (e.g. `{ host }`). */
  contextExtras: Record<string, any>;
  inflight(requestId: number): InflightToolCall | undefined;
}

/** Agent history services (`ctx.history`). */
export interface NodeHistoryServices {
  /** History compaction strategy by name (plugin `historyCompactors`, built-ins). */
  compactor(name: string): CuratorHistoryCompactor | undefined;
}

/** Subroutine call settings (`ctx.calls`); refs resolve through ScriptRegistry. */
export interface NodeCallServices {
  /** Maximum nested Curator_Call depth. */
  maxDepth: number;
  /** 'reference': callee Requests point to scriptId+scriptVersion+context.astPath; 'snapshot': they carry the AST. */
  astStorage: 'reference' | 'snapshot';
}

/**
 * Engine primitives a node handler may use. Implemented by `CuratorRequestProcessor`.
 * Built-in concerns live in focused services (`events`, `tools`, `calls`, `llm`); plugin concerns are reached with `service(key)`.
 */
export interface NodeContext extends ServiceAccess {
  events: NodeEventServices;
  tools: NodeToolServices;
  calls: NodeCallServices;
  history: NodeHistoryServices;
  llm: NodeLlmServices;
  /** Requests, Responses and bus events of the engine's database (the storage port). */
  store: IStorageAdapter;
  /** Everything else in the database (agents, scripts, conversations, history). */
  prisma: any;
  /** Clock (epoch ms) used for scheduling and deadlines. */
  now(): number;
  /** Abort signal of the attempt running in this async context: aborts when the node's `timeoutMs` passes. */
  abortSignal?(): AbortSignal | undefined;
  /**
   * Publishes an event to the host's listeners. `meta.target`: the participant it is addressed to (agent id or
   * `user:<id>`); hosts deliver addressed events only to that participant.
   */
  emit(type: string, payload: any, meta?: EmitMeta): void;
  /** Publishes a typed progress event (`curator:progress`; `v`, `seq`, `ts` are stamped by the processor). */
  progress?(event: ProgressEventInput): void;
  saveResponse(req: any, content: string): Promise<void>;
  /** Sets the final status; `data` (e.g. `{ context }`) is written in the same update. */
  completeRequest(requestId: number, status?: string, skipNotify?: boolean, data?: Record<string, any>): Promise<void>;
  /** Logs `reason`, records it as an ERROR Response and completes the Request as FAILED. */
  failRequest(req: any, reason: string): Promise<void>;
  /** Creates a validated child Request that notifies `req`, and parks `req` until it completes. */
  spawnChildAndParkParent(req: any, childData: Record<string, any>, parentContextUpdates?: Record<string, any>, parentStatus?: 'WAITING' | 'NEW'): Promise<void>;
  /** Creates a Request after validating its AST (pins the executing script version). */
  createRequest(args: { data: Record<string, any> }): Promise<any>;
  /** Resolves a node's `scheduledAt` ('in 5 minutes' or ISO) against the clock. */
  resolveScheduledAt(node: any): Date | undefined;
  parseContext(ctx: any): any;
  isDynamicExpr(v: unknown): v is string;
  evaluateExpression(expr: string, req: any): Promise<any>;
  evaluateArgs(args: Record<string, any> | undefined, req: any, literalArgs?: boolean): Promise<Record<string, any>>;
  /** Interpolates `{{ }}` placeholders; undefined when the template is empty. */
  interpolateTemplate(template: string | undefined, req: any): Promise<string | undefined>;
  /** Raw state of a loaded Conversation row (including private `__scopes`, without the snapshot cursor). */
  getConversationState(conv: any): Record<string, any>;
  /** Conversation state; with `scope`, shared state overlaid with that private bucket. */
  readState(conversationId: any, scope?: string | null): Promise<Record<string, any>>;
  /** `opts.rules`: merge rules to apply instead of the writer's (see StateMerge.ts). */
  writeState(conversationId: any, scope: string | null | undefined, updates: Record<string, any>, opts?: { rules?: Record<string, any> }): Promise<void>;
  /** Resolves a subscription handler ref ('script', 'script#sub', '#sub') to a stored script and entry. */
  resolveHandler(handler: string, req: any): Promise<{ scriptId: number; entry: string | null }>;
  /** Merge rules of `req`'s state writes: its module's `stateSchema`, then its parallel's (see StateMerge.ts). */
  mergeRules?(req: any): Promise<Record<string, any> | undefined>;
  /**
   * Closes a Join early: cancels its branches' unfinished, unclaimed requests and makes the Join runnable with
   * `flags` merged into its context. False when the Join was no longer waiting.
   */
  closeJoin(joinId: number, flags: Record<string, any>, reason: string): Promise<boolean>;
}

export interface NodeHandler<N = any> {
  /** AST `type` discriminator, e.g. 'Curator_SetState'. Plugin types must not start with 'Curator_'. */
  type: string;
  run(node: N, req: any, ctx: NodeContext): Promise<void>;
  /** Extra validation for plugin node types (built-ins are covered by the AST schema). Returns error messages. */
  validate?(node: N): string[];
}

/** Engine state a maintenance system may use. */
export interface MaintenanceContext extends ServiceAccess {
  prisma: any;
  now(): number;
  emit(type: string, payload: any, meta?: EmitMeta): void;
}

/** Delivery details of an emitted event. */
export interface EmitMeta {
  /** Addressed to this participant only (agent id or `user:<id>`). */
  target?: string | null;
}

/** A pass run in order at the start of every poll tick (like a Bevy system in a fixed schedule). */
export interface MaintenanceSystem {
  name: string;
  run(ctx: MaintenanceContext): Promise<void>;
}
