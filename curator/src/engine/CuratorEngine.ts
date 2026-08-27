import type { SemanticNodeShape } from '../services/SemanticSchemaEngine.js';
import type { CuratorAgentDefinition, CuratorPluginDefinition, CuratorScriptDefinition } from './CuratorContracts.js';
import type { CuratorTool } from '../tools/CuratorTool.js';

export type CuratorPlugin = CuratorPluginDefinition;

export class CuratorEngine {
  public tools = new Map<string, CuratorTool>();
  public models = new Map<string, SemanticNodeShape>();
  public scripts = new Map<string, CuratorScriptDefinition>();
  public agents = new Map<string, CuratorAgentDefinition | import('./CuratorAst.js').CuratorAstNode>();
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
}

// Singleton registry instance
export const curatorEngine = new CuratorEngine();
