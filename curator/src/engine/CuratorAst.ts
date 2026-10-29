export interface CuratorBaseNode {
  /** Runtime AST contract version. Version 1 is the current format. */
  astVersion?: 1;
  exclude_from_history?: boolean;
  /**
   * Delay execution of this node until a specific time.
   * Accepts an ISO 8601 datetime string or a duration string like:
   *   - "in 5 minutes"
   *   - "in 2 hours"
   *   - "in 1 day"
   *   - "2026-12-25T09:00:00Z"
   * If set, the node's Request is created with scheduledAt set accordingly,
   * and the processor will not execute it until that time arrives.
   */
  scheduledAt?: string;
  /**
   * Execution priority for this node's Request.
   * Higher values are processed before lower ones.
   * Use high values (e.g. 100) for time-critical interrupt handlers.
   * Default: 0
   */
  priority?: number;
  /**
   * Optional error recovery / fallback AST node (Bevy `on_error` / `.catch()`).
   * If this node fails, the processor executes `onError` instead of poisoning downstream requests.
   */
  onError?: CuratorAstNode;
  /**
   * Optional node run before this node executes (Bevy `with_entry`).
   */
  entryAction?: CuratorAstNode;
  /**
   * Optional node run after this node completes (Bevy `with_exit`).
   */
  exitAction?: CuratorAstNode;
  /**
   * Optional fallback AST node executed when a wait/input/approval times out.
   */
  onTimeout?: CuratorAstNode;
}

/**
 * Universal catalog of Curator AST node types.
 * Provides typesafe references for builder methods, validators, and AST processors.
 */
export const CuratorNodeType = {
  Agent: 'Curator_Agent',
  Sequential: 'Curator_Sequential',
  Parallel: 'Curator_Parallel',
  Join: 'Curator_Join',
  Route: 'Curator_Route',
  Loop: 'Curator_Loop',
  Tool: 'Curator_Tool',
  Reduce: 'Curator_Reduce',
  Script: 'Curator_Script',
  Graph: 'Curator_Graph',
  HumanInput: 'Curator_HumanInput',
  AgentRef: 'Curator_AgentRef',
  ActorRef: 'Curator_ActorRef',
  SetState: 'Curator_SetState',
  EmitEvent: 'Curator_EmitEvent',
  EmitEvents: 'Curator_EmitEvents',
  Interrupt: 'Curator_Interrupt',
  Assign: 'Curator_Assign',
  IfElse: 'Curator_IfElse',
  While: 'Curator_While',
  ForEach: 'Curator_ForEach',
  WaitEvent: 'Curator_WaitEvent',
  Module: 'Curator_Module',
  Call: 'Curator_Call',
  Subscribe: 'Curator_Subscribe',
  Unsubscribe: 'Curator_Unsubscribe',
} as const;

export type CuratorNodeType = typeof CuratorNodeType[keyof typeof CuratorNodeType];

export type CuratorAstNode = 
  | CuratorAgentNode 
  | CuratorSequentialNode 
  | CuratorParallelNode 
  | CuratorJoinNode 
  | CuratorRouteNode 
  | CuratorLoopNode
  | CuratorToolNode
  | CuratorReduceNode
  | CuratorScriptNode
  | CuratorGraphNode
  | CuratorHumanInputNode
  | CuratorAgentRefNode
  | CuratorActorRefNode
  | CuratorSetStateNode
  | CuratorEmitEventNode
  | CuratorEmitEventsNode
  | CuratorInterruptNode
  | CuratorAssignNode
  | CuratorIfElseNode
  | CuratorWhileNode
  | CuratorForEachNode
  | CuratorWaitEventNode
  | CuratorModuleNode
  | CuratorCallNode
  | CuratorSubscribeNode
  | CuratorUnsubscribeNode;

// ADK_* nodes belong to the legacy ADK processor and are intentionally not
// part of the Curator AST contract.

export interface CuratorInlineTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  sourceCode: string;
}

