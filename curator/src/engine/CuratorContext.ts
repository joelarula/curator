import { AsyncLocalStorage } from 'node:async_hooks';
import type { PrismaClient } from '@prisma/client';
import type { CuratorExecutionContext } from './CuratorContracts.js';

export interface CuratorUserContext extends CuratorExecutionContext {
  userId: string | number; // Primary user
  projectId: string | number; // Primary project
  userIds?: (string | number)[]; // All associated users
  projectIds?: (string | number)[]; // All associated projects
  sessionId?: string | number;
  requestId?: number;
  prisma?: PrismaClient;
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
