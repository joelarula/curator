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
    | ParallelNode;

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
