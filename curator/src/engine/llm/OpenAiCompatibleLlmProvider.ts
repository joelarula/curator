import type {
  ILlmProvider,
  LlmRequest,
  LlmResponse,
  LlmToolCall,
  LlmMessage,
  LlmEmbeddingRequest,
  LlmEmbeddingResponse,
} from './ILlmProvider.js';
import { logger } from '../../utils/logger.js';
import { GuardrailService } from '../../services/GuardrailService.js';

export class OpenAiCompatibleLlmProvider implements ILlmProvider {
  public readonly providerName = 'openai-compatible';
  // llama.cpp / Ollama / OpenAI-style servers: native `tools` (CURATOR_LOCAL_TOOL_CALLING=prompt for models or
  // servers without tool support), `response_format` JSON, no image input assumed
  public get capabilities() {
    const tools: 'native' | 'prompt' = process.env.CURATOR_LOCAL_TOOL_CALLING === 'prompt' ? 'prompt' : 'native';
    return { tools, vision: false, json: true, streaming: false, embeddings: true };
  }

  public async generateContent(req: LlmRequest): Promise<LlmResponse> {
    const baseUrl = req.baseUrl || process.env.LOCAL_LLM_URL || process.env.OPENAI_BASE_URL || 'http://localhost:8080';
    const urlCheck = GuardrailService.validateEndpointUrl(baseUrl);
    if (!urlCheck.allowed) {
      throw new Error(`[OpenAiCompatibleLlmProvider] Blocked endpoint URL: ${urlCheck.reason}`);
    }
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

    logger.debug(`[OpenAiCompatibleLlmProvider] Calling ${endpoint} with model=${model}`);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: req.signal,
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
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  }

  public async embedContent(req: LlmEmbeddingRequest): Promise<LlmEmbeddingResponse> {
    const baseUrl = req.baseUrl || process.env.LOCAL_LLM_URL || process.env.OPENAI_BASE_URL || 'http://localhost:8080';
    const urlCheck = GuardrailService.validateEndpointUrl(baseUrl);
    if (!urlCheck.allowed) {
      throw new Error(`[OpenAiCompatibleLlmProvider] Blocked embedding endpoint URL: ${urlCheck.reason}`);
    }
    const apiKey = req.apiKey || process.env.OPENAI_API_KEY || 'no-key-required';
    const model = req.model || 'text-embedding-3-small';

    const endpoint = baseUrl.endsWith('/') ? `${baseUrl}v1/embeddings` : `${baseUrl}/v1/embeddings`;

    const payload: any = {
      model,
      input: req.text,
    };
    if (req.dimensions) {
      payload.dimensions = req.dimensions;
    }

    logger.info(`[OpenAiCompatibleLlmProvider] Calling embeddings ${endpoint} with model=${model}`);

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
    const embeddings: number[][] = (data.data || []).map((item: any) => item.embedding);
    const dimensions = embeddings.length > 0 ? embeddings[0].length : 0;

    return {
      embeddings,
      dimensions,
      usage: data.usage ? { totalTokens: data.usage.total_tokens } : undefined,
    };
  }
}
