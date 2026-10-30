import type { SemanticNodeShape } from '../services/SemanticSchemaEngine.js';
import type { CuratorAgentDefinition, CuratorConfig, CuratorPluginDefinition, CuratorReducer, CuratorRoleDefinition, CuratorScriptDefinition } from './CuratorContracts.js';
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
import YAML from 'yaml';
import { LlmFactory } from './llm/LlmFactory.js';
import { extendCoffeeAstVerbs } from './CoffeeVerbs.js';
import { NodeRegistry } from './nodes/NodeRegistry.js';
import { OutputFormats } from './output/OutputFormats.js';
import type { MaintenanceSystem, ServiceKey } from './nodes/NodeHandler.js';

export type CuratorPlugin = CuratorPluginDefinition;

const isPlainObject = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** Deep merge of plain objects (arrays and scalars are replaced); `over` wins. */
export function mergeConfig(base: CuratorConfig, over: CuratorConfig | undefined): CuratorConfig {
  if (!over) return base;
  const out: CuratorConfig = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? mergeConfig(out[k], v) : v;
  }
  return out;
}

/** Freezes a configuration object and everything in it, so workflows can read it but never change it. */
export function freezeConfig<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const child of Object.values(v as any)) freezeConfig(child);
  }
  return v;
}

/** Scope a tool name is resolved in (the running request's project). */
export interface ToolResolveScope {
  projectId?: string | number | null;
}

/** Maps a name that is not a registered tool key (e.g. a project-scoped alias) to a tool, or undefined. */
export type ToolResolver = (name: string, scope: ToolResolveScope) => CuratorTool | undefined;

/** A tool as visible in a scope: `name` is what workflows/agents use (an alias for scoped tools). */
export interface ScopedTool {
  name: string;
  tool: CuratorTool;
}

/** Lists the aliases a resolver answers for in a scope (enables patterns like `mcp.crm.*`). */
export type ToolLister = (scope: ToolResolveScope) => ScopedTool[];

/** `*` matches any run of characters; everything else is literal. */
function globToRegExp(pattern: string): RegExp {
  return new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
}

export class CuratorEngine {
  public tools = new Map<string, CuratorTool>();
  private toolResolvers: ToolResolver[] = [];
  private toolListers: ToolLister[] = [];
  public toolPlugins = new Map<string, string>();
  public reducers = new Map<string, CuratorReducer>();
  public models = new Map<string, SemanticNodeShape>();
  public scripts = new Map<string, CuratorScriptDefinition>();
  public agents = new Map<string, CuratorAgentDefinition | CuratorAstNode>();
  public roles = new Map<string, CuratorRoleDefinition>();
  /** Plugin node types; processors fall back to these after their own handlers. */
  public nodes = new NodeRegistry();
  /** Plugin services by key (identity), reached from handlers with `ctx.service(key)`. */
  public services = new Map<ServiceKey<any>, any>();
  /** Plugin maintenance systems, run after each processor's own ones. */
  public maintenanceSystems: MaintenanceSystem[] = [];
  /** Output formatters and tool output rules (plugin `formatters` / `toolOutput`). */
  public output = new OutputFormats();
  public plugins: CuratorPlugin[] = [];
  /**
   * What workflows read as `$config`, lowest layer first: script defaults (module `config`, front matter
   * `config:`), plugin `config`, host settings. Frozen; replaced on every change.
   */
  public config: CuratorConfig = freezeConfig({});
  private scriptConfig: CuratorConfig = {};
  private pluginConfig: CuratorConfig = {};
  private hostConfig: CuratorConfig = {};

  /** Host settings (e.g. from a config file), merged over script and plugin defaults whenever they register. */
  public setConfig(values: CuratorConfig) {
    this.hostConfig = mergeConfig(this.hostConfig, structuredClone(values));
    this.refreshConfig();
  }

  private refreshConfig() {
    this.config = freezeConfig(mergeConfig(mergeConfig(this.scriptConfig, this.pluginConfig), this.hostConfig));
  }

  private addScriptConfig(config: unknown) {
    if (isPlainObject(config)) this.scriptConfig = mergeConfig(this.scriptConfig, structuredClone(config));
  }

