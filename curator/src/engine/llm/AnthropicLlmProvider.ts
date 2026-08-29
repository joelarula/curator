import type { ILlmProvider, LlmRequest, LlmResponse, LlmToolCall, LlmMessage } from './ILlmProvider.js';
import { logger } from '../../utils/logger.js';

export class AnthropicLlmProvider implements ILlmProvider {
  public readonly providerName = 'anthropic';

  public async generateContent(req: LlmRequest): Promise<LlmResponse> {
    const apiKey = req.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('[AnthropicLlmProvider] API key missing. Please set ANTHROPIC_API_KEY.');
    }

    const model = req.model || 'claude-3-7-sonnet-20250219';
    const baseUrl = req.baseUrl || 'https://api.anthropic.com/v1/messages';

    // System prompt with prompt caching support
    let system: any = undefined;
    if (req.systemPrompt) {
      system = [
        {
          type: 'text',
          text: req.systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ];
    }

    const anthropicMessages: any[] = [];

    for (const msg of req.messages) {
      if (msg.role === 'system') continue;

      if (msg.role === 'user') {
        anthropicMessages.push({
          role: 'user',
          content: msg.content,
        });
      } else if (msg.role === 'assistant') {
        const content: any[] = [];
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const tc of msg.toolCalls) {
            content.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.args,
            });
          }
        }
        anthropicMessages.push({
          role: 'assistant',
          content: content.length > 0 ? content : [{ type: 'text', text: '' }],
        });
      } else if (msg.role === 'tool') {
        anthropicMessages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.toolCallId || 'call_default',
              content: msg.content,
              is_error: msg.isError ?? false,
            },
          ],
        });
      }
    }

    const payload: any = {
      model,
      max_tokens: req.maxTokens || 4096,
      messages: anthropicMessages,
      temperature: req.temperature ?? 0.7,
    };

    if (system) {
      payload.system = system;
    }

    if (req.tools && req.tools.length > 0) {
      payload.tools = req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`[AnthropicLlmProvider] HTTP ${res.status}: ${err}`);
    }

    const data: any = await res.json();
    const toolCalls: LlmToolCall[] = [];
    let text = '';

    for (const item of data.content || []) {
      if (item.type === 'text') {
        text += item.text;
      } else if (item.type === 'tool_use') {
        toolCalls.push({
          id: item.id,
          name: item.name,
          args: item.input || {},
        });
      }
    }

    const finishReason = data.stop_reason === 'tool_use' ? 'tool_use' : 'stop';

    return {
      text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason,
      usage: data.usage
        ? {
            inputTokens: (data.usage.input_tokens || 0) + (data.usage.cache_creation_input_tokens || 0) + (data.usage.cache_read_input_tokens || 0),
            outputTokens: data.usage.output_tokens || 0,
          }
        : undefined,
    };
  }
}
