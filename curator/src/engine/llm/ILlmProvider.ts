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
  /** Aborts the provider call (the node's `timeoutMs` passed). Not serialized into traces. */
  signal?: AbortSignal;
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

/** What a provider (or one of its models) supports; clients hide what the model can't do. */
export interface LlmCapabilities {
  /** Tool calling: provider-native, through a prompt protocol, or not at all. */
  tools: 'native' | 'prompt' | 'none';
  vision: boolean;
  json: boolean;
  streaming: boolean;
  embeddings: boolean;
}

/** Assumed for providers that declare nothing (the behaviour before capabilities existed). */
export const DEFAULT_LLM_CAPABILITIES: Readonly<LlmCapabilities> = Object.freeze({
  tools: 'native',
  vision: false,
  json: true,
  streaming: false,
  embeddings: false,
});

/** Capabilities of `model` on `provider`: defaults < provider `capabilities` < `capabilitiesFor(model)`. */
export function llmCapabilities(provider: ILlmProvider | undefined, model?: string): LlmCapabilities {
  return {
    ...DEFAULT_LLM_CAPABILITIES,
    ...(provider?.embedContent ? { embeddings: true } : {}),
    ...(provider?.capabilities ?? {}),
    ...(provider?.capabilitiesFor?.(model) ?? {}),
  };
}

export interface ILlmProvider {
  readonly providerName: string;
  /** Provider-wide capabilities (missing fields: DEFAULT_LLM_CAPABILITIES). */
  readonly capabilities?: Partial<LlmCapabilities>;
  /** Per-model differences (e.g. a text-only model of a vision provider). */
  capabilitiesFor?(model?: string): Partial<LlmCapabilities> | undefined;
  generateContent(req: LlmRequest): Promise<LlmResponse>;
  embedContent?(req: LlmEmbeddingRequest): Promise<LlmEmbeddingResponse>;
  createContextCache?(req: LlmCreateCacheRequest): Promise<LlmCacheInfo>;
  deleteContextCache?(name: string, apiKey?: string): Promise<void>;
}
