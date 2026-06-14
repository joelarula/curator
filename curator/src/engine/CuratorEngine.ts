import type { SemanticNodeShape } from '../services/SemanticSchemaEngine.js';

export interface CuratorPlugin {
  name: string;
  tools?: Record<string, any>; 
  models?: SemanticNodeShape[]; 
  scripts?: Record<string, { run: (context: any) => Promise<any> }>; 
}

export class CuratorEngine {
  public tools = new Map<string, any>();
  public models = new Map<string, SemanticNodeShape>();
  public scripts = new Map<string, any>();
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
  }
}

// Singleton registry instance
export const curatorEngine = new CuratorEngine();
