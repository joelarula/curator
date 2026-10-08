import type { PrismaClient } from '@prisma/client';
import type { CuratorExecutionContext } from './CuratorContracts.js';
export interface CuratorUserContext extends CuratorExecutionContext {
    userId: number;
    projectId: number;
    userIds?: number[];
    projectIds?: number[];
    sessionId?: string;
    requestId?: number;
    prisma?: PrismaClient;
}
declare class CuratorContextManager {
    private storage;
    run<R>(context: CuratorUserContext, callback: () => R): R;
    getContext(): CuratorUserContext;
    tryGetContext(): CuratorUserContext | undefined;
}
export declare const curatorContext: CuratorContextManager;
export {};
//# sourceMappingURL=CuratorContext.d.ts.map