export interface CuratorAgentNode extends CuratorBaseNode {
  type: typeof CuratorNodeType.Agent;
  agentName?: string;
  /** Model id, or a `$` expression resolved per call (e.g. `$config.poker.models.seat`). */
  model?: string;
  instruction?: string;
  prompt?: string;
  include_contents?: 'default' | 'none';
  /**
   * 'conversation' builds this agent's prompt from the shared conversation as it sees it (own turns = assistant,
   * other agents and humans = labelled user turns, whispers/tool output only for their audience).
   * Default keeps the global history.
   */
  history_from?: 'default' | 'conversation';
  /** With history_from 'conversation': bus event names whose payload.text is part of the conversation. */
  history_events?: string[];
  /** Fixed list, or an expression such as "$state.options" evaluated on every turn (dynamic set of choices). */
  tools?: (string | CuratorInlineTool)[] | string;
  /** 'gemini' (default) | 'local' (OpenAI-compatible endpoint, e.g. llama.cpp), or a `$` expression resolved per call (e.g. `$config.poker.provider`). */
  provider?: 'gemini' | 'local' | (string & {});
  /** Base URL for local provider, e.g. 'http://localhost:8080' */
  baseUrl?: string;
  input_schema?: Record<string, any>;
  output_schema?: Record<string, any>;
  /** Key under which agent structured output is stored in context and state. Default: camelCase(agentName) or 'decision'. */
  as?: string;
}

export interface CuratorSetStateNode extends CuratorBaseNode {
  type: typeof CuratorNodeType.SetState;
  state: Record<string, any> | string;
}

export interface CuratorEmitEventNode extends CuratorBaseNode {
  type: typeof CuratorNodeType.EmitEvent;
  eventName: string;
  targetAgentId?: number | string;
  payload?: any;
}

/**
 * Emits a list of events computed at run time, e.g. what a reducer step reports.
 * `events` evaluates to `[{ name, payload?, targetAgentId? }]`; payloads are data and are not evaluated again.
 */
export interface CuratorEmitEventsNode extends CuratorBaseNode {
  type: typeof CuratorNodeType.EmitEvents;
  events: string;
}

export interface CuratorWaitEventNode extends CuratorBaseNode {
  type: typeof CuratorNodeType.WaitEvent;
  eventName: string;
  /** Additional event names that also satisfy this wait ("first wins" / race semantics, like Bevy `listen_any_event`). */
  eventNames?: string[];
  payloadAlias?: string;
  /** Give up after this long; completes with a WAIT_TIMEOUT Response and binds nothing to the alias. */
  timeoutSeconds?: number;
  /** A flow's first wait also receives events logged before the flow was created (late joiner catches up). */
  replay?: boolean;
}

export interface CuratorAssignNode extends CuratorBaseNode {
  type: typeof CuratorNodeType.Assign;
  key: string;
  expression: string;
}

export interface CuratorIfElseNode extends CuratorBaseNode {
  type: typeof CuratorNodeType.IfElse;
  condition: string;
  thenBranch: CuratorAstNode;
  elseBranch?: CuratorAstNode;
}

export interface CuratorWhileNode extends CuratorBaseNode {
  type: typeof CuratorNodeType.While;
  condition: string;
  body: CuratorAstNode;
}

export interface CuratorForEachNode extends CuratorBaseNode {
  type: typeof CuratorNodeType.ForEach;
  collectionExpression: string;
  iteratorName?: string; // defaults to "item"
  body: CuratorAstNode;
}

export interface CuratorSequentialNode extends CuratorBaseNode {
  type: typeof CuratorNodeType.Sequential;
  name?: string;
  prompt?: string;
  subAgents: CuratorAstNode[];
}

export interface CuratorParallelNode extends CuratorBaseNode {
  type: typeof CuratorNodeType.Parallel;
  name?: string;
  prompt?: string;
  /** Each branch runs in a private state scope named after the branch; events can be addressed to it via `targetAgentId`. */
  isolate?: boolean;
  subAgents: CuratorAstNode[];
}

