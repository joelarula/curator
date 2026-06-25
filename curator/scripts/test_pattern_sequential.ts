import type { CuratorSequentialNode } from '../src/engine/CuratorAst.js';

export function run(): CuratorSequentialNode {
  return {
    type: 'Curator_Sequential',
    name: 'SequentialPipeline',
    prompt: 'Write an article about the future of AI agents.',
    subAgents: [
      {
        type: 'Curator_Script',
        language: 'javascript',
        code: `(() => {
          console.log('📚 Researcher Agent gathering facts...');
          return JSON.stringify({ facts: ['AI will be autonomous', 'Agents will collaborate'] });
        })()`
      },
      {
        type: 'Curator_Script',
        language: 'javascript',
        code: `(() => {
          console.log('✍️ Writer Agent drafting article based on context...');
          // In a real agent, it would use context.input (the merged state from the previous node)
          return JSON.stringify({ draft: 'The future of AI is collaborative autonomy.' });
        })()`
      },
      {
        type: 'Curator_Script',
        language: 'javascript',
        code: `(() => {
          console.log('🔍 Editor Agent polishing draft...');
          return JSON.stringify({ final_article: 'The future of AI is collaborative autonomy. It will revolutionize workflows.' });
        })()`
      }
    ]
  };
}
