import Bree from 'bree';
import tsWorker from '@breejs/ts-worker';
import path from 'path';
import { fileURLToPath } from 'url';
import type { PrismaClient } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

Bree.extend(tsWorker);

export class ScheduledAgentScheduler {
  private prisma: PrismaClient;
  private bree: Bree | null = null;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  public async start() {
    console.log('[ScheduledAgentScheduler] Initializing Bree scheduler...');

    // Fetch all active scheduled agents
    const agents = await this.prisma.scheduledAgent.findMany({
      where: { isActive: true }
    });

    const jobs = agents.map(agent => ({
      name: `scheduled-agent-${agent.id}`,
      path: path.join(__dirname, 'workers', 'scheduledAgentWorker.ts'),
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
        } else if (msg.message === 'error') {
          console.error(`[ScheduledAgentScheduler] Worker reported an error.`);
        }
      }
    });

    await this.bree.start();
    console.log(`[ScheduledAgentScheduler] Bree scheduler started with ${jobs.length} jobs.`);
  }

  public async stop() {
    if (this.bree) {
      await this.bree.stop();
      console.log('[ScheduledAgentScheduler] Bree scheduler stopped.');
    }
  }

  public async addAgentJob(agentId: number) {
    if (!this.bree) return;

    const agent = await this.prisma.scheduledAgent.findUnique({
      where: { id: agentId }
    });

    if (!agent || !agent.isActive) return;

    const jobName = `scheduled-agent-${agent.id}`;
    
    // Remove if already exists to allow updating schedules
    try { await this.bree.remove(jobName); } catch (e) {}

    let jobConfig: any = {
      name: jobName,
      path: path.join(__dirname, 'workers', 'scheduledAgentWorker.ts'),
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
    } else {
      // Recurring: use cron/Bree schedule string
      jobConfig.cron = agent.schedule;
    }

    await this.bree.add(jobConfig);
    await this.bree.start(jobName);
    console.log(`[ScheduledAgentScheduler] Dynamically added and started job: ${jobName}`);
  }

  public async removeAgentJob(agentId: number) {
    if (!this.bree) return;
    const jobName = `scheduled-agent-${agentId}`;
    try {
      await this.bree.remove(jobName);
      console.log(`[ScheduledAgentScheduler] Dynamically removed job: ${jobName}`);
    } catch (e: any) {
      console.log(`[ScheduledAgentScheduler] Failed to remove job ${jobName}: ${e.message}`);
    }
  }
}

// Singleton for dynamic updates
let instance: ScheduledAgentScheduler | null = null;
export function setGlobalScheduler(scheduler: ScheduledAgentScheduler) {
  instance = scheduler;
}
export function getGlobalScheduler() {
  return instance;
}
