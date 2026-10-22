import type { CuratorAstNode } from '../src/engine/CuratorAst.js';

export function run(): CuratorAstNode {
  return {
    type: 'Curator_Route',
    name: 'Test Router',
    router: {
      type: 'Curator_Script',
      language: 'javascript',
      code: "'optionB'"
    },
    subAgents: {
      optionA: {
        type: 'Curator_Agent',
        prompt: 'You are an AI. Say: "I took Option A!"'
      },
      optionB: {
        type: 'Curator_Agent',
        prompt: 'You are an AI. Say: "I took Option B!"'
      }
    },
    defaultRoute: 'optionA'
  };
}
