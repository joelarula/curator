import { errRadioWasmPlugin } from './err-radio';
import { keerisDomainWasmPlugin } from './keeris-domain';
import type { WasmPlugin } from '../types';

export { errRadioWasmPlugin } from './err-radio';
export { keerisDomainWasmPlugin, buildAgentAst } from './keeris-domain';

/**
 * Register all Keeris domain plugins (tools and agents) into the WASM engine.
 */
export function registerKeerisWasmPlugins(engine: { registerPlugin: (plugin: WasmPlugin) => void }): void {
  engine.registerPlugin(errRadioWasmPlugin);
  engine.registerPlugin(keerisDomainWasmPlugin);
}
