import type { WasmPlugin } from '../types';
import {
  RADIO_PROGRAMS,
  buildSingleScrapeAST,
  buildAgentAst,
} from '../../src/plugins/manifest';

export { buildAgentAst };

export const keerisDomainWasmPlugin: WasmPlugin = {
  name: 'keeris-domain',
  agents: Object.fromEntries(
    Object.entries(RADIO_PROGRAMS).map(([id, def]) => [
      id,
      {
        ...def,
        ast: buildSingleScrapeAST(def),
      },
    ])
  ),
};
