import type { CuratorSequentialNode } from '../src/engine/CuratorAst.js';

export function run(): CuratorSequentialNode {
  return {
    type: 'Curator_Sequential',
    name: 'Human-in-the-Loop Example',
    subAgents: [
      {
        type: 'Curator_Agent',
        prompt: 'Generate a creative 2-sentence story about a cat.',
      },
      {
        type: 'Curator_HumanInput',
        prompt: 'Review the story. What should the cat do next?',
        inputType: 'text'
      },
      {
        type: 'Curator_Agent',
        prompt: "Continue the story based on the human's suggestion: {context.input}",
      }
    ]
  };
}
