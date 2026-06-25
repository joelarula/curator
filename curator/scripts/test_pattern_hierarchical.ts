import type { CuratorSequentialNode } from '../src/engine/CuratorAst.js';

export function run(): CuratorSequentialNode {
  return {
    type: 'Curator_Sequential',
    name: 'HierarchicalPipeline',
    prompt: 'Process the nested workflow.',
    subAgents: [
      {
        type: 'Curator_Script',
        language: 'javascript',
        code: `(() => {
          console.log('🌟 Top-level Workflow: Step 1 executing...');
          return JSON.stringify({ topLevelStep1: 'success' });
        })()`
      },
      // Call the reusable workflow registered in the DB
      {
        type: 'Curator_AgentRef',
        agentName: 'example_workflow'
      } as any,
      {
        type: 'Curator_Script',
        language: 'javascript',
        code: `(() => {
          console.log('🌟 Top-level Workflow: Step 2 executing...');
          return JSON.stringify({ topLevelStep2: 'success' });
        })()`
      }
    ]
  };
}
