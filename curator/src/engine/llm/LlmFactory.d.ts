import type { ILlmProvider } from './ILlmProvider.js';
export declare class LlmFactory {
    private static providers;
    static registerProvider(name: string, provider: ILlmProvider): void;
    static getProvider(providerName?: string, baseUrl?: string): ILlmProvider;
}
//# sourceMappingURL=LlmFactory.d.ts.map