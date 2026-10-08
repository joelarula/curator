import type { ILlmProvider, LlmRequest, LlmResponse } from './ILlmProvider.js';
export declare class AnthropicLlmProvider implements ILlmProvider {
    readonly providerName = "anthropic";
    generateContent(req: LlmRequest): Promise<LlmResponse>;
}
//# sourceMappingURL=AnthropicLlmProvider.d.ts.map