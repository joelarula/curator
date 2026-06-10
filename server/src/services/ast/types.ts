/**
 * Curator Studio - Formal Execution AST
 * Represents the typed structure of the new orchestration engine.
 */

export type ASTNode = 
    | SequenceNode 
    | ToolNode 
    | ForEachNode 
    | SpawnNode 
    | IfNode
    | MatchNode
    | ParallelNode
    | WhileNode
    | StateMachineNode
    | TransitionNode;

export interface BaseNode {
    id: string; // Unique identifier for the node to allow resumability
    type: string;
}

/**
 * Executes a list of nodes sequentially.
 */
export interface SequenceNode extends BaseNode {
    type: 'Sequence';
    steps: ASTNode[];
}

/**
 * Executes a specific tool.
 * Does not dictate control flow; only returns data.
 */
export interface ToolNode extends BaseNode {
    type: 'ToolTask';
    tool: string;
    args: Record<string, any>;
    as?: string;  // Optional developer-friendly alias registered in toolData at runtime
}

/**
 * Loops over a collection, exposing the current item via `iterator`.
 */
export interface ForEachNode extends BaseNode {
    type: 'ForEach';
    collection: string; // e.g. "{{fetch_articles.items}}"
    iterator: string;   // e.g. "article"
    body: ASTNode;
}

/**
 * Spawns a detached background Request for its body.
 */
export interface SpawnNode extends BaseNode {
    type: 'Spawn';
    body: ASTNode;
}

/**
 * Evaluates a condition and branches accordingly.
 */
export interface IfNode extends BaseNode {
    type: 'IfElse';
    condition: string; // Evaluated dynamically based on context
    trueBranch: ASTNode;
    falseBranch?: ASTNode;
}

/**
 * Evaluates semantic equality between two values.
 */
export interface MatchNode extends BaseNode {
    type: 'Match';
    left: string;
    right: string;
    trueBranch: ASTNode;
    falseBranch?: ASTNode;
}

/**
 * Executes a list of nodes concurrently and waits for all of them to finish (Promise.all style).
 */
export interface ParallelNode extends BaseNode {
    type: 'Parallel';
    steps: ASTNode[];
}

/**
 * Loops over a body as long as the condition evaluates to true.
 */
export interface WhileNode extends BaseNode {
    type: 'While';
    condition: string; // Evaluated dynamically based on context
    body: ASTNode;
}

/**
 * Executes a state machine that transitions between defined states.
 */
export interface StateMachineNode extends BaseNode {
    type: 'StateMachine';
    startState: string;
    stateVar: string; // Context variable name storing the state name
    states: Record<string, ASTNode>; // Mapped state name -> execution node
}

/**
 * Transitions the parent state machine to a new state.
 */
export interface TransitionNode extends BaseNode {
    type: 'Transition';
    targetState: string;
    stateVar: string;
}
