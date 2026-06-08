
import { PrismaClient } from '@prisma/client';
import Bree from 'bree';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AgentScheduler {
    private prisma: PrismaClient;
    private syncTimer: NodeJS.Timeout | null = null;

    constructor(prisma: PrismaClient) {
        this.prisma = prisma;
    }

    async start() {
        logger.info('[AgentScheduler] Starting Unified Scheduler heartbeat...');
        // Initial sync
        await this.syncJobs();
        // Check every minute if any agents need their "Next Run" request seeded
        this.syncTimer = setInterval(() => this.syncJobs(), 60000);
    }

    async stop() {
        if (this.syncTimer) clearInterval(this.syncTimer);
    }

    private async syncJobs() {
        try {
            // Fetch enabled agents
            const agents = await this.prisma.agent.findMany({
                where: { enabled: true, existent: true }
            });

            for (const agent of agents) {
                // Check if there's already a pending trigger request for this agent
                const pendingTrigger = await this.prisma.request.findFirst({
                    where: {
                        agentId: agent.id,
                        toolName: 'internal:trigger_agent',
                        status: 'NEW'
                    }
                });

                if (!pendingTrigger) {
                    logger.info(`[AgentScheduler] Seeding initial trigger request for agent: ${agent.name}`);
                    
                    // Use a placeholder conversation if one doesn't exist
                    let conversation = await this.prisma.conversation.findFirst({ where: { userId: agent.userId } });
                    if (!conversation) {
                        conversation = await this.prisma.conversation.create({ data: { userId: agent.userId } });
                    }

                    // Create the initial trigger request (run immediately or based on schedule)
                    await this.prisma.request.create({
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
                            userId: agent.userId,
                            conversationId: conversation.id,
                            agentId: agent.id,
                            executionScheduled: new Date() // Start NOW
                        }
                    });
                }
            }
        } catch (error) {
            logger.error({ err: error }, '[AgentScheduler] Error syncing unified jobs');
        }
    }

    getState() {
        return {
            isRunning: this.syncTimer !== null,
            unifiedMode: true
        };
    }
}

