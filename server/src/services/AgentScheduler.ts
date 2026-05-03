import { PrismaClient } from '@prisma/client';
import Bree from 'bree';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AgentScheduler {
    private prisma: PrismaClient;
    private bree: Bree;
    private syncTimer: NodeJS.Timeout | null = null;

    constructor(prisma: PrismaClient) {
        this.prisma = prisma;
        
        // Initialize Bree. We set the root to our current compiled directory 
        // to find the job files correctly in dist/
        this.bree = new Bree({
            root: path.join(__dirname, '..', 'jobs'),
            defaultExtension: process.env.NODE_ENV === 'production' ? 'js' : 'ts',
            acceptedExtensions: ['ts', 'js'],
            logger: console,
            // To prevent Bree from auto-loading index.js (which fails in some ESM setups),
            // we provide a dummy job. It won't actually do anything.
            jobs: [
                { name: 'triggerAgent', interval: 'at 12:00 am', worker: { workerData: { dummy: true } } }
            ]
        });
    }

    async start() {
        console.log(`[AgentScheduler] Starting Bree scheduler...`);
        await this.bree.start();
        
        // Sync database agents with Bree jobs initially and then every minute
        await this.syncJobs();
        this.syncTimer = setInterval(() => this.syncJobs(), 60000);
    }

    async stop() {
        if (this.syncTimer) clearInterval(this.syncTimer);
        await this.bree.stop();
    }

    private async syncJobs() {
        try {
            // Fetch enabled agents
            const agents = await this.prisma.agent.findMany({
                where: { enabled: true, existent: true }
            });

            const currentJobs = this.bree.config.jobs.map(j => typeof j === 'string' ? j : j.name);
            const activeAgentIds = new Set(agents.map(a => `agent-${a.id}`));

            // Remove jobs for agents that are no longer active/enabled
            for (const jobName of currentJobs) {
                if (jobName.startsWith('agent-') && !activeAgentIds.has(jobName)) {
                    await this.bree.remove(jobName);
                    console.log(`[AgentScheduler] Removed inactive job: ${jobName}`);
                }
            }

            // Add or update jobs
            for (const agent of agents) {
                const jobName = `agent-${agent.id}`;
                const jobDef = {
                    name: jobName,
                    path: path.join(__dirname, '..', 'jobs', 'triggerAgent.ts'), // Uses TS in dev
                    interval: agent.schedule, // Bree handles natural language (e.g., 'every 10 minutes')
                    worker: {
                        workerData: {
                            agentId: agent.id,
                            userId: agent.userId,
                            templateId: agent.templateId,
                            name: agent.name
                        }
                    }
                };

                const existingJob = this.bree.config.jobs.find(j => (typeof j !== 'string' && j.name === jobName));
                if (!currentJobs.includes(jobName)) {
                    await this.bree.add(jobDef);
                    this.bree.start(jobName); // Start the specific job schedule
                    console.log(`[AgentScheduler] Added new job: ${jobName} running ${agent.schedule}`);
                    console.log(`[AgentScheduler] Job parameters:`, JSON.stringify(jobDef, null, 2));
                } else if (existingJob && typeof existingJob !== 'string' && existingJob.interval !== agent.schedule) {
                    // Schedule changed: remove and re-add job
                    await this.bree.remove(jobName);
                    await this.bree.add(jobDef);
                    this.bree.start(jobName);
                    console.log(`[AgentScheduler] Updated job: ${jobName} to new schedule ${agent.schedule}`);
                    console.log(`[AgentScheduler] Updated job parameters:`, JSON.stringify(jobDef, null, 2));
                }
            }
        } catch (error) {
            console.error('[AgentScheduler] Error syncing jobs:', error);
        }
    }

    getState() {
        return {
            isRunning: this.syncTimer !== null,
            activeJobs: this.bree ? Object.keys(this.bree.workers).length : 0,
            totalJobs: this.bree ? this.bree.config.jobs.length : 0
        };
    }
}
