import { GeminiLlmProvider } from './GeminiLlmProvider.js';

export * from './GeminiLlmProvider.js';

export interface GeminiPluginOptions {
  apiKey?: string;
  defaultModel?: string;
}

export function geminiPlugin(options: GeminiPluginOptions = {}) {
  const provider = new GeminiLlmProvider(options.apiKey, options.defaultModel);
  return {
    name: 'gemini',
    version: '1.0.0',
    description: 'Google Gemini LLM provider plugin',
    llmProviders: {
      gemini: provider,
      'google-gemini': provider,
    },
    onInit: ({ engine }: any) => {
      engine.registerLlmProvider('gemini', provider);
    },
  };
}
