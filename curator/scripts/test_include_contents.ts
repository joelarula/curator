import type { CuratorSequentialNode } from '../src/engine/CuratorAst.js';

export function run(): CuratorSequentialNode {
  return {
    type: 'Curator_Sequential',
    name: 'Test Include Contents',
    subAgents: [
      {
        type: 'Curator_Agent',
        instruction: 'You are a helpful assistant. Be concise. Reply with exactly what you are told.',
        prompt: 'Hi! My name is Alice. Acknowledge this fact.',
      },
      {
        type: 'Curator_Agent',
        prompt: 'What is my name? (Respond with just the name if you know it, otherwise say "I do not know").',
      },
      {
        type: 'Curator_Agent',
        prompt: 'What is my name? (Respond with just the name if you know it, otherwise say "I do not know").',
        include_contents: 'none',
      }
    ]
  };
}
