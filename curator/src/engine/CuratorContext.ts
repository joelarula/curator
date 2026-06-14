import { AsyncLocalStorage } from 'node:async_hooks';
import type { PrismaClient } from '@prisma/client';

export interface CuratorUserContext {
  userId: number; // Primary user
  projectId: number; // Primary project
  userIds?: number[]; // All associated users
  projectIds?: number[]; // All associated projects
  sessionId?: string;
  requestId?: number;
  prisma?: PrismaClient; // Contextual database connection
}

class CuratorContextManager {
  private storage = new AsyncLocalStorage<CuratorUserContext>();

  public run<R>(context: CuratorUserContext, callback: () => R): R {
    return this.storage.run(context, callback);
  }

  public getContext(): CuratorUserContext {
    const context = this.storage.getStore();
    if (!context) {
      throw new Error('CuratorContext is not available in the current asynchronous execution flow.');
    }
    return context;
  }

  public tryGetContext(): CuratorUserContext | undefined {
    return this.storage.getStore();
  }
}

// Export the singleton instance
export const curatorContext = new CuratorContextManager();