  public registerPlugin(plugin: CuratorPlugin) {
    this.plugins.push(plugin);
    console.log(`[CuratorEngine] Registering plugin: ${plugin.name}`);

    if (plugin.tools) {
      const toolEntries = Array.isArray(plugin.tools)
        ? plugin.tools.map((t) => [t.name, t] as [string, any])
        : Object.entries(plugin.tools);

      toolEntries.forEach(([k, v]) => {
        this.tools.set(k, v);
        this.toolPlugins.set(k, plugin.name);
      });
    }
    if (plugin.reducers) {
      Object.entries(plugin.reducers).forEach(([k, v]) => this.reducers.set(k, v));
    }
    for (const [name, formatter] of Object.entries(plugin.formatters ?? {})) this.output.registerFormatter(name, formatter);
    if (plugin.toolOutput) this.output.registerToolOutputs(plugin.toolOutput);
    if (plugin.config) {
      this.pluginConfig = mergeConfig(this.pluginConfig, structuredClone(plugin.config));
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
          this.addScriptConfig(header.config);
          this.scripts.set(name, {
            name,
            description: header.description || '',
            body: rawDef,
            run: async () => {},
          });
        } else if (rawDef && typeof rawDef === 'object') {
          const name = (rawDef as any).name || cleanFallback;
          this.addScriptConfig((rawDef as any).ast?.config);
          this.scripts.set(name, rawDef as CuratorScriptDefinition);
        }
      }
    }
    if (plugin.config || plugin.scripts) this.refreshConfig();
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
    // Services first, so a plugin's own node handlers and systems can rely on them.
    // Registering the same plugin again is a no-op for these; only a different implementation conflicts.
    for (const { key, value } of plugin.services ?? []) {
      if (this.services.has(key) && this.services.get(key) !== value) throw new Error(`[CuratorEngine] Service '${key.name}' is already provided (plugin ${plugin.name})`);
      this.services.set(key, value);
    }
    for (const handler of plugin.nodeHandlers ?? []) {
      if (this.nodes.get(handler.type) !== handler) this.nodes.register(handler);
    }
    for (const system of plugin.maintenanceSystems ?? []) {
      const existing = this.maintenanceSystems.find(s => s.name === system.name);
      if (existing === system) continue;
      if (existing) throw new Error(`[CuratorEngine] Maintenance system '${system.name}' is already registered (plugin ${plugin.name})`);
      this.maintenanceSystems.push(system);
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

  public unregisterTool(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Registers a resolver consulted when a name is not a registered tool key, and optionally a
   * lister of the aliases it serves per scope (for `listTools` patterns). Returns an unregister function.
   */
  public addToolResolver(resolver: ToolResolver, lister?: ToolLister): () => void {
    this.toolResolvers.push(resolver);
    if (lister) this.toolListers.push(lister);
    return () => {
      this.toolResolvers = this.toolResolvers.filter((r) => r !== resolver);
      if (lister) this.toolListers = this.toolListers.filter((l) => l !== lister);
    };
  }

  /**
   * Tools visible in a scope whose name matches `pattern` (`*` wildcards; no wildcard = one name).
   * Covers registered keys and resolver aliases; project-scoped tools (`origin: 'remote'`) appear
   * only under their alias in their own (or a shared) project.
   */
  public listTools(pattern: string, scope: ToolResolveScope = {}): ScopedTool[] {
    if (!pattern.includes('*')) {
      const tool = this.resolveTool(pattern, scope);
      return tool ? [{ name: pattern, tool }] : [];
    }
    const match = globToRegExp(pattern);
    const found = new Map<string, ScopedTool>();
    for (const [name, tool] of this.tools) {
      if ((tool as any).origin === 'remote') continue;
      if (match.test(name)) found.set(name, { name, tool });
    }
    for (const lister of this.toolListers) {
      for (const entry of lister(scope)) {
        if (match.test(entry.name) && !found.has(entry.name)) found.set(entry.name, entry);
      }
    }
    return [...found.values()];
  }

  /** Exact tool key first, then resolvers (e.g. `mcp.crm.lookup` → the request project's remote tool). */
  public resolveTool(name: string, scope: ToolResolveScope = {}): CuratorTool | undefined {
    const direct = this.tools.get(name);
    if (direct) return direct;
    for (const resolver of this.toolResolvers) {
      const tool = resolver(name, scope);
      if (tool) return tool;
    }
    return undefined;
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
      this.readHeaderBlock(yamlMatch[1], meta);
      return meta;
    }

    const commentYamlMatch = content.match(/^#\s*---\r?\n([\s\S]*?)\r?\n#\s*---\r?\n?/);
    if (commentYamlMatch) {
      this.readHeaderBlock(commentYamlMatch[1].replace(/^#[ \t]?/gm, ''), meta);
      return meta;
    }

    const blockMatch = content.match(/^###\r?\n([\s\S]*?)\r?\n###\r?\n?/);
    if (blockMatch) {
      this.readHeaderBlock(blockMatch[1], meta);
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

  /**
   * A header block is YAML (so it may carry nested values such as a `config:` mapping); `id` and
   * `description` stay strings. A block YAML cannot read falls back to flat `key: value` lines.
   */
  private readHeaderBlock(block: string, target: Record<string, any>): void {
    let parsed: unknown;
    try {
      parsed = YAML.parse(block);
    } catch {
      parsed = undefined;
    }
    if (!isPlainObject(parsed)) {
      this.extractHeaderKeyValues(block, target);
      return;
    }
    Object.assign(target, parsed);
    for (const key of ['id', 'description']) {
      if (target[key] != null && typeof target[key] !== 'string') target[key] = String(target[key]);
    }
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

