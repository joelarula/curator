export interface CuratorBaseNode {
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
  | CuratorForEachNode;

export interface CuratorInlineTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  sourceCode: string;
}

export interface CuratorAgentNode extends CuratorBaseNode {
  type: 'Curator_Agent';
  agentName?: string;
  model?: string;
  instruction?: string;
  prompt?: string;
  include_contents?: 'default' | 'none';
  tools?: (string | CuratorInlineTool)[];
  /** 'gemini' (default) | 'local' (OpenAI-compatible endpoint, e.g. llama.cpp) */
  provider?: 'gemini' | 'local';
  /** Base URL for local provider, e.g. 'http://localhost:8080' */
  baseUrl?: string;
  input_schema?: Record<string, any>;
  output_schema?: Record<string, any>;
}

export interface CuratorSetStateNode extends CuratorBaseNode {
  type: 'Curator_SetState';
  state: Record<string, any>;
}

export interface CuratorEmitEventNode extends CuratorBaseNode {
  type: 'Curator_EmitEvent';
  eventName: string;
  targetAgentId?: number;
  payload?: any;
}

export interface CuratorAssignNode extends CuratorBaseNode {
  type: 'Curator_Assign';
  key: string;
  expression: string;
}

export interface CuratorIfElseNode extends CuratorBaseNode {
  type: 'Curator_IfElse';
  condition: string;
  thenBranch: CuratorAstNode;
  elseBranch?: CuratorAstNode;
}

export interface CuratorWhileNode extends CuratorBaseNode {
  type: 'Curator_While';
  condition: string;
  body: CuratorAstNode;
}

export interface CuratorForEachNode extends CuratorBaseNode {
  type: 'Curator_ForEach';
  collectionExpression: string;
  iteratorName?: string; // defaults to "item"
  body: CuratorAstNode;
}

export interface CuratorSequentialNode extends CuratorBaseNode {
  type: 'Curator_Sequential';
  name?: string;
  prompt?: string;
  subAgents: CuratorAstNode[];
}

export interface CuratorParallelNode extends CuratorBaseNode {
  type: 'Curator_Parallel';
  name?: string;
  prompt?: string;
  subAgents: CuratorAstNode[];
}

export interface CuratorJoinNode extends CuratorBaseNode {
  type: 'Curator_Join';
  name?: string;
  joinLogic?: string; // "concat", "array", etc.
  nextNode?: CuratorAstNode;
}

export interface CuratorRouteNode extends CuratorBaseNode {
  type: 'Curator_Route';
  name?: string;
  router: CuratorAstNode;
  subAgents: Record<string, CuratorAstNode>;
  defaultRoute?: string;
}

export interface CuratorGraphNode extends CuratorBaseNode {
  type: 'Curator_Graph';
  name?: string;
  startNode: string;
  nodes: Record<string, CuratorAstNode>;
  edges?: Record<string, string | CuratorAstNode>;
  /** Optional TypeScript interface/schema definition for the graph's global state */
  stateSchema?: string;
}

export interface CuratorLoopNode extends CuratorBaseNode {
  type: 'Curator_Loop';
  name?: string;
  prompt?: string;
  maxIterations?: number;
  agent: CuratorAstNode;
}

export interface CuratorToolNode extends CuratorBaseNode {
  type: 'Curator_Tool';
  toolName: string;
  args?: Record<string, any>;
  parameters?: Record<string, any>;
}

export interface CuratorScriptNode extends CuratorBaseNode {
  type: 'Curator_Script';
  language: 'javascript' | 'coffeescript';
  code: string;
}

export interface CuratorHumanInputNode extends CuratorBaseNode {
  type: 'Curator_HumanInput';
  name?: string;
  prompt: string;
  inputType?: 'text' | 'choices' | 'file';
  choices?: string[];
  /**
   * The userId of the player/user who should respond to this input.
   * If set, only responses from this user will be accepted.
   * Useful for multi-player games or multi-user workflows.
   */
  targetUserId?: number;
}

export interface CuratorAgentRefNode extends CuratorBaseNode {
  type: 'Curator_AgentRef';
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
  type: 'Curator_Interrupt';
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
