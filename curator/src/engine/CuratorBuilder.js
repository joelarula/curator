export class CuratorBuilder {
    /**
     * Evaluates an expression and assigns it to a key in `context.state`.
     * e.g. .assign('state.turn', (ctx) => ctx.state.turn + 1)
     */
    static assign(key, expression) {
        const exprStr = typeof expression === 'function' ? `(${expression.toString()})(context)` : expression;
        return { type: 'Curator_Assign', key, expression: exprStr };
    }
    /**
     * If the condition expression evaluates to true, executes `thenBranch`, else optionally executes `elseBranch`.
     */
    static ifElse(condition, thenBranch, elseBranch) {
        const condStr = typeof condition === 'function' ? `(${condition.toString()})(context)` : condition;
        return { type: 'Curator_IfElse', condition: condStr, thenBranch, elseBranch };
    }
    /**
     * While the condition evaluates to true, loop over the `body`.
     */
    static whileLoop(condition, body) {
        const condStr = typeof condition === 'function' ? `(${condition.toString()})(context)` : condition;
        return { type: 'Curator_While', condition: condStr, body };
    }
    /**
     * Iterate over a collection expression (evaluates to an array).
     */
    static forEach(collectionExpression, body, iteratorName) {
        const exprStr = typeof collectionExpression === 'function' ? `(${collectionExpression.toString()})(context)` : collectionExpression;
        return { type: 'Curator_ForEach', collectionExpression: exprStr, body, iteratorName };
    }
    /**
     * Emit a Pub/Sub event to awaken listening AgentWorkflows.
     */
    static emitEvent(eventName, payload, targetAgentId) {
        const payloadVal = typeof payload === 'function' ? `(${payload.toString()})(context)` : payload;
        const targetAgentIdVal = typeof targetAgentId === 'function' ? `(${targetAgentId.toString()})(context)` : targetAgentId;
        return { type: 'Curator_EmitEvent', eventName, payload: payloadVal, targetAgentId: targetAgentIdVal };
    }
    /**
     * Wait synchronously for a Pub/Sub event to be emitted.
     */
    static waitEvent(eventName, payloadAlias) {
        return { type: 'Curator_WaitEvent', eventName, payloadAlias };
    }
    /**
     * Runs the provided nodes sequentially.
     */
    static seq(name, ...nodes) {
        return { type: 'Curator_Sequential', name, subAgents: nodes };
    }
    /**
     * Runs the provided nodes in parallel.
     */
    static parallel(name, ...nodes) {
        return { type: 'Curator_Parallel', name, subAgents: nodes };
    }
    /**
     * Merge state with the provided record.
     */
    static setState(state) {
        return { type: 'Curator_SetState', state };
    }
    /**
     * Wait for human input from the UI or CLI.
     */
    static humanInput(prompt, inputType = 'text', choices) {
        return { type: 'Curator_HumanInput', prompt, inputType, choices };
    }
    /**
     * Call an LLM agent with tools.
     */
    static agent(options) {
        return { type: 'Curator_Agent', ...options };
    }
    /**
     * Execute an arbitrary script (e.g. for game logic evaluation).
     * Can accept a raw string or a closure that takes the `context` object.
     */
    static script(code, language = 'javascript') {
        const codeStr = typeof code === 'function' ? `(${code.toString()})(context)` : code;
        return { type: 'Curator_Script', language, code: codeStr };
    }
    /**
     * Execute a registered tool.
     */
    static tool(toolName, args) {
        const evaluatedArgs = {};
        if (args) {
            for (const [k, v] of Object.entries(args)) {
                evaluatedArgs[k] = typeof v === 'function' ? `(${v.toString()})(context)` : v;
            }
        }
        return { type: 'Curator_Tool', toolName, args: evaluatedArgs };
    }
}
//# sourceMappingURL=CuratorBuilder.js.map