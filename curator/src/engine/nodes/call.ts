import type { NodeContext, NodeHandler } from './NodeHandler.js';
import type { CuratorAstNode, CuratorCallNode, CuratorParamSpec } from '../CuratorAst.js';
import { resolveRef, getScriptVersionAst, entryAstPath, expandInlineCalls } from '../ScriptRegistry.js';

/**
 * Runs a subroutine call: phase 1 parks the caller and spawns the isolated callee; phase 2 (callPending)
 * binds the callee's result. Shared by Curator_Call, Curator_AgentRef and Curator_ActorRef.
 */
/**
 * Curator_Call (child mode): the callee runs as its own Request (parentId/notifyId = caller) with an
 * isolated context `{ params }`. Phase 2 writes the callee's result to `as`.
 * Inline calls never reach here: they are macro-expanded when the node is resolved.
 */
export async function runCall(ast: CuratorCallNode, req: any, ctx: NodeContext, opts: { agentId?: string; params?: Record<string, any> } = {}) {
  const callContext = (typeof req.context === 'string' ? JSON.parse(req.context) : req.context) || {};

  if (callContext.callPending) {
    // Phase 2: the callee chain finished; the latest Response of a request that notified us is the result.
    const last = await ctx.prisma.request.findFirst({
      where: { notifyId: req.id, status: 'COMPLETED', responses: { some: {} } },
      orderBy: { id: 'desc' },
      include: { responses: { orderBy: { createdAt: 'desc' }, take: 1 } }
    });
    let result: any = last?.responses?.[0]?.content ?? null;
    if (typeof result === 'string') {
      try { result = JSON.parse(result); } catch { /* plain text result */ }
    }
    if (callContext.callReturns && last) {
      const lastCtx = typeof last.context === 'string' ? JSON.parse(last.context) : last.context;
      result = await ctx.evaluateExpression(callContext.callReturns, { conversationId: last.conversationId, context: lastCtx || {} });
    }
    const as = ast.as ?? callContext.callAs;
    const { callPending: _p, callReturns: _r, callAs: _a, ...rest } = callContext;
    const newContext: any = { ...rest };
    if (as) {
      newContext[as] = result;
      await ctx.writeState(req.conversationId, null, { [as]: result });
      const conv = await ctx.prisma.conversation.findUnique({ where: { id: req.conversationId } });
      newContext.state = ctx.getConversationState(conv);
    }
    await ctx.prisma.request.update({ where: { id: req.id }, data: { context: newContext } });
    await ctx.saveResponse(req, typeof result === 'string' ? result : JSON.stringify(result ?? null));
    await ctx.completeRequest(req.id, 'COMPLETED');
    return;
  }

  const depth = (callContext.callDepth ?? 0) + 1;
  if (depth > ctx.calls.maxDepth) return ctx.failRequest(req, `Call depth ${depth} exceeds maxCallDepth ${ctx.calls.maxDepth} at '${ast.ref}'`);

  let target: Awaited<ReturnType<typeof resolveRef>>;
  let params: Record<string, any>;
  let astPath: string;
  let rootAst: CuratorAstNode;
  try {
    target = await resolveRef(ctx.prisma, ast.ref, { scriptId: req.scriptId, scriptVersion: req.scriptVersion });
    params = await bindParams(target.params, ast.args, req, ctx, opts.params);
    rootAst = (await getScriptVersionAst(ctx.prisma, target.scriptId, target.version)).ast;
    astPath = entryAstPath(rootAst, target.entry);
  } catch (err: any) {
    return ctx.failRequest(req, `Call '${ast.ref}': ${err.message}`);
  }

  // Park the caller first so a fast callee can never complete before we are WAITING.
  await ctx.prisma.request.update({
    where: { id: req.id },
    data: {
      status: 'WAITING', pendingDependencies: 1, lockedBy: null, lockedAt: null,
      context: { ...callContext, callPending: true, callReturns: target.returns ?? null, callAs: ast.as ?? null }
    }
  });

  await ctx.createRequest({
    data: {
      userId: req.userId,
      projectId: req.projectId,
      conversationId: req.conversationId,
      parentId: req.id,
      notifyId: req.id,
      scriptId: target.scriptId,
      scriptVersion: target.version,
      agentId: opts.agentId ?? req.agentId ?? undefined,
      status: 'NEW',
      pendingDependencies: 0,
      ast: ctx.calls.astStorage === 'snapshot'
        ? (rootAst.type === 'Curator_Module' ? expandInlineCalls(target.node, rootAst as any) : target.node)
        : undefined,
      // Isolated: the callee sees only its params (plus conversation state), never the caller's context.
      context: { params, input: params.input, origin: 'AST', ref: ast.ref, astPath, callDepth: depth }
    }
  });
  // No Response while parked: the poller treats a WAITING Request with a Response as answered.
  // Lineage is the child's parentId; the result Response is written in phase 2.
}

/** Binds call args to declared params (defaults, required). Undeclared args pass through. */
async function bindParams(spec: Record<string, CuratorParamSpec> | undefined, args: Record<string, any> | undefined, req: any, ctx: NodeContext, preset: Record<string, any> = {}) {
  const params = { ...(await ctx.evaluateArgs(args, req)), ...preset };
  for (const [name, p] of Object.entries(spec || {})) {
    if (params[name] === undefined && p?.default !== undefined) params[name] = p.default;
    if (params[name] === undefined && p?.required) throw new Error(`Missing required param '${name}'`);
  }
  return params;
}

export const callNode: NodeHandler<CuratorCallNode> = {
  type: 'Curator_Call',
  run: (ast, req, ctx) => runCall(ast, req, ctx),
};
