import { createErrRadioPlugin } from './err-radio.js';
import { keerisDomainPlugin } from './keeris-domain.js';

let registered = false;
const localEngine = {
  plugins: [],
  tools: new Map(),
  agents: new Map(),
  registerPlugin(plugin) {
    this.plugins.push(plugin);
    if (plugin.tools) {
      Object.entries(plugin.tools).forEach(([k, v]) => this.tools.set(k, v));
    }
    if (plugin.agents) {
      Object.entries(plugin.agents).forEach(([k, v]) => this.agents.set(k, v));
    }
  },
};

export async function registerKeerisPlugins({ db } = {}) {
  if (registered) return localEngine;
  let engine = localEngine;
  if (process.env.CURATOR_DATABASE_NAME) try {
    const { curatorEngine, corePlugin, semanticShapesPlugin } = await import('@curator/agent-server');
    engine = curatorEngine;
    curatorEngine.registerPlugin(corePlugin);
    curatorEngine.registerPlugin(semanticShapesPlugin);
  } catch (error) {
    console.warn(`[Keeris] Curator runtime unavailable; continuing with local plugins: ${error.message}`);
  }
  engine.registerPlugin(keerisDomainPlugin);
  engine.registerPlugin(createErrRadioPlugin(db));
  registered = true;
  return engine;
}