export interface CuratorJoinNode extends CuratorBaseNode {
  type: typeof CuratorNodeType.Join;
  name?: string;
  joinLogic?: string; // "concat", "array", etc.
  nextNode?: CuratorAstNode;
}

export interface CuratorRouteNode extends CuratorBaseNode {
  type: typeof CuratorNodeType.Route;
  name?: string;
  router: CuratorAstNode;
  subAgents: Record<string, CuratorAstNode>;
  defaultRoute?: string;
}

/** Guarded graph transition; `when` sees `output`/`input` (the state's output, JSON objects parsed) plus `$state`/`$context`. */
export interface CuratorGraphTransition {
  to: string;
  /** Omitted = always taken. */
  when?: string;
}

/**
 * Curator_Graph — state machine. Each key of `nodes` is a state.
 * Transition order: state body → edge resolution → onExit[from] → (stateKey written) → onEnter[to] → body of `to`.
 */
export interface CuratorGraphNode extends CuratorBaseNode {
  type: typeof CuratorNodeType.Graph;
  name?: string;
  /** Initial state, or guarded transitions choosing it (e.g. skip a menu when a table is already chosen). */
  startNode: string | CuratorGraphTransition[];
  nodes: Record<string, CuratorAstNode>;
  /**
   * Per-state outgoing transition: a target name ('__end__' terminates), a router AST returning the target name,
   * or guarded transitions checked in order (first match wins; no match or no edge = '__end__').
   */
  edges?: Record<string, string | CuratorAstNode | CuratorGraphTransition[]>;
  /** Run when a state is entered, before its body (Bevy `OnEnter`). Keyed by state name. */
  onEnter?: Record<string, CuratorAstNode>;
  /** Run when a state is left, after its transition is chosen, also on self-transitions and '__end__' (Bevy `OnExit`). */
  onExit?: Record<string, CuratorAstNode>;
  /** Conversation state key mirroring the active state ('__end__' when finished), e.g. for `$state.phase == 'Betting'` run conditions. */
  stateKey?: string;
  /** Optional TypeScript interface/schema definition for the graph's global state */
  stateSchema?: string;
}

export interface CuratorLoopNode extends CuratorBaseNode {
  type: typeof CuratorNodeType.Loop;
  name?: string;
  /** Default prompt for the body when it has none. */
  prompt?: string;
  /** Iteration cap. Default: unbounded with `schedule`, otherwise AST_LIMITS.maxLoopIterations. */
  maxIterations?: number;
  /** Loop body, run once per iteration with `$context.iteration` (1-based). */
  agent: CuratorAstNode;
  /** Stop expression evaluated after each iteration (truthy = stop). */
  until?: string;
  /** Continue condition evaluated before each iteration (falsy = stop). */
  while?: string;
  /** Collection expression to iterate; the item is bound to `as` (default 'item') and `index` in the body's context. */
  over?: string;
  as?: string;
  /**
   * Scheduler subtype: cron ("0 14 * * 1-5") or interval ("every 10 minutes", "at 14:00").
   * Each iteration is queued for the next due time instead of running back-to-back.
   */
  schedule?: string;
  /** With `schedule`: run the first iteration now instead of at the next due time. */
  immediate?: boolean;
}

export interface CuratorToolNode extends CuratorBaseNode {
  type: typeof CuratorNodeType.Tool;
  toolName: string;
  args?: Record<string, any> | string;
  /** Optional context key to store tool output under in request context */
  as?: string;
  outputKey?: string;
  /**
   * Whether the tool output's top-level fields are also merged into the request context (default: true).
   * Set false so the output lands only under `as` / toolName and cannot overwrite unrelated keys.
   */
  spread?: boolean;
  /** @deprecated Use args. Legacy scripts are normalized at the AST boundary. */
  parameters?: Record<string, any>;
  /** Approval wait lifetime in ms when the tool requires approval (0 = never expires). Default: processor `approvalTtlMs`. */
  approvalTtlMs?: number;
  /**
   * What happens when the approval wait expires:
   * 'fail' (default) fails the step; 'continue' completes it with `{ ok: false, expired: true }`
   * under `as` / toolName so the flow can branch (e.g. `if_else "$context.<as>.expired"`).
   */
  onApprovalExpired?: 'fail' | 'continue';
}

