import type { NodeHandler } from './NodeHandler.js';
import { logger } from '../../utils/logger.js';

export const humanInputNode: NodeHandler<any> = {
  type: 'Curator_HumanInput',
  async run(ast, req, ctx) {
    if (req.context?.__humanInputReceived__) {
      delete req.context.__humanInputReceived__;
      const asKey = ast.as || req.context.choiceAs || req.context.as;
      const inputVal = asKey ? req.context[asKey] : req.context.input;
      const responseStr = typeof inputVal === 'string' ? inputVal : JSON.stringify(inputVal || {});
      await ctx.saveResponse(req, responseStr);
      await ctx.completeRequest(req.id, 'COMPLETED');
      return;
    }

    let prompt = ast.prompt;
    if (ctx.isDynamicExpr(prompt)) {
      prompt = await ctx.evaluateExpression(prompt, req);
    } else if (typeof prompt === 'string') {
      prompt = (await ctx.interpolateTemplate(prompt, req)) || prompt;
    }

    // Evaluate dynamic choices expression if provided as string or closure
    let choices = ast.choices;
    if (typeof choices === 'string' && (choices.startsWith('$') || choices.startsWith('(') || choices.startsWith('context.') || choices.startsWith('state.'))) {
      choices = await ctx.evaluateExpression(choices, req);
    } else if (typeof choices === 'function') {
      choices = choices(req.context);
    }

    // Normalize choices array: convert strings to rich choice objects if needed
    if (Array.isArray(choices)) {
      choices = choices.map((c: any) => {
        if (typeof c === 'string') {
          return { id: c, label: c, value: c };
        }
        return c;
      });

      // Conditional choices: offer a choice only while its `when` expression holds
      const offered: any[] = [];
      for (const c of choices) {
        if (c && typeof c.when === 'string') {
          const { when, ...rest } = c;
          if (await ctx.evaluateExpression(when, req)) offered.push(rest);
        } else {
          offered.push(c);
        }
      }
      choices = offered;
    }

    logger.debug(`[CuratorRequestProcessor] Request ${req.id} presenting prompt/choices (${choices?.length ?? 0} choices) to ${ast.targetUserId ? `user ${ast.targetUserId}` : 'any user'} (${ast.inputType || 'choices'}).`);

    const choicePayload = {
      requestId: req.id,
      prompt,
      inputType: ast.inputType || 'choices',
      choices: choices || [],
      targetUserId: ast.targetUserId ?? null,
      as: ast.as,
      blocking: ast.blocking !== false,
      timeoutSeconds: ast.timeoutSeconds,
      conversationId: req.conversationId,
    };

    // Store choices and metadata in request context
    const updatedContext = {
      ...(req.context || {}),
      targetUserId: ast.targetUserId ?? null,
      activeChoices: choices || [],
      choicePrompt: prompt,
      choiceAs: ast.as,
      as: ast.as || (req.context as any)?.as,
      waitEvent: 'curator:choice',
    };

    // Emit real-time choice event to pub/sub channels and client shells
    ctx.emit('curator:human_input', choicePayload);
    ctx.emit('curator:choices', choicePayload);

    // If non-blocking, record response immediately and complete
    if (ast.blocking === false) {
      await ctx.saveResponse(req, JSON.stringify({ prompt, choices }));
      await ctx.completeRequest(req.id, 'COMPLETED');
      return;
    }

    // Blocking: suspend request awaiting human response or event
    delete (updatedContext as any).waitDeadline;
    if (ast.timeoutSeconds > 0) {
      (updatedContext as any).waitDeadline = new Date(ctx.now() + ast.timeoutSeconds * 1000).toISOString();
    }
    await ctx.prisma.request.update({
      where: { id: req.id },
      data: { status: 'WAITING_FOR_USER', context: updatedContext }
    });
  },
};
