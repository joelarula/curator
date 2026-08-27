import type { CuratorPlugin } from '../../engine/CuratorEngine.js';
import { toolRegistry } from '../../tools/index.js';

import { example_workflow } from './workflows/example_workflow.js';

export const corePlugin: CuratorPlugin = {
  name: 'core',
  tools: toolRegistry,
  scripts: {
    // Whitelisted scripts for scheduled Agent execution are mapped here.
    // e.g. 'weather_fetcher': await import('../../scripts/weather.js')
  },
  agents: {
    'example_workflow': example_workflow
  }
};
