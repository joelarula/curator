import type {
  CuratorAstNode,
  CuratorSequentialNode,
  CuratorAssignNode,
  CuratorIfElseNode,
  CuratorWhileNode,
  CuratorForEachNode,
  CuratorAgentNode,
  CuratorEmitEventNode,
  CuratorSetStateNode,
  CuratorHumanInputNode,
  CuratorChoiceItem,
  CuratorParallelNode,
  CuratorScriptNode,
  CuratorWaitEventNode,
  CuratorToolNode,
} from '../CuratorAst.js';

/**
 * Core AST Node Factory for primitive computational and workflow verbs.
 */
export class CuratorCoreBuilder {
  /**
   * Evaluates an expression and assigns it to a key in `context.state`.
   * e.g. .assign('state.turn', (ctx) => ctx.state.turn + 1)
   */
  static assign(key: string, expression: string | ((ctx: any) => any)): CuratorAssignNode {
    const exprStr = typeof expression === 'function' ? `(${expression.toString()})(context)` : expression;
    return { type: 'Curator_Assign', key, expression: exprStr };
  }

  /**
   * If the condition expression evaluates to true, executes `thenBranch`, else optionally executes `elseBranch`.
   */
  static ifElse(condition: string | ((ctx: any) => boolean), thenBranch: CuratorAstNode, elseBranch?: CuratorAstNode): CuratorIfElseNode {
    const condStr = typeof condition === 'function' ? `(${condition.toString()})(context)` : condition;
    return { type: 'Curator_IfElse', condition: condStr, thenBranch, elseBranch };
  }

  /**
   * While the condition evaluates to true, loop over the `body`.
   */
  static whileLoop(condition: string | ((ctx: any) => boolean), body: CuratorAstNode): CuratorWhileNode {
    const condStr = typeof condition === 'function' ? `(${condition.toString()})(context)` : condition;
    return { type: 'Curator_While', condition: condStr, body };
  }

  /**
   * Iterate over a collection expression (evaluates to an array).
   */
  static forEach(collectionExpression: string | ((ctx: any) => any[]), body: CuratorAstNode, iteratorName?: string): CuratorForEachNode {
    const exprStr = typeof collectionExpression === 'function' ? `(${collectionExpression.toString()})(context)` : collectionExpression;
    return { type: 'Curator_ForEach', collectionExpression: exprStr, body, iteratorName };
  }

  /**
   * Emit a Pub/Sub event to awaken listening AgentWorkflows.
   */
  static emitEvent(eventName: string, payload?: any | ((ctx: any) => any), targetAgentId?: number | string | ((ctx: any) => number | string)): CuratorEmitEventNode {
    const payloadVal = typeof payload === 'function' ? `(${payload.toString()})(context)` : payload;
    const targetAgentIdVal = typeof targetAgentId === 'function' ? `(${targetAgentId.toString()})(context)` : targetAgentId;
    return { type: 'Curator_EmitEvent', eventName, payload: payloadVal, targetAgentId: targetAgentIdVal };
  }

  /**
   * Wait synchronously for a Pub/Sub event to be emitted.
   */
  static waitEvent(eventName: string, payloadAlias?: string): CuratorWaitEventNode {
    return { type: 'Curator_WaitEvent', eventName, payloadAlias };
  }

  /**
   * Runs the provided nodes sequentially. Automatically resolves fluent builder instances.
   */
  static seq(name: string, ...nodes: (CuratorAstNode | { build: () => CuratorAstNode } | any)[]): CuratorSequentialNode {
    const rawList = nodes.length === 1 && Array.isArray(nodes[0]) ? nodes[0] : nodes.flat();
    const unwrapped = rawList.map(n => (n && typeof n === 'object' && typeof n.build === 'function' ? n.build() : n));
    return { type: 'Curator_Sequential', name, subAgents: unwrapped };
  }

  /**
   * Runs the provided nodes in parallel. Automatically resolves fluent builder instances.
   */
  static parallel(name: string, ...nodes: (CuratorAstNode | { build: () => CuratorAstNode } | any)[]): CuratorParallelNode {
    const rawList = nodes.length === 1 && Array.isArray(nodes[0]) ? nodes[0] : nodes.flat();
    const unwrapped = rawList.map(n => (n && typeof n === 'object' && typeof n.build === 'function' ? n.build() : n));
    return { type: 'Curator_Parallel', name, subAgents: unwrapped };
  }

  /**
   * Merge state with the provided record.
   */
  static setState(state: Record<string, any>): CuratorSetStateNode {
    return { type: 'Curator_SetState', state };
  }

  /**
   * Wait for human input from the UI or CLI.
   */
  static humanInput(
    prompt: string,
    inputType: 'text' | 'choices' | 'file' = 'text',
    choices?: (string | CuratorChoiceItem)[] | string,
    options?: { targetUserId?: number; as?: string; blocking?: boolean; timeoutSeconds?: number; name?: string }
  ): CuratorHumanInputNode {
    return {
      type: 'Curator_HumanInput',
      prompt,
      inputType,
      choices,
      ...options,
    };
  }

  /**
   * Universal affordance / choice verb.
   * Presents a set of choices to the user/actor and awaits selection if blocking.
   */
  static choice(
    prompt: string,
    choices: (string | CuratorChoiceItem)[] | string,
    options?: { targetUserId?: number; as?: string; blocking?: boolean; timeoutSeconds?: number; name?: string }
  ): CuratorHumanInputNode {
    return CuratorCoreBuilder.humanInput(prompt, 'choices', choices, {
      blocking: true,
      ...options,
    });
  }

  /**
   * Call an LLM agent with tools.
   */
  static agent(options: Omit<CuratorAgentNode, 'type'>): CuratorAgentNode {
    return { type: 'Curator_Agent', ...options };
  }

  /**
   * Execute an arbitrary script (e.g. for game logic evaluation).
   * Can accept a raw string or a closure that takes the `context` object.
   */
  static script(code: string | ((ctx: any) => any), language: 'javascript' | 'coffeescript' = 'javascript'): CuratorScriptNode {
    const codeStr = typeof code === 'function' ? `(${code.toString()})(context)` : code;
    return { type: 'Curator_Script', language, code: codeStr };
  }

  /**
   * Execute a registered tool.
   */
  static tool(toolName: string, args?: Record<string, any>, as?: string): CuratorToolNode {
    const evaluatedArgs: Record<string, any> = {};
    if (args) {
      for (const [k, v] of Object.entries(args)) {
        evaluatedArgs[k] = typeof v === 'function' ? `(${v.toString()})(context)` : v;
      }
    }
    const node: CuratorToolNode = { type: 'Curator_Tool', toolName, args: evaluatedArgs };
    if (as) node.as = as;
    return node;
  }

  /**
   * Reference a sensitive credential or API token via a secure placeholder.
   * e.g. CuratorCoreBuilder.secret('GITHUB_TOKEN') -> '$secret:GITHUB_TOKEN'
   */
  static secret(key: string): string {
    return `$secret:${key}`;
  }
}
