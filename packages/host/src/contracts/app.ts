import type { CuratorAppManifest } from './manifest.js';
import type { CuratorToolContract } from './tools.js';
import type { CuratorReducerContract } from './reducers.js';

/**
 * Standard declaration contract for a MiniApp.
 */
export interface MiniAppContract {
  readonly manifest: CuratorAppManifest;
  readonly roles?: readonly string[] | Record<string, string>;
  readonly tools?: readonly (CuratorToolContract<any, any> | any)[];
  readonly reducers?: readonly (CuratorReducerContract<any, any> | any)[];
  readonly events?: readonly any[];
}

/**
 * Helper to define and validate a MiniApp contract with compile-time type-safety.
 */
export function defineMiniApp<T extends MiniAppContract>(definition: T): T {
  if (!definition?.manifest?.id) {
    throw new Error('MiniApp definition requires a valid manifest.id');
  }
  return definition;
}

