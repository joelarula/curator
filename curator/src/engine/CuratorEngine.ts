import type { SemanticNodeShape } from '../services/SemanticSchemaEngine.js';
import type { CuratorAgentDefinition, CuratorPluginDefinition, CuratorScriptDefinition } from './CuratorContracts.js';
import type { CuratorAstNode } from './CuratorAst.js';
import type { CuratorTool } from '../tools/CuratorTool.js';
import type {
  LlmRequest,
  LlmResponse,
  LlmEmbeddingRequest,
  LlmEmbeddingResponse,
  LlmCreateCacheRequest,
  LlmCacheInfo,
} from './llm/ILlmProvider.js';
import { LlmFactory } from './llm/LlmFactory.js';

export type CuratorPlugin = CuratorPluginDefinition;

export class CuratorEngine {
  public tools = new Map<string, CuratorTool>();
  public models = new Map<string, SemanticNodeShape>();
  public scripts = new Map<string, CuratorScriptDefinition>();
  public agents = new Map<string, CuratorAgentDefinition | CuratorAstNode>();
  public plugins: CuratorPlugin[] = [];

  public registerPlugin(plugin: CuratorPlugin) {
    this.plugins.push(plugin);
    console.log(`[CuratorEngine] Registering plugin: ${plugin.name}`);

    if (plugin.tools) {
      Object.entries(plugin.tools).forEach(([k, v]) => this.tools.set(k, v));
    }
    if (plugin.models) {
      plugin.models.forEach(m => this.models.set(m.uri, m));
    }
    if (plugin.scripts) {
      Object.entries(plugin.scripts).forEach(([k, v]) => this.scripts.set(k, v));
    }
    if (plugin.agents) {
      Object.entries(plugin.agents).forEach(([k, v]) => this.agents.set(k, v));
    }
  }

  public registerTool(tool: CuratorTool) {
    this.tools.set(tool.name, tool);
  }

  public isAgentEnabled(nameOrDef: string | CuratorAgentDefinition | any): boolean {
    const agent = typeof nameOrDef === 'string' ? this.agents.get(nameOrDef) : nameOrDef;
    if (!agent) return false;
    return (agent as any).enabled === true || (agent as any).isActive === true;
  }

  public getActiveAgents(): Array<{ name: string; definition: any }> {
    const active: Array<{ name: string; definition: any }> = [];
    for (const [name, definition] of this.agents.entries()) {
      if (this.isAgentEnabled(definition)) {
        active.push({ name, definition });
      }
    }
    return active;
  }

  public getScheduledAgents(): Array<{ name: string; schedule: string; enabled: boolean; definition: any }> {
    const scheduled: Array<{ name: string; schedule: string; enabled: boolean; definition: any }> = [];
    for (const [name, definition] of this.agents.entries()) {
      const def = definition as any;
      if (def.schedule) {
        scheduled.push({
          name,
          schedule: def.schedule,
          enabled: this.isAgentEnabled(def),
          definition: def,
        });
      }
    }
    return scheduled;
  }

  public async generateContent(req: LlmRequest & { provider?: string }): Promise<LlmResponse> {
    const provider = LlmFactory.getProvider(req.provider || 'gemini');
    return provider.generateContent(req);
  }

  public async embed(
    text: string | string[],
    options: Partial<LlmEmbeddingRequest> & { provider?: string } = {}
  ): Promise<LlmEmbeddingResponse> {
    const provider = LlmFactory.getProvider(options.provider || 'gemini');
    if (!provider.embedContent) {
      throw new Error(`[CuratorEngine] Provider '${provider.providerName}' does not support embeddings.`);
    }
    return provider.embedContent({
      text,
      ...options,
    });
  }

  public async createContextCache(
    options: LlmCreateCacheRequest & { provider?: string }
  ): Promise<LlmCacheInfo> {
    const provider = LlmFactory.getProvider(options.provider || 'gemini');
    if (!provider.createContextCache) {
      throw new Error(`[CuratorEngine] Provider '${provider.providerName}' does not support context caching.`);
    }
    return provider.createContextCache(options);
  }

  public async deleteContextCache(
    name: string,
    options: { provider?: string; apiKey?: string } = {}
  ): Promise<void> {
    const provider = LlmFactory.getProvider(options.provider || 'gemini');
    if (!provider.deleteContextCache) {
      throw new Error(`[CuratorEngine] Provider '${provider.providerName}' does not support context caching deletion.`);
    }
    return provider.deleteContextCache(name, options.apiKey);
  }
}

// Singleton registry instance
export const curatorEngine = new CuratorEngine();
