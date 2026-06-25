import type { CuratorSequentialNode } from '../src/engine/CuratorAst.js';

export function run(): CuratorSequentialNode {
  return {
    type: 'Curator_Sequential',
    name: 'Interpolation and Schema Test',
    subAgents: [
      {
        type: 'Curator_SetState',
        state: { userTarget: 'Master Curator', limit: 42 }
      },
      {
        type: 'Curator_Script',
        language: 'javascript',
        code: `(() => {
          return JSON.stringify({ name: "Testing Entity" });
        })()`
      },
      {
        type: 'Curator_Agent',
        agentName: 'interpolation_agent',
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        instruction: 'You are an {userTarget}. Please process the data and output valid JSON.',
        prompt: 'Return a greeting. The limit is {limit}. If this is missing: {missingVar?} then ignore it. Optional artifact: {artifact.missingDoc?}. Please respond based on the input schema data.',
        input_schema: {
          type: "object",
          properties: {
            "name": { type: "string" }
          },
          required: ["name"]
        },
        output_schema: {
          type: "object",
          properties: {
            "greeting": { type: "string" },
            "limitUsed": { type: "number" }
          },
          required: ["greeting", "limitUsed"]
        }
      }
    ]
  };
}
