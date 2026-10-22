import { defineTool } from './CuratorTool.js';
import { cancelAgentLoops } from '../engine/AgentScheduleSupervisor.js';

export const cancel_scheduled_agent = defineTool({
  name: 'cancel_scheduled_agent',
  description: 'Cancels a previously scheduled recurring agent by its ID or Name.',
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The ID of the scheduled agent to cancel (as returned by schedule_agent).'
      },
      name: {
        type: 'string',
        description: 'The name of the scheduled agent to cancel (if ID is unknown).'
      }
    }
  },
  execute: async (args, ctx) => {
    try {
      if (!ctx.prisma) return 'Error: Database connection not available in tool context.';
      const { id, name } = args;
      if (id === undefined && name === undefined) return 'Error: Must provide either id or name to cancel the scheduled agent.';
      if (id !== undefined && typeof id !== 'string') return 'Error: id must be a string.';
      if (name !== undefined && typeof name !== 'string') return 'Error: name must be a string.';

      const agent = await ctx.prisma.agent.findFirst({ where: id !== undefined ? { id } : { name } });
      if (!agent) return 'Error: Could not find scheduled agent.';

      await ctx.prisma.agent.update({ where: { id: agent.id }, data: { enabled: false } });
      const cancelled = await cancelAgentLoops(ctx.prisma, agent.id);
      return `Successfully cancelled scheduled agent ID: ${agent.id} (${cancelled} request(s) cancelled)`;
    } catch (e: unknown) {
      return 'Failed to cancel scheduled agent: ' + (e instanceof Error ? e.message : String(e));
    }
  }
});