/**
 * Runs a pure function registered by a plugin (`reducers`): no I/O, no RBAC, no tool record.
 * Its output is bound like tool output: spread into context and state, or kept under `as` when `spread` is false.
 */
export interface CuratorReduceNode extends CuratorBaseNode {
  type: typeof CuratorNodeType.Reduce;
  reducer: string;
  args?: Record<string, any> | string;
  as?: string;
  spread?: boolean;
}

export interface CuratorScriptNode extends CuratorBaseNode {
  type: typeof CuratorNodeType.Script;
  language: 'javascript' | 'coffeescript';
  code: string;
}

export interface CuratorChoiceItem {
  id: string;
  label: string;
  description?: string;
  tool?: string;
  args?: Record<string, any>;
  usage?: string;
  aliases?: string[];
  event?: string;
  payload?: any;
  value?: any;
  roles?: string[];
  blocking?: boolean;
  /** Expression evaluated when the prompt is presented; the choice is offered only when it is truthy. */
  when?: string | any;
}

export interface CuratorHumanInputNode extends CuratorBaseNode {
  type: typeof CuratorNodeType.HumanInput;
  name?: string;
  prompt: string;
  inputType?: 'text' | 'choices' | 'file';
  choices?: (string | CuratorChoiceItem)[] | string;
  /**
   * The userId of the player/user who should respond to this input.
   * If set, only responses from this user will be accepted.
   * Useful for multi-player games or multi-user workflows.
   */
  targetUserId?: number;
  /**
   * Context key to store the selected choice/response under in request.context.
   * e.g. as: 'humanAction' sets $context.humanAction
   */
  as?: string;
  blocking?: boolean;
  timeoutSeconds?: number;
}

export interface CuratorAgentRefNode extends CuratorBaseNode {
  type: typeof CuratorNodeType.AgentRef;
  agentName: string;
}

/**
 * Curator_ActorRef — let the acting entity decide who acts (Bevy `register_agent_system`).
 * Resolves `actor`, picks a handler by `kind` and runs it as a child Call with the actor as `$params.actor`,
 * so one workflow node serves humans, LLM personas and scripted bots alike.
 */
export interface CuratorActorRefNode extends CuratorBaseNode {
  type: typeof CuratorNodeType.ActorRef;
  /** Expression resolving the acting entity, e.g. the active player. */
  actor: string;
  /** Expression selecting the handler key, evaluated with `$actor` bound. Default: '$actor.kind'. */
  kind?: string;
  /** Handler registry: kind → subroutine ref ('#sub', 'script', 'script#sub'); 'default' is the fallback. */
  handlers: Record<string, string>;
  /** Extra handler args (expressions allowed, as in Call.args). */
  args?: Record<string, any>;
  /** Caller context key receiving the handler's result. */
  as?: string;
}

/**
 * Curator_Interrupt — Priority preemption node.
 *
 * When executed, cancels all NEW (pending) requests in the same conversation
 * that have a priority below `cancelBelowPriority`, then runs the `handler`
 * node at the declared `priority` level. Optionally chains to a `resume` node.
 *
 * Use cases: sensor alerts, safety stops, game event reactions.
 *
 * Example:
 *   {
 *     type: 'Curator_Interrupt',
 *     priority: 100,
 *     handler: { type: 'Curator_Agent', prompt: 'Emergency stop!' },
 *     resume: { type: 'Curator_Agent', prompt: 'Report status after stopping.' }
 *   }
 */
