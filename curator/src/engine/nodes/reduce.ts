import type { NodeHandler } from './NodeHandler.js';
import type { CuratorReduceNode } from '../CuratorAst.js';
import { logger } from '../../utils/logger.js';

/**
 * Curator_Reduce: runs a plugin's pure reducer on the evaluated args. No RBAC, approval or tool events;
 * the output is bound like tool output (context here, conversation state on completion).
 */
export const reduceNode: NodeHandler<CuratorReduceNode> = {
  type: 'Curator_Reduce',
  async run(ast, req, ctx) {
    const reducer = ctx.tools.reducer(ast.reducer);
    if (!reducer) throw new Error(`Reducer ${ast.reducer} not found in dynamic registry.`);

    let args: Record<string, any> = {};
    if (ctx.isDynamicExpr(ast.args)) {
      const resolved = await ctx.evaluateExpression(ast.args as string, req);
      args = (resolved && typeof resolved === 'object' && !Array.isArray(resolved)) ? resolved : { input: resolved };
    } else if (ast.args && typeof ast.args === 'object') {
      args = await ctx.evaluateArgs(ast.args, req);
    }

    const output = reducer(args);
    if (!output || typeof output !== 'object' || Array.isArray(output)) {
      throw new Error(`Reducer ${ast.reducer} must return an object`);
    }

    const updatedContext = { ...(req.context || {}) };
    if (ast.as) updatedContext[ast.as] = output;
    if (ast.spread !== false) Object.assign(updatedContext, output);
    req.context = updatedContext;
    await ctx.prisma.request.update({ where: { id: req.id }, data: { context: updatedContext } });

    await ctx.saveResponse(req, JSON.stringify(output));
    await ctx.completeRequest(req.id, 'COMPLETED');
  },
};
