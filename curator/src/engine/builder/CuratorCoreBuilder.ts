import type {
  CuratorAstNode,
  CuratorSequentialNode,
  CuratorAssignNode,
  CuratorIfElseNode,
  CuratorWhileNode,
  CuratorLoopNode,
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
  CuratorModuleNode,
  CuratorSubroutine,
  CuratorParamSpec,
  CuratorCallNode,
  CuratorSubscribeNode,
  CuratorUnsubscribeNode,
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
   * Repeat `body` until `until` is truthy or `maxIterations` is reached.
   */
  static repeat(body: CuratorAstNode, options: { until?: string | ((ctx: any) => boolean); while?: string | ((ctx: any) => boolean); over?: string | ((ctx: any) => any[]); as?: string; maxIterations?: number; name?: string; prompt?: string } = {}): CuratorLoopNode {
    const expr = (v: unknown) => (typeof v === 'function' ? `(${v.toString()})(context)` : (v as string | undefined));
    const { until, while: whileCond, over, ...rest } = options;
    return {
      type: 'Curator_Loop',
      agent: body,
      ...rest,
      ...(until ? { until: expr(until) } : {}),
      ...(whileCond ? { while: expr(whileCond) } : {}),
      ...(over ? { over: expr(over) } : {}),
    };
  }

  /**
   * Scheduler: run `body` on a cron/interval `schedule` ("every 10 minutes", "0 14 * * 1-5", "at 14:00").
   */
  static every(schedule: string, body: CuratorAstNode, options: { until?: string; while?: string; over?: string; as?: string; maxIterations?: number; immediate?: boolean; name?: string } = {}): CuratorLoopNode {
    return { type: 'Curator_Loop', agent: body, schedule, ...options };
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
   * Declares a reusable module (root of a Script AST).
   * e.g. defineModule('poker_table', { main, subroutines: { onPing: sub(...) }, subscriptions: [subscribe(...)] })
   */
  static defineModule(
    name: string,
    options: {
      main?: CuratorAstNode | { build: () => CuratorAstNode };
      params?: Record<string, CuratorParamSpec>;
      subroutines?: Record<string, CuratorSubroutine>;
      subscriptions?: CuratorSubscribeNode[];
      description?: string;
    }
  ): CuratorModuleNode {
    const main = options.main && typeof (options.main as any).build === 'function' ? (options.main as any).build() : options.main;
    return { type: 'Curator_Module', name, ...options, main };
  }

  /** Declares a subroutine for a module's `subroutines` map. */
  static sub(params: Record<string, CuratorParamSpec> | undefined, body: CuratorAstNode | { build: () => CuratorAstNode }, returns?: string): CuratorSubroutine {
    const resolved = typeof (body as any).build === 'function' ? (body as any).build() : body;
    return { params, body: resolved, ...(returns ? { returns } : {}) };
  }

  /** Invokes a subroutine by ref ('script', 'script#sub', '#sub'). Default mode: 'child'. */
  static call(ref: string, args?: Record<string, any>, options: { as?: string; mode?: 'child' | 'inline' } = {}): CuratorCallNode {
    return { type: 'Curator_Call', ref, ...(args ? { args } : {}), ...options };
  }

  /** Declares that `handler` runs whenever `eventName` is emitted. */
  static subscribe(eventName: string, handler: string, options: { as?: string; when?: string; scope?: 'conversation' | 'project' } = {}): CuratorSubscribeNode {
    return { type: 'Curator_Subscribe', eventName, handler, ...options };
  }

  /** Removes dynamic subscriptions for `eventName` (optionally only for `handler`). */
  static unsubscribe(eventName: string, handler?: string): CuratorUnsubscribeNode {
    return { type: 'Curator_Unsubscribe', eventName, ...(handler ? { handler } : {}) };
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
