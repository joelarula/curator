import * as vm from 'node:vm';
import AjvModule from 'ajv';
import type { NodeContext, NodeHandler } from './NodeHandler.js';
import type { CuratorAgentNode, CuratorInlineTool } from '../CuratorAst.js';
import type { CuratorStructuredResponse } from '../CuratorContracts.js';
import type { LlmMessage, LlmToolDefinition, LlmRequest } from '../llm/ILlmProvider.js';
import { buildContext } from '../llm/ConversationFold.js';
import { toCamelCase } from '../builder/CuratorCoreBuilder.js';
import { SecretService } from '../../services/SecretService.js';
import { logger } from '../../utils/logger.js';

const Ajv = (AjvModule as any).default || AjvModule;

export const agentNode: NodeHandler<CuratorAgentNode> = {
  type: 'Curator_Agent',
  async run(ast, req, ctx) {
    if (ast.input_schema) {
      const ajv = new Ajv();
      const validate = ajv.compile(ast.input_schema);
      
      let inputToValidate = req.context?.input;
      if (typeof inputToValidate === 'string') {
        try {
          inputToValidate = JSON.parse(inputToValidate);
        } catch (e) {
          // Fall through
        }
      }
      
      if (!validate(inputToValidate)) {
        await ctx.saveResponse(req, `[Agent Error] input_schema validation failed: ${ajv.errorsText(validate.errors)}`);
        await ctx.completeRequest(req.id, 'COMPLETED');
        return;
      }
    }

    let prompt = await ctx.interpolateTemplate(ast.prompt, req) || 'Hello';
    let instruction = await ctx.interpolateTemplate(ast.instruction, req);

    if (ast.output_schema) {
      const schemaStr = JSON.stringify(ast.output_schema, null, 2);
      const schemaPrompt = `\n\nYou must respond with a JSON object conforming strictly to the following schema:\n${schemaStr}`;
      if (instruction) instruction += schemaPrompt;
      else instruction = schemaPrompt;
    }

    // Model and provider may come from configuration, e.g. `$config.poker.models.chatter`
    const resolveSetting = async (v: string | undefined): Promise<string | undefined> => {
      if (!ctx.isDynamicExpr(v)) return v;
      const resolved = await ctx.evaluateExpression(v, req);
      return typeof resolved === 'string' && resolved ? resolved : undefined;
    };
    const provider = ctx.llm.provider(await resolveSetting(ast.provider), ast.baseUrl);
    const model = await resolveSetting(ast.model);

    // `tools` is either a fixed list or an expression (e.g. "$state.options") re-evaluated on every agent turn,
    // so the set of choices offered to the model can change with the conversation state.
    let offeredTools: (string | CuratorInlineTool)[] = [];
    if (ctx.isDynamicExpr(ast.tools)) {
      const resolved = await ctx.evaluateExpression(ast.tools, req);
      if (resolved != null && !Array.isArray(resolved)) throw new Error(`Agent '${ast.agentName}': tools expression must evaluate to an array`);
      offeredTools = resolved ?? [];
    } else if (Array.isArray(ast.tools)) {
      offeredTools = ast.tools;
    }
    const hasTools = offeredTools.length > 0;

    logger.debug(`[CuratorRequestProcessor] Executing Agent '${ast.agentName}' for request ${req.id} using provider '${provider.providerName}' [mode: ${hasTools ? 'agentic' : 'direct'}]`);

    // Build tool definitions if tools specified. Names may be keys, project aliases (`mcp.crm.lookup`)
    // or patterns (`mcp.crm.*`), resolved in the request's project. The model sees provider-safe names;
    // access checks and approvals use the resolved tool key.
    const toolDefs: LlmToolDefinition[] = [];
    const offeredByLlmName = new Map<string, any>();
    /** Offered name and tool key per LLM name: what tool output rules match against. */
    const offeredNamesByLlmName = new Map<string, string[]>();
    const offeredKeys = new Set<string>();
    if (hasTools) {
      for (const toolOrName of offeredTools) {
        const entries =
          typeof toolOrName !== 'string'
            ? []
            : toolOrName.includes('*')
              ? ctx.tools.list?.(toolOrName, req) ?? []
              : [ctx.tools.get(toolOrName, req)].filter(Boolean).map((tool) => ({ name: toolOrName, tool }));
        for (const { name, tool } of entries) {
          const key: string = tool.name || name;
          if (offeredKeys.has(key)) continue;
          // Never offer a tool the actor may not run (role / project); the call-time check stays as the backstop.
          if (!(await ctx.tools.checkRoleAccess(req, key, tool)).allowed) continue;
          offeredKeys.add(key);
          const llmName = llmToolName(name, offeredByLlmName);
          offeredByLlmName.set(llmName, tool);
          offeredNamesByLlmName.set(llmName, [name, key]);
          toolDefs.push({
            name: llmName,
            description: tool.description,
            parameters: tool.parameters as Record<string, unknown>
          });
        }
        if (typeof toolOrName !== 'string') {
          toolDefs.push({
            name: toolOrName.name,
            description: toolOrName.description,
            parameters: toolOrName.parameters
          });
        }
      }
    }

    // Load Granular Message History from database
    let history: readonly LlmMessage[];
    if (ast.history_from === 'conversation' && ast.include_contents !== 'none') {
      const viewer = String(ast.agentName ?? req.agentId ?? 'agent');
      const built = await buildContext(ctx.prisma, req.conversationId, viewer, {
        eventNames: ast.history_events ?? [],
        excludeRequestId: req.id,
      });
      const limit = (ast as any).history_limit;
      history = limit > 0 ? built.messages.slice(-limit) : built.messages;
    } else {
      const profile = (await resolveSetting(ast.history_profile)) ?? 'full';
      if (!HISTORY_PROFILES.has(profile)) throw new Error(`Agent '${ast.agentName}': unknown history_profile '${profile}' (full | answers)`);
      history = await loadConversationHistory(req, ast.include_contents, ctx, profile as HistoryProfile, new Set(toolDefs.map((t) => t.name)));
    }
    const messages: LlmMessage[] = [...history];
    messages.push({ role: 'user', content: prompt });

    // Tool results: the `llm` form goes to the model (and is stored); a `display` form, when one is configured,
    // is broadcast for people (`agent:tool_result`). Both are masked like the raw output.
    const formatToolResult = (res: unknown, names: string[], tool: any, mask: (text: string) => string): string => {
      const opts = { names, tool, agentRules: ast.tool_output, agentName: ast.agentName };
      const display = ctx.tools.output.formatToolResult(res, { ...opts, target: 'display' });
      if (display !== undefined) {
        ctx.emit('agent:tool_result', { requestId: req.id, conversationId: req.conversationId, agentName: ast.agentName, tool: names[0], display: mask(display) });
      }
      const llm = ctx.tools.output.formatToolResult(res, { ...opts, target: 'llm' });
      return mask(llm ?? (typeof res === 'string' ? res : JSON.stringify(res)));
    };

    // Multi-Turn LLM Agentic Loop (State-Machine Transitions)
    let iterations = 0;
    const MAX_ITERATIONS = 10;
    let finalOutput = '';

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const llmReq: LlmRequest = {
        model,
        systemPrompt: instruction,
        messages,
        tools: toolDefs.length > 0 ? toolDefs : undefined,
        jsonOutput: !!ast.output_schema,
        baseUrl: ast.baseUrl
      };

      const response = await provider.generateContent(llmReq);

      // If model returned no tool calls, it's a final answer
      if (!response.toolCalls || response.toolCalls.length === 0) {
        finalOutput = response.text || '';
        break;
      }

      // Model returned tool calls: persist the assistant turn into DB
      logger.debug(`[CuratorRequestProcessor] Agent '${ast.agentName}' invoked ${response.toolCalls.length} tool(s) in turn ${iterations}.`);
      
      messages.push({
        role: 'assistant',
        content: response.text,
        toolCalls: response.toolCalls
      });

      // Save the calls as made (ids, args): later turns replay them as tool messages (history_profile 'full')
      await ctx.saveResponse(req, JSON.stringify({
        type: 'TOOL_CALLS', ok: true,
        ...(response.text ? { text: response.text } : {}),
        calls: response.toolCalls.map(({ id, name, args }) => ({ id, name, args: args ?? {} }))
      } satisfies CuratorStructuredResponse));

      // Execute each tool and check permissions
      let pausedForUser = false;

      for (const tc of response.toolCalls) {
        // Only tools offered to this agent may run, even if others are registered in the engine.
        const tool = offeredByLlmName.get(tc.name);
        const toolKey: string = tool?.name || tc.name;
        let toolOutput = '';
        let isError = false;

        if (tool) {
          // Check tool access & permission
          const accessCheck = await ctx.tools.checkAccess(req, toolKey, tool);
          if (!accessCheck.allowed) {
            if (accessCheck.requiresConfirmation) {
              logger.debug(`[CuratorRequestProcessor] Request ${req.id} pausing on WAITING_FOR_USER for tool '${toolKey}'.`);
              const ttlMs = (tool as any).approvalTtlMs ?? ctx.tools.approvalTtlMs;
              const expiresAt = ttlMs > 0 ? new Date(ctx.now() + ttlMs).toISOString() : undefined;
              await ctx.prisma.request.update({
                where: { id: req.id },
                data: {
                  status: 'WAITING_FOR_USER',
                  lockedBy: null,
                  lockedAt: null,
                  context: {
                    ...req.context,
                    // Approvals are granted for the resolved key; llmName is what the model called.
                    pendingToolCall: { ...tc, name: toolKey, llmName: tc.name, expiresAt, onExpired: 'fail' },
                    reason: accessCheck.reason
                  }
                }
              });
              await ctx.saveResponse(req, JSON.stringify({
                type: 'APPROVAL_REQUIRED', ok: false, tool: toolKey, reason: accessCheck.reason, expiresAt
              } satisfies CuratorStructuredResponse));
              pausedForUser = true;
              break;
            } else {
              toolOutput = `[Access Denied] ${accessCheck.reason}`;
              isError = true;
            }
          } else {
            let hydratedSecrets = new Map<string, string>();
            let executionArgs = tc.args;
            let secretResolutionError = false;

            try {
              const hydration = await SecretService.hydrate(tc.args, {
                projectId: req.projectId,
                userId: req.userId,
                agentId: req.agentId,
                prisma: ctx.prisma
              });
              executionArgs = hydration.hydrated;
              hydratedSecrets = hydration.secretsMap;
            } catch (secErr: any) {
              toolOutput = `[Secret Resolution Error] ${secErr.message}`;
              isError = true;
              secretResolutionError = true;
            }

            if (!secretResolutionError) {
              try {
                const res = await tool.runAsync({
                  args: executionArgs,
                  toolContext: {
                    conversationId: req.conversationId,
                    userId: req.userId,
                    projectId: req.projectId,
                    prisma: ctx.prisma,
                    service: ctx.service,
                    tryService: ctx.tryService
                  }
                });
                // Egress sanitization: mask any reflected secrets before sending back to LLM/DB
                toolOutput = formatToolResult(res, offeredNamesByLlmName.get(tc.name) ?? [tc.name], tool, (text) => SecretService.mask(text, hydratedSecrets));

                // Consume ONETIME approval if used
                if (accessCheck.approvalScope === 'ONETIME' && req.context) {
                  delete req.context.__humanApproved__;
                  if (Array.isArray(req.context.__approvedTools__)) {
                    req.context.__approvedTools__ = req.context.__approvedTools__.filter((t: string) => t !== toolKey);
                  }
                }
                // TODO(db-driven): LLM tool calls should become child Requests; until then the agent's
                // conversation history is the record of this call.
              } catch (err: any) {
                toolOutput = `[Tool Error] ${SecretService.mask(err.message, hydratedSecrets)}`;
                isError = true;
              }
            }
          }
        } else {
          // Inline tool check
          const inlineDef = offeredTools.find((t: any) => typeof t !== 'string' && t.name === tc.name) as any;
          if (inlineDef) {
            let hydratedSecrets = new Map<string, string>();
            let executionArgs = tc.args;
            try {
              const hydration = await SecretService.hydrate(tc.args, {
                projectId: req.projectId,
                userId: req.userId,
                agentId: req.agentId,
                prisma: ctx.prisma
              });
              executionArgs = hydration.hydrated;
              hydratedSecrets = hydration.secretsMap;

              const sandbox = { console, args: executionArgs, fetch };
              const sandboxContext = vm.createContext(sandbox);
              const wrapper = `(async () => { const fn = ${inlineDef.sourceCode}; return await fn(args); })()`;
              const res = await vm.runInContext(wrapper, sandboxContext);
              toolOutput = formatToolResult(res, [tc.name], inlineDef, (text) => SecretService.mask(text, hydratedSecrets));
            } catch (err: any) {
              toolOutput = `[Inline Tool Error] ${SecretService.mask(err.message, hydratedSecrets)}`;
              isError = true;
            }
          } else {
            toolOutput = `[Error] Tool '${tc.name}' not found.`;
            isError = true;
          }
        }

        // Push tool output message to context
        messages.push({
          role: 'tool',
          toolCallId: tc.id,
          toolName: tc.name,
          content: toolOutput,
          isError
        });

        // Save tool result response to DB
        await ctx.saveResponse(req, `[Tool Result: ${tc.name}]\n${toolOutput}`);
      }

      if (pausedForUser) {
        return; // Request safely paused in DB
      }
    }

    if (ast.output_format !== undefined) {
      // Structured output is formatted as data (e.g. `field:answer`), anything else as text.
      let value: unknown = finalOutput;
      if (ast.output_schema) {
        try { value = JSON.parse(finalOutput); } catch (_) {}
      }
      try {
        finalOutput = ctx.tools.output.format(value, ast.output_format, { target: 'display', agentName: ast.agentName });
      } catch (err: any) {
        logger.warn(`[CuratorRequestProcessor] Agent '${ast.agentName}' output_format failed: ${err.message}`);
      }
    }

    logger.debug(`[CuratorRequestProcessor] Agent '${ast.agentName}' completed in ${iterations} turn(s). Output length: ${finalOutput.length}`);
    const targetKey = agentOutputKey(ast);
    try {
      const parsed = JSON.parse(finalOutput);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        req.context = { ...(req.context || {}), [targetKey]: parsed };
      } else {
        req.context = { ...(req.context || {}), [targetKey]: finalOutput };
      }
    } catch (_) {
      req.context = { ...(req.context || {}), [targetKey]: finalOutput };
    }
    await ctx.saveResponse(req, finalOutput);
    await ctx.completeRequest(req.id, 'COMPLETED');
  },
};

