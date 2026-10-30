import type { NodeHandler } from './NodeHandler.js';
import type { CuratorToolNode } from '../CuratorAst.js';
import type { CuratorStructuredResponse } from '../CuratorContracts.js';
import { SecretService } from '../../services/SecretService.js';
import { logger } from '../../utils/logger.js';

export const toolNode: NodeHandler<CuratorToolNode> = {
  type: 'Curator_Tool',
  async run(ast, req, ctx) {
    logger.debug(`[CuratorRequestProcessor] Executing Tool '${ast.toolName}' for request ${req.id}`);
    const tool = ctx.tools.get(ast.toolName, req);
    if (!tool) throw new Error(`Tool ${ast.toolName} not found in dynamic registry.`);
    // Access, approval and audit use the resolved key (aliases like `mcp.crm.lookup` resolve per project);
    // context output stays under the name the workflow used.
    const toolKey: string = tool.name || ast.toolName;

    let toolArgs = ast.args || { url: req.context?.input || '' };
    // Direct calls (REPL/CLI/API) carry literal args: a value like "$100" must not be evaluated.
    const literalArgs = req.context?.literalArgs === true;
    const inflight = ctx.tools.inflight(req.id);
    
    // Evaluate string expressions in toolArgs — supports both {{expr}} templates and (fn)(context) patterns
    let evaluatedArgs: Record<string, any> = {};
    if (ctx.isDynamicExpr(toolArgs)) {
      const resolved = await ctx.evaluateExpression(toolArgs, req);
      evaluatedArgs = (resolved && typeof resolved === 'object' && !Array.isArray(resolved)) ? resolved : { input: resolved };
    } else if (toolArgs && typeof toolArgs === 'object') {
      evaluatedArgs = await ctx.evaluateArgs(toolArgs, req, literalArgs);
    }

    // RBAC & Tool confirmation gate
    const accessCheck = await ctx.tools.checkAccess(req, toolKey, tool);
    if (!accessCheck.allowed) {
      if (accessCheck.requiresConfirmation) {
        logger.debug(`[CuratorRequestProcessor] Request ${req.id} pausing on WAITING_FOR_USER for tool '${toolKey}'.`);
        const ttlMs = ast.approvalTtlMs ?? (tool as any).approvalTtlMs ?? ctx.tools.approvalTtlMs;
        const expiresAt = ttlMs > 0 ? new Date(ctx.now() + ttlMs).toISOString() : undefined;
        await ctx.prisma.request.update({
          where: { id: req.id },
          data: {
            status: 'WAITING_FOR_USER',
            lockedBy: null,
            lockedAt: null,
            context: {
              ...req.context,
              pendingToolCall: {
                name: toolKey,
                args: evaluatedArgs,
                as: ast.as,
                expiresAt,
                onExpired: ast.onApprovalExpired ?? 'fail'
              },
              reason: accessCheck.reason
            }
          }
        });
        // Audit record only: the poller never treats this Response as the approval (see pendingToolCall guard).
        await ctx.saveResponse(req, JSON.stringify({
          type: 'APPROVAL_REQUIRED', ok: false, tool: toolKey, reason: accessCheck.reason, expiresAt
        } satisfies CuratorStructuredResponse));
        return;
      } else {
        await ctx.saveResponse(req, JSON.stringify({
          type: 'TOOL_BLOCKED', ok: false, tool: toolKey, reason: accessCheck.reason, roles: accessCheck.roles
        } satisfies CuratorStructuredResponse));
        await ctx.completeRequest(req.id, 'FAILED');
        return;
      }
    }

    let result = '';
    let rawOutput: any = undefined;
    let hydratedSecrets = new Map<string, string>();
    try {
      // Late-binding secret hydration: replaces $secret:XYZ, {{secrets.XYZ}}, etc.
      const hydration = await SecretService.hydrate(evaluatedArgs, {
        projectId: req.projectId,
        userId: req.userId,
        agentId: req.agentId,
        prisma: ctx.prisma
      });
      hydratedSecrets = hydration.secretsMap;

      rawOutput = await tool.runAsync({
        args: { ...hydration.hydrated, ...(inflight?.runtimeArgs || {}) },
        toolContext: {
          ...ctx.tools.contextExtras,
          conversationId: req.conversationId,
          userId: req.userId,
          agentId: req.agentId,
          projectId: req.projectId,
          prisma: ctx.prisma,
          context: req.context,
          state: req.context?.state,
          service: ctx.service,
          tryService: ctx.tryService,
          ...(inflight?.runtimeContext || {})
        }
      });
      if (inflight) inflight.raw = rawOutput;
      result = typeof rawOutput === 'string' ? rawOutput : JSON.stringify(rawOutput);

      if (rawOutput && typeof rawOutput === 'object' && (rawOutput as any).event && inflight?.broadcastToolEvents !== false) {
        const evt = (rawOutput as any).event;
        const eventName = typeof evt === 'string' ? evt : evt.name;
        const payload = typeof evt === 'object' && evt.payload !== undefined ? evt.payload : rawOutput;
        ctx.emit(eventName, payload);
      }
    } catch(e: any) {
      if (inflight) inflight.error = e;
      result = `[Tool Error] ${e.message}`;
    }

    // Egress scrubbing: mask any reflected secrets before writing to DB responses or context
    result = SecretService.mask(result, hydratedSecrets);

    // Store tool output in req.context under a short name derived from the tool name.
    // This is best-effort: if the DB update fails (e.g. P2028), we still proceed with
    // saveResponse + completeRequest using the in-memory context.
    if (rawOutput !== undefined) {
      const sanitizedOutput = typeof rawOutput === 'string'
        ? SecretService.mask(rawOutput, hydratedSecrets)
        : SecretService.sanitizeContext(rawOutput, hydratedSecrets);
      const updatedContext = { ...(req.context || {}) };
      // An approved wait is consumed once the tool has run.
      delete updatedContext.pendingToolCall;
      updatedContext[ast.toolName] = sanitizedOutput;

      // Allow AST node (`as` / `outputKey`) or tool definition (`outputKey` / `contextKey`) to define an alias
      const toolAlias = (ast as any).as || (ast as any).outputKey || (tool as any)?.outputKey || (tool as any)?.contextKey;
      if (toolAlias && typeof toolAlias === 'string') {
        updatedContext[toolAlias] = sanitizedOutput;
      }

      if ((ast as any).spread !== false && sanitizedOutput && typeof sanitizedOutput === 'object' && !Array.isArray(sanitizedOutput)) {
        Object.assign(updatedContext, sanitizedOutput);
      }
      req.context = updatedContext;
      try {
        await ctx.prisma.request.update({
          where: { id: req.id },
          data: { context: updatedContext }
        });
      } catch (ctxErr: any) {
        // Non-fatal: context update failed. In-memory context is still correct for
        // completeRequest → notifyId propagation within this same processing cycle.
        logger.warn(`[CuratorRequestProcessor] Context update skipped for req ${req.id}: ${ctxErr.message}`);
      }
    }

    // Consume ONETIME approval if used
    if (accessCheck.approvalScope === 'ONETIME' && req.context) {
      delete req.context.__humanApproved__;
      if (Array.isArray(req.context.__approvedTools__)) {
        req.context.__approvedTools__ = req.context.__approvedTools__.filter((t: string) => t !== toolKey);
      }
    }

    // The Response below is the audit record of this tool execution.
    await ctx.saveResponse(req, result);
    await ctx.completeRequest(req.id, 'COMPLETED');
  },
};
