import { AIQ as AIQType, ItemProxyType, resourceProxy } from '../src/services/AIQ.js';

declare global {
  /** The primary entry point for AIQ agentic toolchains. */
  const AIQ: typeof AIQType;
  /** jQuery-style alias for AIQ. */
  const $: typeof AIQType;
  /** Internal alias for AIQ. */
  const aiq: typeof AIQType;
  /** Proxy for the current item in a foreach/onItemExtracted loop. */
  const item: ItemProxyType;
  /** Proxy for the primary resource in a .then() or onSuccess callback. */
  const res: typeof resourceProxy;
}
