import { defineTool } from './CuratorTool.js';
import { getGlobalScheduler } from '../engine/ScheduledAgentScheduler.js';

export const cancel_scheduled_agent = defineTool({
  name: 'cancel_scheduled_agent',
  description: 'Cancels a previously scheduled recurring agent by its ID or Name.',
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'number',
        description: 'The ID of the scheduled agent to cancel.'
      },
      name: {
        type: 'string',
        description: 'The name of the scheduled agent to cancel (if ID is unknown).'
      }
    }
  },
  execute: async (args, ctx) => {
    try {
      if (!ctx.prisma) {
        return 'Error: Database connection not available in tool context.';
      }
      if (!args.id && !args.name) {
        return 'Error: Must provide either id or name to cancel the scheduled agent.';
      }

      const scheduledAgent = await ctx.prisma.scheduledAgent.findFirst({
        where: args.id ? { id: args.id } : { name: args.name }
      });

      if (!scheduledAgent) {
        return `Error: Could not find scheduled agent.`;
      }

      await ctx.prisma.scheduledAgent.update({
        where: { id: scheduledAgent.id },
        data: { isActive: false }
      });

      const scheduler = getGlobalScheduler();
      if (scheduler) {
        await scheduler.removeAgentJob(scheduledAgent.id);
        return `Successfully cancelled scheduled agent ID: ${scheduledAgent.id}`;
      } else {
        return `Marked scheduled agent as inactive in DB. ID: ${scheduledAgent.id}`;
      }
    } catch(e: any) {
      return 'Failed to cancel scheduled agent: ' + e.message;
    }
  }
});
