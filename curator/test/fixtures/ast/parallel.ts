import type { CuratorParallelNode } from '../src/engine/CuratorAst.js';

export function run(): CuratorParallelNode {
  return {
    type: 'Curator_Parallel',
    name: 'ParallelResearch',
    prompt: 'Investigate the market trends for 2027.',
    subAgents: [
      {
        type: 'Curator_Script',
        language: 'javascript',
        code: `(() => {
          console.log('📈 Finance Agent researching economic trends...');
          return JSON.stringify({ section: 'Finance', content: 'Interest rates are expected to stabilize.' });
        })()`
      },
      {
        type: 'Curator_Script',
        language: 'javascript',
        code: `(() => {
          console.log('💻 Tech Agent researching technology trends...');
          return JSON.stringify({ section: 'Tech', content: 'AI adoption will reach 80% across enterprises.' });
        })()`
      },
      {
        type: 'Curator_Script',
        language: 'javascript',
        code: `(() => {
          console.log('🌍 Environment Agent researching sustainability...');
          return JSON.stringify({ section: 'Environment', content: 'Green energy investments will double.' });
        })()`
      }
    ]
  };
}
