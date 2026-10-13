import { LLAMA_TOOL_DEFINITIONS } from './LlamaToolRegistry.js';
import * as llamaApi from './llamaCppApi.js';

export * from './llamaCppApi.js';
export * from './LlamaToolRegistry.js';

export function llamaPlugin() {
  const tools: Record<string, any> = {};
  for (const def of LLAMA_TOOL_DEFINITIONS) {
    tools[def.name] = def;
  }

  return {
    name: 'llama',
    version: '1.0.0',
    description: 'Curator llama.cpp REST and inference tools plugin',
    tools,
    api: llamaApi,
  };
}

export default llamaPlugin;
