/**
 * VocabularyRegistry enables plugins and mini-apps to register custom
 * domain-specific composables, verbs, and speech acts into the Curator execution engine.
 */
export class VocabularyRegistry {
    constructor() {
        this.composables = new Map();
    }
    static getInstance() {
        if (!VocabularyRegistry.instance) {
            VocabularyRegistry.instance = new VocabularyRegistry();
        }
        return VocabularyRegistry.instance;
    }
    /**
     * Register a single named composable / verb.
     */
    register(name, composable) {
        this.composables.set(name, composable);
    }
    /**
     * Register a batch of composables (e.g. from a plugin).
     */
    registerMany(vocabularies) {
        for (const [name, fn] of Object.entries(vocabularies)) {
            this.composables.set(name, fn);
        }
    }
    /**
     * Look up a registered composable by name.
     */
    get(name) {
        return this.composables.get(name);
    }
    /**
     * Check if a vocabulary verb is registered.
     */
    has(name) {
        return this.composables.has(name);
    }
    /**
     * Return a dictionary of all registered composables.
     */
    getAll() {
        const res = {};
        for (const [k, v] of this.composables.entries()) {
            res[k] = v;
        }
        return res;
    }
    /**
     * Reset registry (mainly for test isolation).
     */
    clear() {
        this.composables.clear();
    }
}
export const vocabularyRegistry = VocabularyRegistry.getInstance();
