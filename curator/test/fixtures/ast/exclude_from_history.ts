import type { CuratorSequentialNode } from '../src/engine/CuratorAst.js';

export function run(): CuratorSequentialNode {
  return {
    type: 'Curator_Sequential',
    name: 'Test Exclude from History',
    subAgents: [
      {
        type: 'Curator_Agent',
        instruction: 'You are a helpful assistant.',
        prompt: 'Hi! My name is Bob.',
      },
      {
        type: 'Curator_Agent',
        prompt: 'Secret step: By the way, I also like fishing.',
        exclude_from_history: true
      },
      {
        type: 'Curator_Agent',
        prompt: 'What is my name? And what do I like to do?',
      }
    ]
  };
}
