import type { CuratorSequentialNode } from '../../../src/engine/CuratorAst.js';

export function run(): CuratorSequentialNode {
  return {
    type: 'Curator_Sequential',
    name: 'Human-in-the-loop Test',
    subAgents: [
      {
        type: 'Curator_Script',
        language: 'javascript',
        code: `(() => {
          console.log('Script 1: Pre-processing...');
          return JSON.stringify({ status: 'pre-processed' });
        })()`
      },
      {
        type: 'Curator_HumanInput',
        prompt: 'Please enter your approval code:',
        inputType: 'text',
        as: 'code'
      },
      {
        type: 'Curator_Tool',
        toolName: 'echo',
        args: { text: '$state.code' }
      }
    ]
  };
}