/** Function names every provider accepts (Anthropic/OpenAI: [A-Za-z0-9_-]{1,64}; Gemini is a superset). */
const LLM_TOOL_NAME = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;

/**
 * Provider-safe tool name, unique among `taken`. Valid names pass through unchanged; others map
 * `.` to `__` (so `mcp.crm.lookup` → `mcp__crm__lookup`), drop other invalid characters and fit 64 chars.
 */
export function llmToolName(name: string, taken: { has(name: string): boolean }): string {
  let base = LLM_TOOL_NAME.test(name)
    ? name
    : name.replace(/\./g, '__').replace(/[^A-Za-z0-9_-]/g, '_').replace(/^(?=[^A-Za-z_])/, '_');
  if (base.length > 64) {
    let hash = 0;
    for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    base = `${base.slice(0, 55)}_${hash.toString(36).padStart(7, '0').slice(0, 8)}`;
  }
  let candidate = base;
  for (let i = 2; taken.has(candidate); i++) {
    const suffix = `_${i}`;
    candidate = `${base.slice(0, 64 - suffix.length)}${suffix}`;
  }
  return candidate;
}

/** Context key an agent's output is stored under: `as`, else the camelCased agentName, else 'decision'. */
export function agentOutputKey(ast: any): string {
  return ast?.as || toCamelCase(ast?.agentName) || 'decision';
}

