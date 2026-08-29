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
}

export interface LlmResponse {
  text: string;
  toolCalls?: LlmToolCall[];
  finishReason?: 'stop' | 'tool_use' | 'length' | 'error';
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface ILlmProvider {
  readonly providerName: string;
  generateContent(req: LlmRequest): Promise<LlmResponse>;
}
