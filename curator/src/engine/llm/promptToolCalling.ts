/**
 * Tool calling through the prompt, for models without native tool support (e.g. small GGUF models behind llama.cpp):
 * tool schemas go into the system prompt, the model answers with `<tool_call>{"name": ..., "arguments": {...}}`
 * blocks, and the reply is turned back into standard `LlmResponse.toolCalls` (validated against each tool's schema).
 * The agent loop, guardrails and tracing see the same shapes as with native tool calls.
 */
import AjvModule from 'ajv';
import type { LlmMessage, LlmRequest, LlmResponse, LlmToolCall, LlmToolDefinition } from './ILlmProvider.js';

const Ajv = (AjvModule as any).default || AjvModule;
const ajv = new Ajv({ allErrors: true, strict: false });

export type ToolCallingMode = 'auto' | 'native' | 'prompt';

/** The mode to use: the agent's choice, else the model's (`auto` → capability; `none` never needs prompt mode). */
export function resolveToolCalling(requested: ToolCallingMode | undefined, capability: 'native' | 'prompt' | 'none'): 'native' | 'prompt' {
  if (requested === 'native' || requested === 'prompt') return requested;
  return capability === 'prompt' ? 'prompt' : 'native';
}

const BLOCK = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
const FENCE = /```(?:tool_call|json)?\s*(\{[\s\S]*?\})\s*```/g;

export function promptToolInstructions(tools: LlmToolDefinition[]): string {
  const list = tools.map((t) => JSON.stringify({ name: t.name, description: t.description, parameters: t.parameters })).join('\n');
  return [
    '## Tools',
    'You can call these tools (JSON Schema for each):',
    list,
    '',
    'To call a tool, reply with one block per call and nothing else in that turn:',
    '<tool_call>{"name": "<tool name>", "arguments": { ... }}</tool_call>',
    'Arguments must match the tool\'s schema. You will get each result back as a "Tool result" message.',
    'When you have the answer, reply in plain text without any <tool_call> block.',
  ].join('\n');
}

/** History for a model without tool roles: earlier calls as blocks, results as user messages. */
function toPromptMessages(messages: readonly LlmMessage[]): LlmMessage[] {
  return messages.map((m) => {
    if (m.role === 'assistant' && m.toolCalls?.length) {
      const blocks = m.toolCalls.map((c) => `<tool_call>${JSON.stringify({ name: c.name, arguments: c.args ?? {} })}</tool_call>`).join('\n');
      return { role: 'assistant', content: [m.content, blocks].filter(Boolean).join('\n') };
    }
    if (m.role === 'tool') {
      return { role: 'user', content: `Tool result (${m.toolName ?? 'tool'})${m.isError ? ' [error]' : ''}:\n${m.content}` };
    }
    return m;
  });
}

/** The request as sent to the model in prompt mode: no `tools`, instructions in the system prompt. */
export function toPromptToolRequest(req: LlmRequest): LlmRequest {
  if (!req.tools?.length) return req;
  const instructions = promptToolInstructions(req.tools);
  return {
    ...req,
    tools: undefined,
    systemPrompt: req.systemPrompt ? `${req.systemPrompt}\n\n${instructions}` : instructions,
    messages: toPromptMessages(req.messages),
  };
}

export interface ParsedPromptToolCalls {
  /** Reply text without the call blocks. */
  text: string;
  toolCalls: LlmToolCall[];
  /** Problems with blocks that looked like calls (bad JSON, unknown tool, invalid arguments). */
  errors: string[];
}

/** Reads `<tool_call>` blocks (or fenced JSON with a `name`) from a reply and validates them against the offered tools. */
export function parsePromptToolCalls(text: string, tools: LlmToolDefinition[], turn = 0): ParsedPromptToolCalls {
  const byName = new Map(tools.map((t) => [t.name, t]));
  const toolCalls: LlmToolCall[] = [];
  const errors: string[] = [];
  let raw: string[] = [...text.matchAll(BLOCK)].map((m) => m[1]);
  let rest = text.replace(BLOCK, '');
  if (raw.length === 0) {
    // Some models fence the JSON instead; only blocks naming an offered tool count as calls
    const fenced = [...text.matchAll(FENCE)].filter((m) => {
      try {
        return byName.has(JSON.parse(m[1])?.name);
      } catch {
        return false;
      }
    });
    raw = fenced.map((m) => m[1]);
    for (const m of fenced) rest = rest.replace(m[0], '');
  }

  raw.forEach((body, i) => {
    let call: any;
    try {
      call = JSON.parse(body);
    } catch (err: any) {
      errors.push(`Tool call ${i + 1} is not valid JSON (${err?.message ?? err})`);
      return;
    }
    const name = call?.name;
    const args = call?.arguments ?? call?.args ?? {};
    const tool = typeof name === 'string' ? byName.get(name) : undefined;
    if (!tool) {
      errors.push(`Tool call ${i + 1}: unknown tool '${name}' (available: ${[...byName.keys()].join(', ')})`);
      return;
    }
    if (typeof args !== 'object' || args === null || Array.isArray(args)) {
      errors.push(`Tool call ${i + 1} (${name}): "arguments" must be an object`);
      return;
    }
    if (tool.parameters && Object.keys(tool.parameters).length) {
      const check = ajv.compile(tool.parameters);
      if (!check(args)) {
        errors.push(`Tool call ${i + 1} (${name}): ${(check.errors ?? []).map((e: any) => `${e.instancePath || 'arguments'} ${e.message}`).join('; ')}`);
        return;
      }
    }
    toolCalls.push({ id: `prompt_${turn}_${i}`, name, args });
  });

  return { text: rest.trim(), toolCalls, errors };
}

/**
 * Runs one model turn in prompt mode: sends the converted request, parses the calls, and on malformed calls asks the
 * model once to correct them. If the retry is still malformed, returns the text with the errors appended (visible to
 * the user and in the history) and no tool calls.
 */
export async function generateWithPromptTools(
  req: LlmRequest,
  send: (request: LlmRequest) => Promise<LlmResponse>,
  turn = 0
): Promise<LlmResponse> {
  const tools = req.tools ?? [];
  if (tools.length === 0) return send(req);
  const promptReq = toPromptToolRequest(req);

  const first = await send(promptReq);
  let parsed = parsePromptToolCalls(first.text ?? '', tools, turn);
  let last = first;
  if (parsed.errors.length) {
    const retryReq: LlmRequest = {
      ...promptReq,
      messages: [
        ...promptReq.messages,
        { role: 'assistant', content: first.text ?? '' },
        { role: 'user', content: `Your tool call could not be used:\n- ${parsed.errors.join('\n- ')}\nReply again: valid <tool_call> blocks, or plain text with the answer.` },
      ],
    };
    last = await send(retryReq);
    parsed = parsePromptToolCalls(last.text ?? '', tools, turn);
    if (parsed.errors.length && parsed.toolCalls.length === 0) {
      return { ...last, text: `${parsed.text}\n\n[Tool call error] ${parsed.errors.join('; ')}`.trim(), toolCalls: undefined, finishReason: 'stop' };
    }
  }
  return {
    ...last,
    text: parsed.text,
    toolCalls: parsed.toolCalls.length ? parsed.toolCalls : undefined,
    finishReason: parsed.toolCalls.length ? 'tool_use' : last.finishReason,
  };
}
