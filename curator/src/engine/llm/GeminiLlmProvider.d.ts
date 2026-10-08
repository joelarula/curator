import type { ILlmProvider, LlmRequest, LlmResponse, LlmEmbeddingRequest, LlmEmbeddingResponse, LlmCreateCacheRequest, LlmCacheInfo } from './ILlmProvider.js';
export declare class GeminiLlmProvider implements ILlmProvider {
    readonly providerName = "gemini";
    generateContent(req: LlmRequest): Promise<LlmResponse>;
    embedContent(req: LlmEmbeddingRequest): Promise<LlmEmbeddingResponse>;
    createContextCache(req: LlmCreateCacheRequest): Promise<LlmCacheInfo>;
    deleteContextCache(name: string, apiKey?: string): Promise<void>;
    private formatGeminiContents;
}
//# sourceMappingURL=GeminiLlmProvider.d.ts.map