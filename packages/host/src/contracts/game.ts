import type { CuratorAppManifest } from './manifest.js';
import type { CuratorToolContract } from './tools.js';
import type { CuratorReducerContract } from './reducers.js';

/**
 * Standard declaration contract for a MiniGame.
 */
export interface MiniGameContract {
  readonly manifest: CuratorAppManifest;
  readonly roles?: readonly string[] | Record<string, string>;
  readonly reducers?: readonly (CuratorReducerContract<any, any> | any)[];
  readonly tools?: readonly (CuratorToolContract<any, any> | any)[];
  readonly events?: readonly any[];
  readonly commands?: readonly string[];
}

/**
 * Helper to define and validate a MiniGame contract with compile-time type-safety.
 */
export function defineMiniGame<T extends MiniGameContract>(definition: T): T {
  if (!definition?.manifest?.id) {
    throw new Error('MiniGame definition requires a valid manifest.id');
  }
  return definition;
}