/** How earlier agent turns replay: 'full' = prompt, tool calls with results, answer; 'answers' = prompt and answer. */
export type HistoryProfile = 'full' | 'answers';
const HISTORY_PROFILES = new Set<string>(['full', 'answers']);

const TOOL_RESULT_PREFIX = /^\[Tool Result: ([^\]]+)\]\n?/;

/**
 * One earlier agent turn (all Responses of one Request) as messages: its prompt once, then its steps, then its answer.
 * Tool calls replay as tool messages only when every called tool is offered now (providers reject calls to undeclared
 * tools); otherwise each result replays as assistant text.
 */
function agentTurnMessages(prompt: string, contents: string[], profile: HistoryProfile, offered: Set<string>): LlmMessage[] {
  const messages: LlmMessage[] = prompt ? [{ role: 'user', content: prompt }] : [];
  let pending: { id: string; name: string }[] = [];
  let structured = false;
  for (const content of contents) {
    let record: any = null;
    try { record = content.startsWith('{') ? JSON.parse(content) : null; } catch (_) {}
    if (record?.type === 'TOOL_CALLS' && Array.isArray(record.calls)) {
      pending = record.calls.map((c: any) => ({ id: String(c.id), name: String(c.name) }));
      structured = profile === 'full' && pending.length > 0 && pending.every((c) => offered.has(c.name));
      if (structured) messages.push({ role: 'assistant', content: record.text ?? '', toolCalls: record.calls });
      else if (profile === 'full' && record.text) messages.push({ role: 'assistant', content: record.text });
      continue;
    }
    // Other structured records (approval notices, ...) and the legacy `[Invoking x]` marker are not conversation.
    if (record?.type && 'ok' in record) continue;
    if (/^\[Invoking [^\]]*\]$/.test(content) || !content.trim()) continue;
    const result = TOOL_RESULT_PREFIX.exec(content);
    if (result) {
      if (profile === 'answers') continue;
      const call = pending.shift();
      if (structured && call) {
        messages.push({ role: 'tool', toolCallId: call.id, toolName: call.name, content: content.slice(result[0].length) });
      } else {
        messages.push({ role: 'assistant', content });
      }
      continue;
    }
    messages.push({ role: 'assistant', content });
  }
  // A turn cut short (approval wait, crash) may leave calls without results; providers need a result per call.
  if (structured) {
    for (const call of pending) messages.push({ role: 'tool', toolCallId: call.id, toolName: call.name, content: '[No result]', isError: true });
  }
  return messages;
}

