import type { ILlmProvider } from './ILlmProvider.js';
import { GeminiLlmProvider } from './GeminiLlmProvider.js';
import { OpenAiCompatibleLlmProvider } from './OpenAiCompatibleLlmProvider.js';
import { AnthropicLlmProvider } from './AnthropicLlmProvider.js';

export class LlmFactory {
  private static providers: Map<string, ILlmProvider> = new Map<string, ILlmProvider>([
    ['gemini', new GeminiLlmProvider()],
    ['openai-compatible', new OpenAiCompatibleLlmProvider()],
    ['local', new OpenAiCompatibleLlmProvider()],
    ['anthropic', new AnthropicLlmProvider()],
  ]);

  public static getProvider(providerName?: string, baseUrl?: string): ILlmProvider {
    if (baseUrl || providerName === 'local' || providerName === 'ollama' || providerName === 'llamacpp') {
      return this.providers.get('openai-compatible')!;
    }

    if (providerName && this.providers.has(providerName.toLowerCase())) {
      return this.providers.get(providerName.toLowerCase())!;
    }

    if (process.env.ANTHROPIC_API_KEY && providerName === 'anthropic') {
      return this.providers.get('anthropic')!;
    }

    // Default to Gemini provider
    return this.providers.get('gemini')!;
  }
}
