import { defineTool } from './CuratorTool.js';
import { getGlobalScheduler } from '../engine/ScheduledAgentScheduler.js';

export const schedule_agent = defineTool({
  name: 'schedule_agent',
  description: 'Schedules an agent to run on a recurring cron schedule OR once at a specific time in the future.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'A unique name for this scheduled task.'
      },
      workflowName: {
        type: 'string',
        description: 'The name of the workflow/agent to run (e.g. "example_workflow")'
      },
      schedule: {
        type: 'string',
        description: 'For recurring jobs: Bree/cron format (e.g., "every 1 hour", "at 8:00 am", "*/5 * * * *"). Leave empty if using runAt.'
      },
      runAt: {
        type: 'string',
        description: 'For one-shot jobs: ISO 8601 datetime string for when to run once (e.g. "2026-06-17T09:00:00Z"). If set, runOnce is implied.'
      },
      workflowParams: {
        type: 'object',
        description: 'Optional JSON payload to pass to the workflow.'
      }
    },
    required: ['name', 'workflowName']
  },
  execute: async (args, ctx) => {
    try {
      if (!ctx.prisma) {
        return 'Error: Database connection not available in tool context.';
      }

      const isOnce = !!args.runAt;
      
      if (!isOnce && !args.schedule) {
        return 'Error: Must provide either "schedule" (for recurring) or "runAt" (for one-shot).';
      }

      const scheduledAgent = await ctx.prisma.scheduledAgent.create({
        data: {
          name: args.name,
          workflowName: args.workflowName,
          schedule: isOnce ? null : args.schedule,
          runOnce: isOnce,
          runAt: isOnce ? new Date(args.runAt) : null,
          workflowParams: args.workflowParams ? JSON.stringify(args.workflowParams) : null,
          userId: ctx.userId || 1,
          isActive: true
        }
      });

      const scheduler = getGlobalScheduler();
      if (scheduler) {
        await scheduler.addAgentJob(scheduledAgent.id);
        const modeStr = isOnce
          ? `once at ${args.runAt}`
          : `recurring: "${args.schedule}"`;
        return `Successfully scheduled agent '${args.workflowName}' as '${args.name}' (${modeStr}). ID: ${scheduledAgent.id}`;
      } else {
        return `Saved schedule to database, but the scheduler is not running currently. ID: ${scheduledAgent.id}`;
      }
    } catch(e: any) {
      return 'Failed to schedule agent: ' + e.message;
    }
  }
});