async function loadConversationHistory(
  req: any,
  includeContents: string | undefined,
  ctx: NodeContext,
  profile: HistoryProfile = 'full',
  offered: Set<string> = new Set()
): Promise<LlmMessage[]> {
  if (includeContents === 'none') return [];
  
  const limit = (req.ast as any)?.history_limit ?? (req.context as any)?.historyLimit;
  // Sequential steps are created last-to-first, so request ids do not follow execution order:
  // every Response already written (except this request's own turns) is prior history.
  const pastResponses = await ctx.prisma.response.findMany({
    where: { conversationId: req.conversationId, requestId: { not: req.id } },
    orderBy: limit && limit > 0 ? [{ createdAt: 'desc' }, { id: 'desc' }] : [{ createdAt: 'asc' }, { id: 'asc' }],
    take: limit && limit > 0 ? limit : undefined,
    include: { request: true }
  });
  
  if (limit && limit > 0) {
    pastResponses.reverse();
  }
  
  if (pastResponses.length === 0) return [];

  const messages: LlmMessage[] = [];

  for (let i = 0; i < pastResponses.length; i++) {
    const pr = pastResponses[i];
    const prAst = pr.request?.ast as any;
    if (prAst?.exclude_from_history) continue;

    if (prAst?.type === 'Curator_Agent') {
      // The consecutive Responses of one agent Request are one turn.
      const contents = [pr.content];
      while (pastResponses[i + 1]?.requestId === pr.requestId) contents.push(pastResponses[++i].content);
      // A past turn whose prompt no longer resolves (e.g. it ran without its context) is dropped, not fatal.
      let prompt: string;
      try {
        prompt = await ctx.interpolateTemplate(prAst.prompt, pr.request) || '';
      } catch {
        continue;
      }
      messages.push(...agentTurnMessages(prompt, contents, profile, offered));
    } else if (prAst?.type === 'Curator_HumanInput') {
      messages.push({ role: 'user', content: pr.content });
    } else if (prAst?.type === 'Curator_Script' || prAst?.type === 'Curator_Tool') {
      messages.push({ role: 'tool', toolName: prAst.toolName || prAst.name || 'tool', content: pr.content });
    }
  }

  return messages;
}
