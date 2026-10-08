import type { ILlmProvider, LlmRequest, LlmResponse, LlmEmbeddingRequest, LlmEmbeddingResponse } from './ILlmProvider.js';
export declare class OpenAiCompatibleLlmProvider implements ILlmProvider {
    readonly providerName = "openai-compatible";
    generateContent(req: LlmRequest): Promise<LlmResponse>;
    embedContent(req: LlmEmbeddingRequest): Promise<LlmEmbeddingResponse>;
}
//# sourceMappingURL=OpenAiCompatibleLlmProvider.d.ts.map