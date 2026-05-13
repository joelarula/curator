import { Curator as AIQType, ItemProxyType, resourceProxy } from '../src/services/Curator.js';

declare global {
  /** The primary entry point for Curator agentic toolchains. */
  const Curator: typeof AIQType;
  /** jQuery-style alias for Curator. */
  const $: typeof AIQType;
  /** Internal alias for Curator. */
  const Curator: typeof AIQType;
  /** Proxy for the current item in a foreach/onItemExtracted loop. */
  const item: ItemProxyType;
  /** Proxy for the primary resource in a .then() or onSuccess callback. */
  const res: typeof resourceProxy;
}
