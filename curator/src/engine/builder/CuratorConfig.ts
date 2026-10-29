import { createContextProxy, type TypedPathProxy } from './CuratorProxy.js';

/**
 * Typed handle on a configuration namespace (`$config.<namespace>`): use it in conditions, args, emit
 * payloads and prompt templates like any other path. Values come from plugin `config` defaults and the
 * host's `engine.setConfig(...)`; workflows can read them but never change them.
 */
export function defineConfig<T = any>(namespace: string): TypedPathProxy<T> {
  return createContextProxy<T>(`$config.${namespace}`);
}
