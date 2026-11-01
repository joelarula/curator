import {
  defineTool,
  type CuratorPluginDefinition,
} from '../../../../curator/dist/src/index.js';

/** Role for the demo tools; granted to the host user (REPL/CLI) by the seed. */
export const BLUEPRINT_USER_ROLE = 'blueprint_user';

// 1. Define Domain Tool
export const calculateMetricTool = defineTool({
  name: 'calculate_metric',
  description: 'Calculates performance metrics for given input parameters',
  mcp: { expose: true },
  accessLevel: 'read_only',
  requiredRole: BLUEPRINT_USER_ROLE,
  parameters: {
    type: 'object',
    properties: {
      baseValue: { type: 'number', description: 'Base input number', default: 10 },
      multiplier: { type: 'number', description: 'Multiplier factor', default: 2 },
    },
    required: ['baseValue'],
  },
  execute: async (args) => {
    const base = Number(args.baseValue ?? 10);
    const mult = Number(args.multiplier ?? 2);
    const calculated = base * mult;

    return {
      status: 'success',
      baseValue: base,
      multiplier: mult,
      calculated,
      timestamp: new Date().toISOString(),
    };
  },
});

export const blueprintSpeechTool = defineTool({
  name: 'blueprint_speech',
  description: 'Handles human speech and ambient dialogue within the Blueprint MiniApp',
  mcp: { expose: true },
  accessLevel: 'read_only',
  requiredRole: BLUEPRINT_USER_ROLE,
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string' },
    },
    required: ['text'],
  },
  execute: async (args) => {
    const text = String(args.text || '');
    return {
      status: 'received',
      text,
      echo: `Blueprint received: "${text}"`,
      timestamp: new Date().toISOString(),
    };
  },
});

// 2. Assemble Domain Plugin with Tools for Seeding
export const demoPlugin: CuratorPluginDefinition = {
  name: 'blueprint-demo',
  description: 'Sample domain plugin showcasing tool registration for Curator MiniApps',
  mcp: { exposeAll: true },
  roles: [{ name: BLUEPRINT_USER_ROLE, description: 'Runs the blueprint demo tools' }] as any,
  defaultUserRoles: [BLUEPRINT_USER_ROLE],
  tools: {
    calculate_metric: calculateMetricTool,
    blueprint_speech: blueprintSpeechTool,
  },
};
