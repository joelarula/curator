export type LlmMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LlmToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface LlmMessage {
  role: LlmMessageRole;
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
  cachedContent?: string; // e.g. "cachedContents/ab12cd34ef"
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
