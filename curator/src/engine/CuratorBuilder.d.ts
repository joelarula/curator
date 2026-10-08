import type { CuratorAstNode, CuratorSequentialNode, CuratorAssignNode, CuratorIfElseNode, CuratorWhileNode, CuratorForEachNode, CuratorAgentNode, CuratorEmitEventNode, CuratorSetStateNode, CuratorHumanInputNode, CuratorParallelNode, CuratorScriptNode, CuratorWaitEventNode, CuratorToolNode } from './CuratorAst.js';
export declare class CuratorBuilder {
    /**
     * Evaluates an expression and assigns it to a key in `context.state`.
     * e.g. .assign('state.turn', (ctx) => ctx.state.turn + 1)
     */
    static assign(key: string, expression: string | ((ctx: any) => any)): CuratorAssignNode;
    /**
     * If the condition expression evaluates to true, executes `thenBranch`, else optionally executes `elseBranch`.
     */
    static ifElse(condition: string | ((ctx: any) => boolean), thenBranch: CuratorAstNode, elseBranch?: CuratorAstNode): CuratorIfElseNode;
    /**
     * While the condition evaluates to true, loop over the `body`.
     */
    static whileLoop(condition: string | ((ctx: any) => boolean), body: CuratorAstNode): CuratorWhileNode;
    /**
     * Iterate over a collection expression (evaluates to an array).
     */
    static forEach(collectionExpression: string | ((ctx: any) => any[]), body: CuratorAstNode, iteratorName?: string): CuratorForEachNode;
    /**
     * Emit a Pub/Sub event to awaken listening AgentWorkflows.
     */
    static emitEvent(eventName: string, payload?: any | ((ctx: any) => any), targetAgentId?: number | string | ((ctx: any) => number | string)): CuratorEmitEventNode;
    /**
     * Wait synchronously for a Pub/Sub event to be emitted.
     */
    static waitEvent(eventName: string, payloadAlias?: string): CuratorWaitEventNode;
    /**
     * Runs the provided nodes sequentially.
     */
    static seq(name: string, ...nodes: CuratorAstNode[]): CuratorSequentialNode;
    /**
     * Runs the provided nodes in parallel.
     */
    static parallel(name: string, ...nodes: CuratorAstNode[]): CuratorParallelNode;
    /**
     * Merge state with the provided record.
     */
    static setState(state: Record<string, any>): CuratorSetStateNode;
    /**
     * Wait for human input from the UI or CLI.
     */
    static humanInput(prompt: string, inputType?: 'text' | 'choices' | 'file', choices?: string[]): CuratorHumanInputNode;
    /**
     * Call an LLM agent with tools.
     */
    static agent(options: Omit<CuratorAgentNode, 'type'>): CuratorAgentNode;
    /**
     * Execute an arbitrary script (e.g. for game logic evaluation).
     * Can accept a raw string or a closure that takes the `context` object.
     */
    static script(code: string | ((ctx: any) => any), language?: 'javascript' | 'coffeescript'): CuratorScriptNode;
    /**
     * Execute a registered tool.
     */
    static tool(toolName: string, args?: Record<string, any>): CuratorToolNode;
}
//# sourceMappingURL=CuratorBuilder.d.ts.map