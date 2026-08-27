import { defineTool } from './CuratorTool.js';
import { getGlobalScheduler } from '../engine/ScheduledAgentScheduler.js';
import type { Prisma } from '@prisma/client';

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

      const name = args.name;
      const workflowName = args.workflowName;
      const schedule = args.schedule;
      const runAt = args.runAt;
      if (typeof name !== 'string' || typeof workflowName !== 'string') return 'Error: name and workflowName must be strings.';
      if (schedule !== undefined && typeof schedule !== 'string') return 'Error: schedule must be a string.';
      if (runAt !== undefined && typeof runAt !== 'string') return 'Error: runAt must be an ISO datetime string.';
      const isOnce = typeof runAt === 'string' && runAt.length > 0;
      
      if (!isOnce && !schedule) {
        return 'Error: Must provide either "schedule" (for recurring) or "runAt" (for one-shot).';
      }

      const scheduledAgent = await ctx.prisma.scheduledAgent.create({
        data: {
          name,
          workflowName,
          schedule: isOnce ? null : schedule,
          runOnce: isOnce,
          runAt: isOnce ? new Date(runAt) : null,
          workflowParams: args.workflowParams === undefined ? undefined : JSON.parse(JSON.stringify(args.workflowParams)) as Prisma.InputJsonValue,
          userId: ctx.userId || 1,
          isActive: true
        }
      });

      const scheduler = getGlobalScheduler();
      if (scheduler) {
        await scheduler.addAgentJob(scheduledAgent.id);
        const modeStr = isOnce
          ? `once at ${args.runAt}`
          : `recurring: "${schedule}"`;
        return `Successfully scheduled agent '${workflowName}' as '${name}' (${modeStr}). ID: ${scheduledAgent.id}`;
      } else {
        return `Saved schedule to database, but the scheduler is not running currently. ID: ${scheduledAgent.id}`;
      }
    } catch(e: unknown) {
      return 'Failed to schedule agent: ' + (e instanceof Error ? e.message : String(e));
    }
  }
});
