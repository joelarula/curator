import type { NodeContext, NodeHandler } from './NodeHandler.js';
import type { CuratorAstNode, CuratorGraphNode, CuratorGraphTransition } from '../CuratorAst.js';
import { logger } from '../../utils/logger.js';

export const graphNode: NodeHandler<CuratorGraphNode> = {
  type: 'Curator_Graph',
  async run(ast, req, ctx) {
    // nextNode is only held across an onExit hook; drop it so it never leaks into later phases.
    const { nextNode: pendingNext, ...context } = req.context || {};
    let waitingFor = context.waitingFor;
    let stateData = context.stateData || context.input || '';
    let nextNode: string | undefined;
    let activeNode: string = context.activeNode
      || (Array.isArray(ast.startNode) ? await resolveGraphTransition(ast.startNode, stateData, req, ctx) : ast.startNode);

    // Spawn one child (state body, router or hook) and park the graph until it completes.
    // Children see the graph's context (minus its bookkeeping) with the current state output as input.
    const { activeNode: _a, stateData: _s, waitingFor: _w, ...childContext } = ctx.parseContext(context);
    const awaitChild = async (child: CuratorAstNode, phase: string, extra: Record<string, any> = {}) => {
      await ctx.createRequest({
        data: {
          userId: req.userId,
          conversationId: req.conversationId,
          projectId: req.projectId,
          agentId: req.agentId,
          scriptId: req.scriptId,
          status: 'NEW',
          pendingDependencies: 0,
          notifyId: req.id,
          ast: child as any,
          context: { ...childContext, input: stateData }
        }
      });

      await ctx.prisma.request.update({
        where: { id: req.id },
        data: {
          pendingDependencies: 1,
          context: { ...context, activeNode, stateData, waitingFor: phase, ...extra },
          status: 'NEW',
          lockedBy: null,
          lockedAt: null
        }
      });
    };

    // With a stateKey the active state is mirrored into state and every transition is announced
    // as `state:<stateKey>` { from, to } (Bevy StateTransitionEvent), so systems can react to it.
    const enterState = async (from: string | null, to: string) => {
      if (!ast.stateKey) return;
      await ctx.writeState(req.conversationId, ctx.parseContext(req.context).__scope, { [ast.stateKey]: to });
      await ctx.events.dispatch(`state:${ast.stateKey}`, { from, to }, req);
    };

    // Phase 1: Wake up and figure out the next state
    if (waitingFor === 'NODE') {
      // A state node just finished. Save its output to stateData.
      stateData = req.context?.input || stateData;
      logger.debug(`[CuratorRequestProcessor] Graph Node ${req.id} finished state '${activeNode}'.`);

      const edge = ast.edges ? ast.edges[activeNode] : null;
      if (edge && typeof edge === 'object' && !Array.isArray(edge)) {
        logger.debug(`[CuratorRequestProcessor] Graph Node ${req.id} spawning conditional router for '${activeNode}'.`);
        await awaitChild(edge, 'ROUTER');
        return;
      }
      nextNode = await resolveGraphTransition(edge, stateData, req, ctx);
      logger.debug(`[CuratorRequestProcessor] Graph Node ${req.id} transitioning '${activeNode}' -> '${nextNode}'.`);
    } else if (waitingFor === 'ROUTER') {
      // A conditional router just finished evaluating the state.
      // Its output was merged into Conversation.state. If it returned a raw string,
      // completeRequest merged it into the 'output' property.
      try {
        const parsed = JSON.parse(req.context?.input || '{}');
        nextNode = (parsed.output || req.context?.input)?.trim() || '';
      } catch(e) {
        nextNode = req.context?.input?.trim() || '';
      }
      logger.debug(`[CuratorRequestProcessor] Graph Node ${req.id} routed to '${nextNode}'.`);
    } else if (waitingFor === 'EXIT') {
      nextNode = pendingNext;
    }

    // Phase 2: Leave the current state (OnExit), then move to the next one
    if (nextNode !== undefined) {
      const exitHook = waitingFor !== 'EXIT' ? ast.onExit?.[activeNode] : undefined;
      if (exitHook) {
        logger.debug(`[CuratorRequestProcessor] Graph Node ${req.id} running onExit for '${activeNode}'.`);
        await awaitChild(exitHook, 'EXIT', { nextNode });
        return;
      }
      const from = activeNode;
      activeNode = nextNode;
      waitingFor = null;
      await enterState(from, activeNode);
    }

    // Phase 3: Enter the active state (OnEnter), then execute its body
    if (activeNode === '__end__') {
      logger.debug(`[CuratorRequestProcessor] Graph Node ${req.id} reached terminal state.`);
      await ctx.saveResponse(req, stateData);
      await ctx.completeRequest(req.id, 'COMPLETED');
      return;
    }

    const targetAst = ast.nodes[activeNode];
    if (!targetAst) {
      logger.warn(`[CuratorRequestProcessor] Graph Node ${req.id} tried to enter unknown state '${activeNode}'.`);
      await ctx.saveResponse(req, `[Graph Failed: Unknown state '${activeNode}']\n${stateData}`);
      await ctx.completeRequest(req.id, 'COMPLETED');
      return;
    }

    if (waitingFor !== 'ENTER') {
      // The start state is entered without a transition, so mirror it here.
      if (!waitingFor && nextNode === undefined) await enterState(null, activeNode);
      const enterHook = ast.onEnter?.[activeNode];
      if (enterHook) {
        logger.debug(`[CuratorRequestProcessor] Graph Node ${req.id} running onEnter for '${activeNode}'.`);
        await awaitChild(enterHook, 'ENTER');
        return;
      }
    }

    logger.debug(`[CuratorRequestProcessor] Graph Node ${req.id} executing state '${activeNode}'.`);
    await awaitChild({ ...targetAst } as any, 'NODE');
  },
};

/** Resolves a static or guarded graph edge; guards see the state's output as `output`/`input`. */
async function resolveGraphTransition(edge: string | CuratorGraphTransition[] | null | undefined, stateData: any, req: any, ctx: NodeContext): Promise<string> {
  if (!edge) return '__end__';
  if (typeof edge === 'string') return edge;
  if (!Array.isArray(edge)) return '__end__';

  let output: any = stateData;
  if (typeof stateData === 'string') {
    try {
      const parsed = JSON.parse(stateData);
      if (parsed && typeof parsed === 'object') output = parsed;
    } catch (_) {}
  }
  for (const transition of edge) {
    if (!transition.when) return transition.to;
    const guardReq = { ...req, context: { ...ctx.parseContext(req.context), input: output, output } };
    if (await ctx.evaluateExpression(transition.when, guardReq)) return transition.to;
  }
  return '__end__';
}
