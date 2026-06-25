import { PrismaClient } from '@prisma/client';
import type { CuratorSequentialNode } from '../src/engine/CuratorAst.js';
import { curatorContext } from '../src/engine/CuratorContext.js';

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
        inputType: 'text'
      },
      {
        type: 'Curator_Script',
        language: 'javascript',
        code: `(() => {
          let state = {};
          try { state = JSON.parse(input); } catch(e) {}
          console.log('Script 2: Post-processing...');
          console.log('Received Human Approval Code:', state.output);
          return JSON.stringify({ status: 'post-processed', approval: state.output });
        })()`
      }
    ]
  };
}


