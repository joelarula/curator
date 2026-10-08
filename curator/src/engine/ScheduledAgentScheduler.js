import Bree from 'bree';
import tsWorker from '@breejs/ts-worker';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scheduledWorkerPath = path.join(__dirname, 'workers', fs.existsSync(path.join(__dirname, 'workers', 'scheduledAgentWorker.js')) ? 'scheduledAgentWorker.js' : 'scheduledAgentWorker.ts');
Bree.extend(tsWorker);
export class ScheduledAgentScheduler {
    prisma;
    bree = null;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async start() {
        console.log('[ScheduledAgentScheduler] Initializing Bree scheduler...');
        // Fetch all active scheduled agents
        const agents = await this.prisma.scheduledAgent.findMany({
            where: { isActive: true }
        });
        const jobs = agents.map(agent => ({
            name: `scheduled-agent-${agent.id}`,
            path: scheduledWorkerPath,
            cron: agent.schedule || undefined,
            worker: {
                workerData: {
                    scheduledAgentId: agent.id
                }
            }
        }));
        this.bree = new Bree({
            root: false,
            defaultExtension: 'ts',
            jobs: jobs,
            logger: console,
            workerMessageHandler: async (msg) => {
                if (msg.message === 'done') {
                    // Worker finished gracefully
                }
                else if (msg.message === 'error') {
                    console.error(`[ScheduledAgentScheduler] Worker reported an error.`);
                }
            }
        });
        await this.bree.start();
        console.log(`[ScheduledAgentScheduler] Bree scheduler started with ${jobs.length} jobs.`);
    }
    async stop() {
        if (this.bree) {
            await this.bree.stop();
            console.log('[ScheduledAgentScheduler] Bree scheduler stopped.');
        }
    }
    async addAgentJob(agentId) {
        if (!this.bree)
            return;
        const agent = await this.prisma.scheduledAgent.findUnique({
            where: { id: agentId }
        });
        if (!agent || !agent.isActive)
            return;
        const jobName = `scheduled-agent-${agent.id}`;
        // Remove if already exists to allow updating schedules
        try {
            await this.bree.remove(jobName);
        }
        catch (e) { }
        let jobConfig = {
            name: jobName,
            path: scheduledWorkerPath,
            worker: {
                workerData: {
                    scheduledAgentId: agent.id
                }
            }
        };
        if (agent.runOnce) {
            // One-shot: fire at the specified datetime
            const runAt = agent.runAt ? new Date(agent.runAt) : new Date(Date.now() + 1000);
            jobConfig.date = runAt;
            console.log(`[ScheduledAgentScheduler] One-shot job ${jobName} scheduled for ${runAt.toISOString()}`);
        }
        else {
            // Recurring: use cron/Bree schedule string
            jobConfig.cron = agent.schedule;
        }
        await this.bree.add(jobConfig);
        await this.bree.start(jobName);
        console.log(`[ScheduledAgentScheduler] Dynamically added and started job: ${jobName}`);
    }
    async removeAgentJob(agentId) {
        if (!this.bree)
            return;
        const jobName = `scheduled-agent-${agentId}`;
        try {
            await this.bree.remove(jobName);
            console.log(`[ScheduledAgentScheduler] Dynamically removed job: ${jobName}`);
        }
        catch (e) {
            console.log(`[ScheduledAgentScheduler] Failed to remove job ${jobName}: ${e.message}`);
        }
    }
}
// Singleton for dynamic updates
let instance = null;
export function setGlobalScheduler(scheduler) {
    instance = scheduler;
}
export function getGlobalScheduler() {
    return instance;
}
//# sourceMappingURL=ScheduledAgentScheduler.js.map