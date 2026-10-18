import type { SemanticNodeShape } from '../services/SemanticSchemaEngine.js';
import type { CuratorAgentDefinition, CuratorPluginDefinition, CuratorRoleDefinition, CuratorScriptDefinition } from './CuratorContracts.js';
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
import { extendCoffeeAstVerbs } from './CoffeeVerbs.js';

export type CuratorPlugin = CuratorPluginDefinition;

export class CuratorEngine {
  public tools = new Map<string, CuratorTool>();
  public toolPlugins = new Map<string, string>();
  public models = new Map<string, SemanticNodeShape>();
  public scripts = new Map<string, CuratorScriptDefinition>();
  public agents = new Map<string, CuratorAgentDefinition | CuratorAstNode>();
  public roles = new Map<string, CuratorRoleDefinition>();
  public plugins: CuratorPlugin[] = [];

  public registerPlugin(plugin: CuratorPlugin) {
    this.plugins.push(plugin);
    console.log(`[CuratorEngine] Registering plugin: ${plugin.name}`);

    if (plugin.tools) {
      Object.entries(plugin.tools).forEach(([k, v]) => {
        this.tools.set(k, v);
        this.toolPlugins.set(k, plugin.name);
      });
    }
    if (plugin.models) {
      plugin.models.forEach(m => this.models.set(m.uri, m));
    }
    if (plugin.scripts) {
      const scriptEntries = Array.isArray(plugin.scripts)
        ? plugin.scripts.map((content) => ['', content] as [string, any])
        : Object.entries(plugin.scripts);

      for (const [k, rawDef] of scriptEntries) {
        const cleanFallback = k ? k.replace(/\.[^/.]+$/, '') : '';
        if (typeof rawDef === 'string') {
          const header = this.parseScriptHeader(rawDef, cleanFallback);
          const name = header.id || cleanFallback;
          this.scripts.set(name, {
            name,
            description: header.description || '',
            body: rawDef,
            run: async () => {},
          });
        } else if (rawDef && typeof rawDef === 'object') {
          const name = (rawDef as any).name || cleanFallback;
          this.scripts.set(name, rawDef as CuratorScriptDefinition);
        }
      }
    }
    if (plugin.agents) {
      Object.entries(plugin.agents).forEach(([k, v]) => this.agents.set(k, v));
    }
    if (plugin.roles) {
      const roleEntries = Array.isArray(plugin.roles)
        ? plugin.roles.map((r) => [r.name, r] as [string, CuratorRoleDefinition])
        : Object.entries(plugin.roles);
      for (const [name, def] of roleEntries) {
        this.roles.set(name, def);
      }
    }
    if (plugin.llmProviders) {
      Object.entries(plugin.llmProviders).forEach(([k, v]) => {
        LlmFactory.registerProvider(k, v);
      });
    }
    if (plugin.vocabularies) {
      extendCoffeeAstVerbs(plugin.vocabularies);
    }
    if (typeof plugin.onInit === 'function') {
      try {
        const res = plugin.onInit({ engine: this });
        if (res instanceof Promise) {
          res.catch((err) => console.error(`[CuratorEngine] Error in plugin.onInit (${plugin.name}):`, err));
        }
      } catch (err) {
        console.error(`[CuratorEngine] Error in plugin.onInit (${plugin.name}):`, err);
      }
    }
  }

  public registerLlmProvider(name: string, provider: any) {
    LlmFactory.registerProvider(name, provider);
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

  private parseScriptHeader(content: string, fallbackId: string = ''): { id: string; description?: string; [key: string]: any } {
    const cleanFallback = fallbackId ? fallbackId.replace(/\.[^/.]+$/, '') : '';
    const meta: { id: string; description?: string; [key: string]: any } = { id: cleanFallback };

    const yamlMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (yamlMatch) {
      this.extractHeaderKeyValues(yamlMatch[1], meta);
      return meta;
    }

    const commentYamlMatch = content.match(/^#\s*---\r?\n([\s\S]*?)\r?\n#\s*---\r?\n?/);
    if (commentYamlMatch) {
      this.extractHeaderKeyValues(commentYamlMatch[1], meta);
      return meta;
    }

    const blockMatch = content.match(/^###\r?\n([\s\S]*?)\r?\n###\r?\n?/);
    if (blockMatch) {
      this.extractHeaderKeyValues(blockMatch[1], meta);
      return meta;
    }

    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('#')) break;
      const stripped = trimmed.replace(/^#+\s*/, '').trim();
      const match = stripped.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
      if (match) {
        meta[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
      }
    }

    return meta;
  }

  private extractHeaderKeyValues(block: string, target: Record<string, any>): void {
    const lines = block.split('\n');
    for (const line of lines) {
      const trimmed = line.trim().replace(/^#+\s*/, '');
      if (!trimmed || trimmed === '---') continue;
      const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
      if (match) {
        target[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
      }
    }
  }
}

// Singleton registry instance with global cross-module isolation guarantee
const GLOBAL_CURATOR_ENGINE_KEY = Symbol.for('curator.engine.instance');
export const curatorEngine: CuratorEngine =
  (globalThis as any)[GLOBAL_CURATOR_ENGINE_KEY] ||
  ((globalThis as any)[GLOBAL_CURATOR_ENGINE_KEY] = new CuratorEngine());

