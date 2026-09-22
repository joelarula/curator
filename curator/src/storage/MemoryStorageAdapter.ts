import type {
  IStorageAdapter,
  IRequestRepository,
  IAgentRepository,
  IToolRepository,
  CreateRequestInput,
  UpdateRequestInput,
  CreateResponseInput,
  StoredAgent,
  StoredTool,
  RequestStatus,
} from './IStorageAdapter.js';
import type { CuratorRequestRecord, CuratorResponseRecord } from '../engine/CuratorContracts.js';

export class MemoryStorageAdapter implements IStorageAdapter {
  public readonly dialect = 'memory';

  private requestCounter = 1;
  private responseCounter = 1;
  private agentCounter = 1;
  private toolCounter = 1;

  public requestsMap = new Map<number, CuratorRequestRecord>();
  public responsesMap = new Map<number, CuratorResponseRecord>();
  public agentsMap = new Map<string, StoredAgent>();
  public toolsMap = new Map<string, StoredTool>();

  public async init(): Promise<void> {
    // In-memory: immediate ready
  }

  public async close(): Promise<void> {
    this.requestsMap.clear();
    this.responsesMap.clear();
    this.agentsMap.clear();
    this.toolsMap.clear();
  }

  public requests: IRequestRepository = {
    createRequest: async (data: CreateRequestInput): Promise<CuratorRequestRecord> => {
      const id = this.requestCounter++;
      const record: CuratorRequestRecord = {
        id,
        userId: data.userId,
        projectId: data.projectId,
        conversationId: data.conversationId,
        ast: data.ast,
        context: data.context ?? null,
        status: 'NEW',
        priority: data.priority ?? 0,
        lockedBy: null,
        lockedAt: null,
        notifyId: data.notifyId ?? null,
        pendingDependencies: data.pendingDependencies ?? 0,
        retryCount: 0,
      };
      this.requestsMap.set(id, record);
      return record;
    },

    getRequestById: async (id: number): Promise<CuratorRequestRecord | null> => {
      return this.requestsMap.get(id) || null;
    },

    pollAndLockRequests: async (workerId: string, limit = 10): Promise<CuratorRequestRecord[]> => {
      const candidates: CuratorRequestRecord[] = [];
      for (const req of this.requestsMap.values()) {
        if (req.status === 'NEW' && req.pendingDependencies <= 0) {
          req.status = 'WAITING';
          req.lockedBy = workerId;
          req.lockedAt = new Date();
          candidates.push({ ...req });
          if (candidates.length >= limit) break;
        }
      }
      return candidates;
    },

    updateRequest: async (id: number, data: UpdateRequestInput): Promise<void> => {
      const req = this.requestsMap.get(id);
      if (req) {
        if (data.status) req.status = data.status;
        if (data.lockedBy !== undefined) req.lockedBy = data.lockedBy;
        if (data.lockedAt !== undefined) req.lockedAt = data.lockedAt;
        if (data.retryCount !== undefined) req.retryCount = data.retryCount;
        if (data.pendingDependencies !== undefined) req.pendingDependencies = data.pendingDependencies;
        if (data.context !== undefined) req.context = data.context;
        if (data.ast !== undefined) req.ast = data.ast;
      }
    },

    createResponse: async (data: CreateResponseInput): Promise<CuratorResponseRecord> => {
      const id = this.responseCounter++;
      const record: CuratorResponseRecord = {
        id,
        requestId: data.requestId,
        userId: data.userId,
        projectId: data.projectId,
        conversationId: data.conversationId,
        content: data.content,
        state: data.state ?? null,
        status: 'COMPLETED',
        retryCount: 0,
        createdAt: new Date(),
        completedAt: new Date(),
      };
      this.responsesMap.set(id, record);
      return record;
    },

    pauseRequest: async (id: number): Promise<boolean> => {
      const req = this.requestsMap.get(id);
      if (req && (req.status === 'NEW' || req.status === 'WAITING' || req.status === 'RUNNING')) {
        req.status = 'PAUSED';
        req.lockedBy = null;
        req.lockedAt = null;
        return true;
      }
      return false;
    },

    resumeRequest: async (id: number): Promise<boolean> => {
      const req = this.requestsMap.get(id);
      if (req && req.status === 'PAUSED') {
        req.status = 'NEW';
        req.lockedBy = null;
        req.lockedAt = null;
        return true;
      }
      return false;
    },

    decrementPendingDependencies: async (parentRequestId: number): Promise<number> => {
      const req = this.requestsMap.get(parentRequestId);
      if (req) {
        req.pendingDependencies = Math.max(0, req.pendingDependencies - 1);
        if (req.pendingDependencies === 0 && req.status === 'WAITING') {
          req.status = 'NEW';
        }
        return req.pendingDependencies;
      }
      return 0;
    },
  };

  public agents: IAgentRepository = {
    upsertAgent: async (agentData): Promise<StoredAgent> => {
      const existing = this.agentsMap.get(agentData.name);
      if (existing) {
        Object.assign(existing, agentData, { updatedAt: new Date() });
        return existing;
      }
      const agent: StoredAgent = {
        ...agentData,
        id: this.agentCounter++,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.agentsMap.set(agent.name, agent);
      return agent;
    },

    getAgentByName: async (name: string): Promise<StoredAgent | null> => {
      return this.agentsMap.get(name) || null;
    },

    listScheduledAgents: async (): Promise<StoredAgent[]> => {
      return Array.from(this.agentsMap.values()).filter((a) => !!a.schedule && a.enabled !== false);
    },
  };

  public tools: IToolRepository = {
    upsertTool: async (toolData): Promise<StoredTool> => {
      const existing = this.toolsMap.get(toolData.name);
      if (existing) {
        Object.assign(existing, toolData, { updatedAt: new Date() });
        return existing;
      }
      const tool: StoredTool = {
        ...toolData,
        id: this.toolCounter++,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.toolsMap.set(tool.name, tool);
      return tool;
    },

    listTools: async (): Promise<StoredTool[]> => {
      return Array.from(this.toolsMap.values());
    },
  };
}
