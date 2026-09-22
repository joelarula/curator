import type { ILlmProvider } from './ILlmProvider.js';
import { OpenAiCompatibleLlmProvider } from './OpenAiCompatibleLlmProvider.js';

export class LlmFactory {
  private static providers: Map<string, ILlmProvider> = new Map<string, ILlmProvider>([
    ['openai-compatible', new OpenAiCompatibleLlmProvider()],
    ['local', new OpenAiCompatibleLlmProvider()],
    ['ollama', new OpenAiCompatibleLlmProvider()],
    ['llamacpp', new OpenAiCompatibleLlmProvider()],
  ]);

  public static registerProvider(name: string, provider: ILlmProvider): void {
    this.providers.set(name.toLowerCase(), provider);
  }

  public static getProvider(providerName?: string, baseUrl?: string): ILlmProvider {
    if (baseUrl || providerName === 'local' || providerName === 'ollama' || providerName === 'llamacpp') {
      return this.providers.get('openai-compatible')!;
    }

    if (providerName && this.providers.has(providerName.toLowerCase())) {
      return this.providers.get(providerName.toLowerCase())!;
    }

    // If gemini was registered (e.g. via @curator/plugin-llm-gemini)
    if (this.providers.has('gemini')) {
      return this.providers.get('gemini')!;
    }

    // Default to the zero-dependency openai-compatible provider
    const fallback = this.providers.get('openai-compatible');
    if (!fallback) {
      throw new Error(`[LlmFactory] No LLM provider registered for "${providerName}". Please register a provider or load @curator/plugin-llm-gemini.`);
    }
    return fallback;
  }
}
