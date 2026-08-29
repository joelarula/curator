import { GoogleGenAI } from '@google/genai';
import type { ILlmProvider, LlmRequest, LlmResponse, LlmToolCall, LlmMessage } from './ILlmProvider.js';
import { logger } from '../../utils/logger.js';

export class GeminiLlmProvider implements ILlmProvider {
  public readonly providerName = 'gemini';

  public async generateContent(req: LlmRequest): Promise<LlmResponse> {
    const apiKey = req.apiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('[GeminiLlmProvider] API key missing. Please set GOOGLE_API_KEY or GEMINI_API_KEY.');
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = req.model || 'gemini-2.5-flash';

    const config: any = {};
    if (req.systemPrompt) {
      config.systemInstruction = req.systemPrompt;
    }
    if (req.jsonOutput) {
      config.responseMimeType = 'application/json';
    }
    if (req.temperature !== undefined) {
      config.temperature = req.temperature;
    }
    if (req.maxTokens !== undefined) {
      config.maxOutputTokens = req.maxTokens;
    }

    if (req.tools && req.tools.length > 0) {
      config.tools = [
        {
          functionDeclarations: req.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }

    // Convert LlmMessages into Gemini contents
    const contents = this.formatGeminiContents(req.messages);

    const result = await ai.models.generateContent({
      model,
      contents,
      config,
    });

    const toolCalls: LlmToolCall[] = [];
    if (result.functionCalls && result.functionCalls.length > 0) {
      for (const call of result.functionCalls) {
        toolCalls.push({
          id: `call_${Math.random().toString(36).substring(2, 9)}`,
          name: call.name || 'anonymous_tool',
          args: (call.args as Record<string, unknown>) || {},
        });
      }
    }

    const text = result.text ?? '';
    const finishReason = toolCalls.length > 0 ? 'tool_use' : 'stop';

    return {
      text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason,
      usage: result.usageMetadata
        ? {
            inputTokens: result.usageMetadata.promptTokenCount,
            outputTokens: result.usageMetadata.candidatesTokenCount,
          }
        : undefined,
    };
  }

  private formatGeminiContents(messages: LlmMessage[]): any[] {
    const contents: any[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        // System instructions are handled in config.systemInstruction
        continue;
      }

      if (msg.role === 'user') {
        contents.push({
          role: 'user',
          parts: [{ text: msg.content }],
        });
      } else if (msg.role === 'assistant') {
        const parts: any[] = [];
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const tc of msg.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: tc.args,
              },
            });
          }
        }
        contents.push({
          role: 'model',
          parts: parts.length > 0 ? parts : [{ text: '' }],
        });
      } else if (msg.role === 'tool') {
        contents.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: msg.toolName || 'tool',
                response: {
                  output: msg.content,
                  isError: msg.isError ?? false,
                },
              },
            },
          ],
        });
      }
    }

    if (contents.length > 0 && contents[0].role === 'model') {
      contents.unshift({ role: 'user', parts: [{ text: '[Conversation Started]' }] });
    }

    return contents;
  }
}
