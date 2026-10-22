import type { CuratorAstNode } from '../../../src/engine/CuratorAst.js';

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
      optionA: { type: 'Curator_Script', language: 'javascript', code: "'took A'" },
      optionB: { type: 'Curator_Script', language: 'javascript', code: "'took B'" }
    },
    defaultRoute: 'optionA'
  };
}
