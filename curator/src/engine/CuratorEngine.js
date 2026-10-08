import { LlmFactory } from './llm/LlmFactory.js';
export class CuratorEngine {
    tools = new Map();
    models = new Map();
    scripts = new Map();
    agents = new Map();
    plugins = [];
    registerPlugin(plugin) {
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
        if (plugin.llmProviders) {
            Object.entries(plugin.llmProviders).forEach(([k, v]) => {
                LlmFactory.registerProvider(k, v);
            });
        }
        if (typeof plugin.onInit === 'function') {
            try {
                const res = plugin.onInit({ engine: this });
                if (res instanceof Promise) {
                    res.catch((err) => console.error(`[CuratorEngine] Error in plugin.onInit (${plugin.name}):`, err));
                }
            }
            catch (err) {
                console.error(`[CuratorEngine] Error in plugin.onInit (${plugin.name}):`, err);
            }
        }
    }
    registerLlmProvider(name, provider) {
        LlmFactory.registerProvider(name, provider);
    }
    registerTool(tool) {
        this.tools.set(tool.name, tool);
    }
    isAgentEnabled(nameOrDef) {
        const agent = typeof nameOrDef === 'string' ? this.agents.get(nameOrDef) : nameOrDef;
        if (!agent)
            return false;
        return agent.enabled === true || agent.isActive === true;
    }
    getActiveAgents() {
        const active = [];
        for (const [name, definition] of this.agents.entries()) {
            if (this.isAgentEnabled(definition)) {
                active.push({ name, definition });
            }
        }
        return active;
    }
    getScheduledAgents() {
        const scheduled = [];
        for (const [name, definition] of this.agents.entries()) {
            const def = definition;
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
    async generateContent(req) {
        const provider = LlmFactory.getProvider(req.provider || 'gemini');
        return provider.generateContent(req);
    }
    async embed(text, options = {}) {
        const provider = LlmFactory.getProvider(options.provider || 'gemini');
        if (!provider.embedContent) {
            throw new Error(`[CuratorEngine] Provider '${provider.providerName}' does not support embeddings.`);
        }
        return provider.embedContent({
            text,
            ...options,
        });
    }
    async createContextCache(options) {
        const provider = LlmFactory.getProvider(options.provider || 'gemini');
        if (!provider.createContextCache) {
            throw new Error(`[CuratorEngine] Provider '${provider.providerName}' does not support context caching.`);
        }
        return provider.createContextCache(options);
    }
    async deleteContextCache(name, options = {}) {
        const provider = LlmFactory.getProvider(options.provider || 'gemini');
        if (!provider.deleteContextCache) {
            throw new Error(`[CuratorEngine] Provider '${provider.providerName}' does not support context caching deletion.`);
        }
        return provider.deleteContextCache(name, options.apiKey);
    }
}
// Singleton registry instance
export const curatorEngine = new CuratorEngine();
//# sourceMappingURL=CuratorEngine.js.map