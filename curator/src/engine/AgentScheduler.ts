import Bree from 'bree';
import tsWorker from '@breejs/ts-worker';
import path from 'path';
import { fileURLToPath } from 'url';
import type { PrismaClient } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

Bree.extend(tsWorker);

export class AgentScheduler {
  private prisma: PrismaClient;
  private bree: Bree | null = null;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  public async start() {
    console.log('[AgentScheduler] Initializing Bree scheduler...');

    // Fetch all active agents
    const agents = await this.prisma.agent.findMany({
      where: { isActive: true }
    });

    const jobs = agents.map(agent => ({
      name: `agent-${agent.id}`,
      path: path.join(__dirname, 'workers', 'agentWorker.ts'),
      cron: agent.schedule,
      worker: {
        workerData: {
          agentId: agent.id
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
          console.error(`[AgentScheduler] Worker reported an error.`);
        }
      }
    });

    await this.bree.start();
    console.log(`[AgentScheduler] Bree scheduler started with ${jobs.length} jobs.`);
  }

  public async stop() {
    if (this.bree) {
      await this.bree.stop();
      console.log('[AgentScheduler] Bree scheduler stopped.');
    }
  }
}
