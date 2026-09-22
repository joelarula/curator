import { GoogleGenAI } from '@google/genai';

export interface LlmToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: LlmToolCall[];
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
}

export interface LlmToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmRequest {
  model?: string;
  systemPrompt?: string;
  messages: LlmMessage[];
  tools?: LlmToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  jsonOutput?: boolean;
  apiKey?: string;
  baseUrl?: string;
  cachedContent?: string;
}

export interface LlmResponse {
  text: string;
  toolCalls?: LlmToolCall[];
  finishReason?: 'stop' | 'tool_use' | 'length' | 'error';
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cachedTokens?: number;
    totalTokens?: number;
  };
}

export interface LlmEmbeddingRequest {
  text: string | string[];
  model?: string;
  taskType?: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT' | 'SEMANTIC_SIMILARITY' | 'CLASSIFICATION' | 'CLUSTERING';
  dimensions?: number;
  apiKey?: string;
  baseUrl?: string;
}

export interface LlmEmbeddingResponse {
  embeddings: number[][];
  dimensions: number;
  usage?: {
    totalTokens?: number;
  };
}

export interface LlmCreateCacheRequest {
  displayName?: string;
  model?: string;
  systemPrompt?: string;
  messages?: LlmMessage[];
  ttlSeconds?: number;
  apiKey?: string;
}

export interface LlmCacheInfo {
  name: string;
  model: string;
  displayName?: string;
  createTime?: string;
  expireTime?: string;
  usageMetadata?: {
    totalTokenCount?: number;
  };
}

export interface ILlmProvider {
  readonly providerName: string;
  generateContent(req: LlmRequest): Promise<LlmResponse>;
  embedContent?(req: LlmEmbeddingRequest): Promise<LlmEmbeddingResponse>;
  createContextCache?(req: LlmCreateCacheRequest): Promise<LlmCacheInfo>;
  deleteContextCache?(name: string, apiKey?: string): Promise<void>;
}

export class GeminiLlmProvider implements ILlmProvider {
  public readonly providerName = 'gemini';

  constructor(private defaultApiKey?: string, private defaultModel: string = 'gemini-2.5-flash') {}

  public async generateContent(req: LlmRequest): Promise<LlmResponse> {
    const apiKey = req.apiKey || this.defaultApiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('[GeminiLlmProvider] API key missing. Please set GOOGLE_API_KEY or GEMINI_API_KEY.');
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = req.model || this.defaultModel;

    const config: any = {};
    if (req.systemPrompt) {
      config.systemInstruction = req.systemPrompt;
    }
    if (req.cachedContent) {
      config.cachedContent = req.cachedContent;
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
            cachedTokens: (result.usageMetadata as any).cachedContentTokenCount || 0,
            totalTokens: result.usageMetadata.totalTokenCount,
          }
        : undefined,
    };
  }

  public async embedContent(req: LlmEmbeddingRequest): Promise<LlmEmbeddingResponse> {
    const apiKey = req.apiKey || this.defaultApiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('[GeminiLlmProvider] API key missing for embeddings.');
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = req.model || 'text-embedding-004';
    const texts = Array.isArray(req.text) ? req.text : [req.text];

    const config: any = {};
    if (req.dimensions) config.outputDimensionality = req.dimensions;
    if (req.taskType) config.taskType = req.taskType;

    const embeddings: number[][] = [];
    for (const txt of texts) {
      const res = await ai.models.embedContent({
        model,
        contents: txt,
        config: Object.keys(config).length > 0 ? config : undefined,
      });

      const embeddingValues = (res as any).embeddings?.[0]?.values || (res as any).embedding?.values;
      if (embeddingValues && Array.isArray(embeddingValues)) {
        embeddings.push(embeddingValues);
      }
    }

    const dimensions = embeddings.length > 0 ? embeddings[0].length : 0;
    return {
      embeddings,
      dimensions,
    };
  }

  public async createContextCache(req: LlmCreateCacheRequest): Promise<LlmCacheInfo> {
    const apiKey = req.apiKey || this.defaultApiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('[GeminiLlmProvider] API key missing for cache creation.');
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = req.model || this.defaultModel;
    const ttl = `${req.ttlSeconds || 3600}s`;

    const config: any = { ttl };
    if (req.displayName) config.displayName = req.displayName;
    if (req.systemPrompt) config.systemInstruction = req.systemPrompt;
    if (req.messages && req.messages.length > 0) {
      config.contents = this.formatGeminiContents(req.messages);
    }

    const cache = await ai.caches.create({
      model,
      config,
    });

    return {
      name: cache.name || `cachedContents/${Math.random().toString(36).substring(2, 9)}`,
      model: cache.model || model,
      displayName: cache.displayName,
      createTime: cache.createTime,
      expireTime: cache.expireTime,
      usageMetadata: cache.usageMetadata
        ? { totalTokenCount: cache.usageMetadata.totalTokenCount }
        : undefined,
    };
  }

  public async deleteContextCache(name: string, apiKey?: string): Promise<void> {
    const key = apiKey || this.defaultApiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('[GeminiLlmProvider] API key missing for cache deletion.');
    }

    const ai = new GoogleGenAI({ apiKey: key });
    await ai.caches.delete({ name });
  }

  private formatGeminiContents(messages: LlmMessage[]): any[] {
    const contents: any[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') continue;

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
