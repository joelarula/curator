import type { CuratorSequentialNode } from '../src/engine/CuratorAst.js';

export function run(): CuratorSequentialNode {
  return {
    type: 'Curator_Sequential',
    name: 'Scheduling Test Agent',
    subAgents: [
      {
        type: 'Curator_Agent',
        prompt: 'Use the schedule_agent tool to schedule a task named "my_test_task" that runs "example_workflow" every 10 seconds. Return only the result string.',
        tools: ['schedule_agent']
      },
      {
        type: 'Curator_Agent',
        prompt: 'Now cancel the task you just created using cancel_scheduled_agent. Pass either the name or the ID you received. Return only the result string.',
        tools: ['cancel_scheduled_agent']
      }
    ]
  };
}
