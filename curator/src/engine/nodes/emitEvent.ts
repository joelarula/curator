import type { NodeHandler } from './NodeHandler.js';
import type { CuratorStructuredResponse } from '../CuratorContracts.js';
import { logger } from '../../utils/logger.js';

export const emitEventNode: NodeHandler<any> = {
  type: 'Curator_EmitEvent',
  async run(node, req, ctx) {
    logger.debug(`[CuratorRequestProcessor] Emitting event: ${node.eventName}`);
    
    // Evaluate dynamic payload
    let payload = node.payload ?? req.context?.input;
    if (ctx.isDynamicExpr(node.payload)) {
      payload = await ctx.evaluateExpression(node.payload, req);
    } else if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      payload = await ctx.evaluateArgs(payload, req);
    }
    ctx.events.addOrigin(payload, req);
    ctx.emit(node.eventName, payload);

    // Evaluate dynamic targetAgentId
    let targetAgentId = node.targetAgentId;
    if (typeof targetAgentId === 'string' && ctx.isDynamicExpr(targetAgentId)) {
      targetAgentId = await ctx.evaluateExpression(targetAgentId, req);
    }

    const result = await ctx.events.dispatch(node.eventName, payload, req, targetAgentId);
    const record: CuratorStructuredResponse = { type: 'EVENT_EMITTED', ok: true, event: result };
    await ctx.saveResponse(req, JSON.stringify(record));
    await ctx.completeRequest(req.id, 'COMPLETED');
  },
};