export interface CuratorInterruptNode extends CuratorBaseNode {
  type: typeof CuratorNodeType.Interrupt;
  /** Priority level for this interrupt — must be > 0 to have effect. */
  priority: number;
  /**
   * Execution mode:
   * - 'stop'  (default) — cancels all pending requests below threshold, runs handler.
   * - 'pause'           — suspends pending requests (PAUSED), runs optional handler, resumable later.
   * - 'play'            — resumes all PAUSED requests in the conversation.
   */
  mode?: 'stop' | 'pause' | 'play';
  /**
   * Cancel/pause all NEW requests in the conversation with priority < this value.
   * Defaults to `priority`.
   */
  cancelBelowPriority?: number;
  /** The handler to execute when the interrupt fires (optional for 'play' mode). */
  handler?: CuratorAstNode;
  /** Optional node to run after the handler completes (recovery / resume). */
  resume?: CuratorAstNode;
}

// ── Reusable subroutines & declarative events ─────────────────────────────────────
//
// Reference syntax (used by Call.ref and Subscribe.handler):
//   'script'       → `main` of the Script named `script` (whole script)
//   'script#sub'   → subroutine `sub` of that Script (subscript)
//   '#sub'         → subroutine `sub` of the current module

export interface CuratorParamSpec {
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
  required?: boolean;
  default?: any;
  description?: string;
}

export interface CuratorSubroutine {
  params?: Record<string, CuratorParamSpec>;
  body: CuratorAstNode;
  /** Expression producing the result; defaults to the last step output. */
  returns?: string;
  description?: string;
}

/**
 * Curator_Module — root of a reusable Script AST.
 * A plain (non-module) root is equivalent to a module with only `main`.
 */
export interface CuratorModuleNode extends CuratorBaseNode {
  type: typeof CuratorNodeType.Module;
  /** Should equal the owning Script.name. */
  name: string;
  description?: string;
  /** Inputs of `main`. */
  params?: Record<string, CuratorParamSpec>;
  /** Entry executed when the module is run, called or triggered without `#entry`. */
  main?: CuratorAstNode;
  subroutines?: Record<string, CuratorSubroutine>;
  /** Static subscriptions, materialized into EventSubscription rows when the Script is saved. */
  subscriptions?: CuratorSubscribeNode[];
  /**
   * Configuration defaults the module ships with, keyed by namespace (`{ poker: { talk: {...} } }`).
   * Registered plugins contribute them to `$config` below plugin and host settings.
   */
  config?: Record<string, any>;
}

/**
 * Curator_Call — invoke a subroutine.
 * - 'child' (default): runs as its own Request (parentId/notifyId = caller), isolated `$params` context.
 * - 'inline': expanded into the caller at compile time; local refs only, no waits / input / subscribe.
 */
export interface CuratorCallNode extends CuratorBaseNode {
  type: typeof CuratorNodeType.Call;
  ref: string;
  args?: Record<string, any>;
  /** Caller context key receiving the result. */
  as?: string;
  mode?: 'child' | 'inline';
}

/**
 * Curator_Subscribe — declare that `handler` runs (as a new child Request) whenever `eventName` is emitted.
 * Static when listed in Module.subscriptions; dynamic (conversation-scoped) when executed inside a flow.
 */
export interface CuratorSubscribeNode extends CuratorBaseNode {
  type: typeof CuratorNodeType.Subscribe;
  eventName: string;
  /** Named ref only ('script', 'script#sub', '#sub'); inline AST is not allowed. */
  handler: string;
  /** Param name receiving the event payload. Default: 'event'. */
  as?: string;
  /** Filter expression evaluated against the payload. */
  when?: string;
  scope?: 'conversation' | 'project';
}

export interface CuratorUnsubscribeNode extends CuratorBaseNode {
  type: typeof CuratorNodeType.Unsubscribe;
  eventName: string;
  /** If omitted, removes all dynamic subscriptions for eventName in this conversation. */
  handler?: string;
}
