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
  isAgentEnabled(nameOrDef) {
    const agent = typeof nameOrDef === 'string' ? this.agents.get(nameOrDef) : nameOrDef;
    if (!agent) return false;
    return agent.enabled === true || agent.isActive === true;
  },
  getActiveAgents() {
    const active = [];
    for (const [name, definition] of this.agents.entries()) {
      if (this.isAgentEnabled(definition)) {
        active.push({ name, definition });
      }
    }
    return active;
  },
};

export async function registerKeerisPlugins({ db } = {}) {
  if (registered) return localEngine;
  let engine = localEngine;
  try {
    const { curatorEngine, corePlugin, semanticShapesPlugin } = await import('@curator/agent-server');
    engine = curatorEngine;
    curatorEngine.registerPlugin(corePlugin);
    curatorEngine.registerPlugin(semanticShapesPlugin);
  } catch (error) {
    console.warn(`[Keeris] Curator runtime unavailable; continuing with local plugins: ${error.message}`);
  }
  const errRadioPlugin = createErrRadioPlugin(db);
  localEngine.registerPlugin(keerisDomainPlugin);
  localEngine.registerPlugin(errRadioPlugin);
  if (engine !== localEngine) {
    engine.registerPlugin(keerisDomainPlugin);
    engine.registerPlugin(errRadioPlugin);
  }
  registered = true;
  return engine;
}