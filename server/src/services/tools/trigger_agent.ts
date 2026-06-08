import { PrismaClient, Prisma } from '@prisma/client';
import { compileToAST } from '../ast/compiler.js';

/**
 * internal:trigger_agent
 * 
 * Orchestrates the execution of an agent script and schedules the next trigger.
 */
export async function trigger_agent(args: { agentId: string }, prisma: PrismaClient, userId: string) {
    const agent = await prisma.agent.findUnique({
        where: { id: args.agentId },
        include: { script: true }
    });

    if (!agent || !agent.enabled) {
        return { status: 'skipped', reason: 'Agent not found or disabled' };
    }

    console.log(`[Tool] Triggering Agent: ${agent.name} (${agent.id})`);

    // 1. Create a new Conversation for this run
    const conversation = await prisma.conversation.create({
        data: { userId }
    });

    // 2. Create the primary Request for the agent's script
    const toolCalls = agent.script.toolCalls as any[];
    const primaryToolName = Array.isArray(toolCalls) && toolCalls.length > 0 ? toolCalls[0].name : null;
    const scriptAst = agent.script.ast || (agent.script.toolCalls ? compileToAST(agent.script.toolCalls as any[]) : null);

    const request = await prisma.request.create({
        data: {
            status: 'NEW',
            toolName: primaryToolName,
            ast: scriptAst as any,
            scriptId: agent.scriptId,
            userId,
            conversationId: conversation.id,
            agentId: agent.id // Track provenance
        }
    });

    // 3. Update lastPolledAt
    await prisma.agent.update({
        where: { id: agent.id },
        data: { lastPolledAt: new Date() }
    });

    // 4. Schedule next run to unify scheduling logic
    const later = (await import('@breejs/later')).default;
    const sched = later.parse.text(agent.schedule);
    if (sched.error === -1) {
        const nextDate = later.schedule(sched).next();
        if (nextDate) {
            await prisma.request.create({
                data: {
                    status: 'NEW',
                    toolName: 'internal:trigger_agent',
                    ast: {
                        type: 'Sequence',
                        steps: [
                            {
                                id: 'trigger_agent',
                                type: 'ToolTask',
                                tool: 'internal:trigger_agent',
                                args: { agentId: agent.id }
                            }
                        ]
                    } as any,
                    userId,
                    conversationId: conversation.id, 
                    executionScheduled: nextDate,
                    agentId: agent.id
                }
            });
            console.log(`[Tool] Scheduled next run for ${agent.name} at ${nextDate}`);
        }
    }

    return {
        status: 'success',
        requestId: request.id,
        agentName: agent.name
    };
}

