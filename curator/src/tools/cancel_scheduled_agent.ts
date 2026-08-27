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
      const id = args.id;
      const name = args.name;
      if (id === undefined && name === undefined) {
        return 'Error: Must provide either id or name to cancel the scheduled agent.';
      }
      if (id !== undefined && (typeof id !== 'number' || !Number.isInteger(id))) return 'Error: id must be an integer.';
      if (name !== undefined && typeof name !== 'string') return 'Error: name must be a string.';

      const scheduledAgent = await ctx.prisma.scheduledAgent.findFirst({
        where: id !== undefined ? { id } : { name: name as string }
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
    } catch(e: unknown) {
      return 'Failed to cancel scheduled agent: ' + (e instanceof Error ? e.message : String(e));
    }
  }
});
