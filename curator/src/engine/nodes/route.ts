import type { NodeHandler } from './NodeHandler.js';
import type { CuratorRouteNode } from '../CuratorAst.js';
import { logger } from '../../utils/logger.js';

export const routeNode: NodeHandler<CuratorRouteNode> = {
  type: 'Curator_Route',
  async run(ast, req, ctx) {
    const context = req.context || {};
    
    // Phase 1: Evaluate the router logic
    if (!context.routeDecided) {
      logger.debug(`[CuratorRequestProcessor] Route Node (Phase 1) for request ${req.id} - inserting router node.`);
      await ctx.spawnChildAndParkParent(req, { ast: { ...ast.router } }, { routeDecided: true }, 'NEW');
      return;
    }

    // Phase 2: Execute the sub-agent based on the router's decision
    logger.debug(`[CuratorRequestProcessor] Route Node (Phase 2) for request ${req.id} - making decision.`);
    
    let decision = String(context.input || '').trim();
    try {
      const parsed = JSON.parse(decision);
      if (parsed && typeof parsed === 'object') {
        decision = parsed.route || parsed.output || parsed.text || decision;
      }
    } catch (e) {}

    logger.debug(`[CuratorRequestProcessor] Route decision: '${decision}'`);

    const targetAst = ast.subAgents[decision] || (ast.defaultRoute ? ast.subAgents[ast.defaultRoute] : null);

    if (!targetAst) {
      logger.warn(`[CuratorRequestProcessor] Route Node ${req.id} decision '${decision}' matched no subAgent and no defaultRoute.`);
      await ctx.saveResponse(req, `[Route Failed: No Match for '${decision}']`);
      await ctx.completeRequest(req.id, 'COMPLETED');
      return;
    }

    // Pass the input along to the target AST if it needs it
    let nodeAst = { ...targetAst } as any;

    // Spawn the subAgent and connect it directly to the parent's notifyId
    await ctx.createRequest({
      data: {
        userId: req.userId,
        conversationId: req.conversationId,
        status: 'NEW',
        pendingDependencies: 0,
        notifyId: req.notifyId,
        ast: nodeAst,
        context: { input: req.context?.input }
      }
    });

    await ctx.saveResponse(req, `[Route Decided: ${decision}]`);
    // The routed child assumes responsibility for notifying our parent.
    await ctx.completeRequest(req.id, 'COMPLETED', true);
  },
};
