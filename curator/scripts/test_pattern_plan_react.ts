import type { CuratorSequentialNode } from '../src/engine/CuratorAst.js';

/**
 * Expressing a Plan-ReAct Planner using existing Curator nodes.
 * 
 * In this pattern, we use a `Curator_Sequential` node to chain two agents:
 * 1. The Planner: Analyzes the initial task and outputs a structured step-by-step plan.
 * 2. The Executor (ReAct): Takes the planner's output and uses tools in a ReAct loop to solve it.
 */
export function run(): CuratorSequentialNode {
  return {
    type: 'Curator_Sequential',
    name: 'Plan-ReAct Execution',
    subAgents: [
      {
        type: 'Curator_SetState',
        state: { 
          task: "Research the current weather in Tokyo and then calculate what the temperature is in Fahrenheit." 
        }
      },
      // 1. Planner Agent
      {
        type: 'Curator_Agent',
        agentName: 'planner_agent',
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        instruction: 'You are an expert planner. Create a step-by-step plan to solve the given task.',
        prompt: 'Task: {task}. Please output a JSON plan.',
        output_schema: {
          type: "object",
          properties: {
            "steps": { 
              type: "array", 
              items: { type: "string", description: "A specific action step to take." } 
            }
          },
          required: ["steps"]
        }
      },
      // 2. Executor Agent (ReAct)
      {
        type: 'Curator_Agent',
        agentName: 'executor_agent',
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        // By adding tools, this node automatically becomes a ReAct agent under the hood!
        // It will loop up to 10 times to fulfill the steps it was given.
        tools: ['web_scraper', 'process_feed'], 
        instruction: 'You are an execution agent. You have been given a plan. Use your tools to execute each step of the plan and synthesize the final answer.',
        // Because this is in a Sequential node, the `input_schema` ensures we receive the JSON from the previous step.
        // The prompt guides the agent to read the JSON string passed into `context.input` from the Planner.
        prompt: 'Here is your plan (passed from the planner):\n\n{context.input}\n\nExecute all steps and provide the final result.'
      }
    ]
  };
}
