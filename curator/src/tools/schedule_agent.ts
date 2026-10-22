import { defineTool } from './CuratorTool.js';
import { isValidSchedule } from '../engine/AgentScheduleSupervisor.js';

/**
 * Recurring jobs become an Agent whose script is a Curator_Call to the workflow; the processor's
 * scheduler supervisor wraps it in a Curator_Loop. One-shot jobs are a single Request with `scheduledAt`.
 */
export const schedule_agent = defineTool({
  name: 'schedule_agent',
  description: 'Schedules a workflow to run on a recurring cron/interval schedule OR once at a specific time in the future.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'A unique name for this scheduled task.'
      },
      workflowName: {
        type: 'string',
        description: 'The name of the workflow/script to run (e.g. "example_workflow")'
      },
      schedule: {
        type: 'string',
        description: 'For recurring jobs: cron or interval (e.g., "every 1 hour", "at 8:00 am", "*/5 * * * *"). Leave empty if using runAt.'
      },
      runAt: {
        type: 'string',
        description: 'For one-shot jobs: ISO 8601 datetime string for when to run once (e.g. "2026-06-17T09:00:00Z").'
      },
      workflowParams: {
        type: 'object',
        description: 'Optional JSON payload passed to the workflow as its arguments.'
      }
    },
    required: ['name', 'workflowName']
  },
  execute: async (args, ctx) => {
    try {
      if (!ctx.prisma) return 'Error: Database connection not available in tool context.';

      const { name, workflowName, schedule, runAt } = args;
      if (typeof name !== 'string' || typeof workflowName !== 'string') return 'Error: name and workflowName must be strings.';
      if (schedule !== undefined && typeof schedule !== 'string') return 'Error: schedule must be a string.';
      if (runAt !== undefined && typeof runAt !== 'string') return 'Error: runAt must be an ISO datetime string.';
      const isOnce = typeof runAt === 'string' && runAt.length > 0;
      if (!isOnce && !schedule) return 'Error: Must provide either "schedule" (for recurring) or "runAt" (for one-shot).';
      if (isOnce && Number.isNaN(new Date(runAt as string).getTime())) return 'Error: runAt must be a valid ISO 8601 datetime.';
      if (!isOnce && !isValidSchedule(schedule as string)) return `Error: schedule '${schedule}' is not a valid cron or interval expression.`;

      const workflow = await ctx.prisma.script.findUnique({ where: { name: workflowName } });
      if (!workflow) return `Error: workflow '${workflowName}' not found.`;

      const userId = ctx.userId as string;
      const call: any = { type: 'Curator_Call', ref: workflowName, args: args.workflowParams ?? {} };

      if (isOnce) {
        if (ctx.conversationId === undefined) return 'Error: One-shot scheduling needs a conversation.';
        const req = await ctx.prisma.request.create({
          data: {
            userId,
            projectId: ctx.projectId ?? null,
            conversationId: ctx.conversationId,
            status: 'NEW',
            toolName: 'Curator_Workflow',
            ast: call,
            scheduledAt: new Date(runAt as string)
          }
        });
        return `Successfully scheduled '${workflowName}' as '${name}' (once at ${runAt}). ID: ${req.id}`;
      }

      const script = await ctx.prisma.script.upsert({
        where: { name: `scheduled:${name}` },
        update: { ast: call, userId, projectId: ctx.projectId ?? null },
        create: { name: `scheduled:${name}`, body: `// Scheduled: ${name}`, ast: call, userId, projectId: ctx.projectId ?? null }
      });
      const agent = await ctx.prisma.agent.upsert({
        where: { name },
        update: { scriptId: script.id, schedule, enabled: true, userId, projectId: ctx.projectId ?? null },
        create: { name, scriptId: script.id, schedule, enabled: true, userId, projectId: ctx.projectId ?? null }
      });
      // The scheduled agent acts with its owner's roles.
      const roles = await ctx.prisma.userRole.findMany({ where: { userId } });
      for (const r of roles) {
        await ctx.prisma.agentRole.upsert({
          where: { agentId_roleId: { agentId: agent.id, roleId: r.roleId } },
          update: {},
          create: { agentId: agent.id, roleId: r.roleId }
        });
      }
      return `Successfully scheduled agent '${workflowName}' as '${name}' (recurring: "${schedule}"). ID: ${agent.id}`;
    } catch (e: unknown) {
      return 'Failed to schedule agent: ' + (e instanceof Error ? e.message : String(e));
    }
  }
});
