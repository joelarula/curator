import type { PrismaClient } from '@prisma/client';
export declare class ScheduledAgentScheduler {
    private prisma;
    private bree;
    constructor(prisma: PrismaClient);
    start(): Promise<void>;
    stop(): Promise<void>;
    addAgentJob(agentId: number): Promise<void>;
    removeAgentJob(agentId: number): Promise<void>;
}
export declare function setGlobalScheduler(scheduler: ScheduledAgentScheduler): void;
export declare function getGlobalScheduler(): ScheduledAgentScheduler;
//# sourceMappingURL=ScheduledAgentScheduler.d.ts.map