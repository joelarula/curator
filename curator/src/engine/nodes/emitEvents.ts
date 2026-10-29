import type { NodeHandler } from './NodeHandler.js';
import type { CuratorEmitEventsNode } from '../CuratorAst.js';
import type { CuratorEventEmitResult, CuratorEventSpec, CuratorStructuredResponse } from '../CuratorContracts.js';
import { logger } from '../../utils/logger.js';

/**
 * Curator_EmitEvents: emits a list computed at run time (`[{ name, payload?, targetAgentId? }]`), in order.
 * The payloads are data (e.g. reducer output): they are not evaluated as expressions.
 */
export const emitEventsNode: NodeHandler<CuratorEmitEventsNode> = {
  type: 'Curator_EmitEvents',
  async run(node, req, ctx) {
    const list = await ctx.evaluateExpression(node.events, req);
    if (list != null && !Array.isArray(list)) {
      throw new Error(`Curator_EmitEvents: '${node.events}' must evaluate to an array of { name, payload }`);
    }
    const events: CuratorEventEmitResult[] = [];
    for (const spec of (list || []) as CuratorEventSpec[]) {
      if (!spec || typeof spec.name !== 'string' || !spec.name) {
        throw new Error(`Curator_EmitEvents: every event needs a name (got ${JSON.stringify(spec)})`);
      }
      const payload = spec.payload && typeof spec.payload === 'object' && !Array.isArray(spec.payload)
        ? { ...spec.payload }
        : spec.payload;
      ctx.events.addOrigin(payload, req);
      ctx.emit(spec.name, payload);
      events.push(await ctx.events.dispatch(spec.name, payload, req, spec.targetAgentId as any));
    }
    const record: CuratorStructuredResponse = { type: 'EVENTS_EMITTED', ok: true, events };
    await ctx.saveResponse(req, JSON.stringify(record));
    await ctx.completeRequest(req.id, 'COMPLETED');
  },
};
