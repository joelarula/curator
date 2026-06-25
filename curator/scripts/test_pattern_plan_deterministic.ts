import type { CuratorSequentialNode } from '../src/engine/CuratorAst.js';

/**
 * Expressing a deterministic Plan and Execute planner.
 * 
 * 1. Planner Agent outputs a rigid JSON plan (list of tools to call).
 * 2. Script reads the JSON plan, and dynamically returns a `Curator_Sequential` node containing exact `Curator_Tool` nodes.
 * 3. The engine executes the returned AST deterministically, without a non-deterministic ReAct loop.
 */
export function run(): CuratorSequentialNode {
  return {
    type: 'Curator_Sequential',
    name: 'Deterministic Plan Execution',
    subAgents: [
      {
        type: 'Curator_SetState',
        state: { 
          task: "Scrape the homepage of https://adk.dev and then summarize the text." 
        }
      },
      // 1. Planner Agent
      {
        type: 'Curator_Agent',
        agentName: 'planner_agent',
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        instruction: 'You are an expert planner. Output a specific sequence of tools to solve the task. Your available tools are "web_scraper" and "process_feed".',
        prompt: 'Task: {task}.',
        output_schema: {
          type: "object",
          properties: {
            "steps": { 
              type: "array", 
              items: { 
                type: "object",
                properties: {
                  "toolName": { type: "string" },
                  "args": { type: "object", description: "Arguments for the tool" }
                },
                required: ["toolName", "args"]
              } 
            }
          },
          required: ["steps"]
        }
      },
      // 2. Dynamic AST Generation Script
      {
        type: 'Curator_Script',
        language: 'javascript',
        code: `(() => {
          // Parse the JSON plan from the Planner Agent
          let plan;
          try {
            plan = JSON.parse(input);
          } catch(e) {
            return { type: 'Curator_Script', code: 'return "Failed to parse plan"' };
          }

          // Build a sequential AST of deterministic tool executions
          const subAgents = plan.steps.map(step => ({
            type: 'Curator_Tool',
            toolName: step.toolName,
            parameters: step.args
          }));

          // Return the AST for the engine to execute!
          return {
            type: 'Curator_Sequential',
            name: 'Dynamically Generated Plan',
            subAgents: subAgents
          };
        })()`
      }
    ]
  };
}
