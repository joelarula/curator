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
  CuratorParallelNode
} from './CuratorAst.js';

export class CuratorBuilder {
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
  static emitEvent(eventName: string, payload?: any, targetAgentId?: number): CuratorEmitEventNode {
    return { type: 'Curator_EmitEvent', eventName, payload, targetAgentId };
  }

  /**
   * Runs the provided nodes sequentially.
   */
  static seq(name: string, ...nodes: CuratorAstNode[]): CuratorSequentialNode {
    return { type: 'Curator_Sequential', name, subAgents: nodes };
  }

  /**
   * Runs the provided nodes in parallel.
   */
  static parallel(name: string, ...nodes: CuratorAstNode[]): CuratorParallelNode {
    return { type: 'Curator_Parallel', name, subAgents: nodes };
  }

  /**
   * Merge state with the provided record.
   */
  static setState(state: Record<string, any>): CuratorSetStateNode {
    return { type: 'Curator_SetState', state };
  }

  /**
   * Wait for human input from the UI.
   */
  static humanInput(prompt: string, inputType: 'text' | 'choices' | 'file' = 'text'): CuratorHumanInputNode {
    return { type: 'Curator_HumanInput', prompt, inputType };
  }

  /**
   * Call an LLM agent with tools.
   */
  static agent(options: Omit<CuratorAgentNode, 'type'>): CuratorAgentNode {
    return { type: 'Curator_Agent', ...options };
  }
}
