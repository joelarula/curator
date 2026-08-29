import type { ILlmProvider, LlmRequest, LlmResponse, LlmToolCall, LlmMessage } from './ILlmProvider.js';
import { logger } from '../../utils/logger.js';

export class OpenAiCompatibleLlmProvider implements ILlmProvider {
  public readonly providerName = 'openai-compatible';

  public async generateContent(req: LlmRequest): Promise<LlmResponse> {
    const baseUrl = req.baseUrl || process.env.LOCAL_LLM_URL || process.env.OPENAI_BASE_URL || 'http://localhost:8080';
    const apiKey = req.apiKey || process.env.OPENAI_API_KEY || 'no-key-required';
    const model = req.model || 'default';

    const endpoint = baseUrl.endsWith('/') ? `${baseUrl}v1/chat/completions` : `${baseUrl}/v1/chat/completions`;

    const openAiMessages: any[] = [];

    if (req.systemPrompt) {
      openAiMessages.push({ role: 'system', content: req.systemPrompt });
    }

    for (const msg of req.messages) {
      if (msg.role === 'system') {
        openAiMessages.push({ role: 'system', content: msg.content });
      } else if (msg.role === 'user') {
        openAiMessages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        const assistantMsg: any = { role: 'assistant', content: msg.content || '' };
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          assistantMsg.tool_calls = msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.args),
            },
          }));
        }
        openAiMessages.push(assistantMsg);
      } else if (msg.role === 'tool') {
        openAiMessages.push({
          role: 'tool',
          tool_call_id: msg.toolCallId || 'call_default',
          content: msg.content,
        });
      }
    }

    const payload: any = {
      model,
      messages: openAiMessages,
      temperature: req.temperature ?? 0.7,
    };

    if (req.maxTokens) {
      payload.max_tokens = req.maxTokens;
    }

    if (req.jsonOutput) {
      payload.response_format = { type: 'json_object' };
    }

    if (req.tools && req.tools.length > 0) {
      payload.tools = req.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    logger.info(`[OpenAiCompatibleLlmProvider] Calling ${endpoint} with model=${model}`);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`[OpenAiCompatibleLlmProvider] HTTP ${res.status}: ${errText}`);
    }

    const data: any = await res.json();
    const choice = data.choices?.[0];
    const message = choice?.message;

    const toolCalls: LlmToolCall[] = [];
    if (message?.tool_calls && message.tool_calls.length > 0) {
      for (const tc of message.tool_calls) {
        let args = {};
        try {
          args = typeof tc.function?.arguments === 'string' ? JSON.parse(tc.function.arguments) : (tc.function?.arguments || {});
        } catch {
          args = { raw: tc.function?.arguments };
        }
        toolCalls.push({
          id: tc.id || `call_${Math.random().toString(36).substring(2, 9)}`,
          name: tc.function?.name,
          args: args as Record<string, unknown>,
        });
      }
    }

    const text = message?.content || '';
    const finishReason = choice?.finish_reason === 'tool_calls' ? 'tool_use' : (choice?.finish_reason || 'stop');

    return {
      text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason,
      usage: data.usage
        ? {
            inputTokens: data.usage.prompt_tokens,
            outputTokens: data.usage.completion_tokens,
          }
        : undefined,
    };
  }
}
