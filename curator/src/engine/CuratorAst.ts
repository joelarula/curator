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
  Script: 'Curator_Script',
  Graph: 'Curator_Graph',
  HumanInput: 'Curator_HumanInput',
  AgentRef: 'Curator_AgentRef',
  SetState: 'Curator_SetState',
  EmitEvent: 'Curator_EmitEvent',
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
  | CuratorScriptNode
  | CuratorGraphNode
  | CuratorHumanInputNode
  | CuratorAgentRefNode
  | CuratorSetStateNode
  | CuratorEmitEventNode
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
  /** 'gemini' (default) | 'local' (OpenAI-compatible endpoint, e.g. llama.cpp) */
  provider?: 'gemini' | 'local';
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

export interface CuratorWaitEventNode extends CuratorBaseNode {
  type: typeof CuratorNodeType.WaitEvent;
  eventName: string;
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

export interface CuratorGraphNode extends CuratorBaseNode {
  type: typeof CuratorNodeType.Graph;
  name?: string;
  startNode: string;
  nodes: Record<string, CuratorAstNode>;
  edges?: Record<string, string | CuratorAstNode>;
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
