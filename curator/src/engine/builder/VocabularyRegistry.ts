import type { CuratorAstNode } from '../CuratorAst.js';

export type VocabularyComposable = (...args: any[]) => CuratorAstNode | any;

/**
 * VocabularyRegistry enables plugins and mini-apps to register custom
 * domain-specific composables, verbs, and speech acts into the Curator execution engine.
 */
export class VocabularyRegistry {
  private static instance: VocabularyRegistry;
  private composables = new Map<string, VocabularyComposable>();

  static getInstance(): VocabularyRegistry {
    if (!VocabularyRegistry.instance) {
      VocabularyRegistry.instance = new VocabularyRegistry();
    }
    return VocabularyRegistry.instance;
  }

  /**
   * Register a single named composable / verb.
   */
  public register(name: string, composable: VocabularyComposable): void {
    this.composables.set(name, composable);
  }

  /**
   * Register a batch of composables (e.g. from a plugin).
   */
  public registerMany(vocabularies: Record<string, VocabularyComposable>): void {
    for (const [name, fn] of Object.entries(vocabularies)) {
      this.composables.set(name, fn);
    }
  }

  /**
   * Look up a registered composable by name.
   */
  public get(name: string): VocabularyComposable | undefined {
    return this.composables.get(name);
  }

  /**
   * Check if a vocabulary verb is registered.
   */
  public has(name: string): boolean {
    return this.composables.has(name);
  }

  /**
   * Return a dictionary of all registered composables.
   */
  public getAll(): Record<string, VocabularyComposable> {
    const res: Record<string, VocabularyComposable> = {};
    for (const [k, v] of this.composables.entries()) {
      res[k] = v;
    }
    return res;
  }

  /**
   * Reset registry (mainly for test isolation).
   */
  public clear(): void {
    this.composables.clear();
  }
}

export const vocabularyRegistry = VocabularyRegistry.getInstance();
