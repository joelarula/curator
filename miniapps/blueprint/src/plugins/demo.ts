import {
  defineTool,
  CuratorBuilder,
  type CuratorPluginDefinition,
} from '../../../../curator/dist/src/index.js';

// 1. Define Domain Tool
export const calculateMetricTool = defineTool({
  name: 'calculate_metric',
  description: 'Calculates performance metrics for given input parameters',
  mcp: { expose: true },
  accessLevel: 'read_only',
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

// 2. Define Interactive Dialog Loop & Playground AST Workflow
export const dialogPlaygroundWorkflow = CuratorBuilder.seq(
  'dialog_playground_seq',
  CuratorBuilder.setState({
    active: true,
    turn: 1,
  }),
  CuratorBuilder.whileLoop(
    (ctx) => ctx.state?.active !== false,
    CuratorBuilder.seq(
      'dialog_turn_seq',
      // Prompt user for input
      CuratorBuilder.humanInput('💬 [Curator Playground] Enter calculation or command (type "exit" to quit):', 'text'),
      // Check for exit
      CuratorBuilder.ifElse(
        (ctx) => {
          const input = String(ctx.input || '').trim().toLowerCase();
          return input === 'exit' || input === 'quit';
        },
        CuratorBuilder.setState({ active: false }),
        // Execute turn calculation & state update
        CuratorBuilder.seq(
          'turn_exec_seq',
          CuratorBuilder.tool('calculate_metric', {
            baseValue: (ctx) => {
              const num = parseFloat(ctx.input);
              return isNaN(num) ? 10 * (ctx.state?.turn || 1) : num;
            },
            multiplier: 3,
          }),
          CuratorBuilder.assign('state.turn', (ctx) => (ctx.state?.turn || 1) + 1)
        )
      )
    )
  )
);

// 3. Define CoffeeScript Script Workflow
export const coffeeScriptWorkflow = CuratorBuilder.seq(
  'coffee_metric_seq',
  CuratorBuilder.script(`
    # CoffeeScript Data Transformer
    inputData = if typeof input is 'string' then JSON.parse(input) else (input ? {})
    base = Number(inputData.baseValue ? 25)
    mult = Number(inputData.multiplier ? 4)
    
    {
      engine: "coffeescript"
      baseValue: base
      multiplier: mult
      result: base * mult
      computedAt: new Date().toISOString()
    }
  `, 'coffeescript')
);

// 4. Assemble Domain Plugin with Tools and Agents for Seeding
export const demoPlugin: CuratorPluginDefinition = {
  name: 'blueprint-demo',
  description: 'Sample domain plugin showcasing tool and agent registration for Curator MiniApps',
  mcp: { exposeAll: true },
  tools: {
    calculate_metric: calculateMetricTool,
  },
  agents: {
    // A. Direct Tool Workflow
    metric_calculator: {
      description: 'Scheduled metric calculation workflow',
      schedule: '0 * * * *',
      enabled: false,
      ast: {
        type: 'Curator_Tool',
        toolName: 'calculate_metric',
        args: { baseValue: 50, multiplier: 3 },
      },
    },

    // B. Interactive Dialog Loop Script Agent
    dialog_playground: {
      description: 'Interactive Dialog Loop & Script Playground Agent',
      schedule: '0 * * * *',
      enabled: false,
      ast: dialogPlaygroundWorkflow,
    },

    // C. CoffeeScript AST Script Agent
    coffee_evaluator: {
      description: 'CoffeeScript Evaluation Script Agent',
      schedule: '0 * * * *',
      enabled: false,
      ast: coffeeScriptWorkflow,
    },
  },
};
