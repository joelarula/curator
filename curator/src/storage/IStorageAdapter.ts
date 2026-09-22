import type { CuratorAstNode } from '../engine/CuratorAst.js';
import type { CuratorExecutionContext, CuratorRequestRecord, CuratorResponseRecord } from '../engine/CuratorContracts.js';

export type RequestStatus = 'NEW' | 'WAITING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PAUSED' | 'CANCELLED';

export interface CreateRequestInput {
  userId: number;
  projectId?: number | null;
  conversationId: string;
  ast: CuratorAstNode;
  context?: CuratorExecutionContext | null;
  priority?: number;
  toolName?: string;
  scheduledAt?: Date | null;
  notifyId?: number | null;
  pendingDependencies?: number;
}

export interface UpdateRequestInput {
  status?: RequestStatus;
  lockedBy?: string | null;
  lockedAt?: Date | null;
  scheduledAt?: Date | null;
  retryCount?: number;
  pendingDependencies?: number;
  context?: CuratorExecutionContext | null;
  ast?: CuratorAstNode;
}

export interface CreateResponseInput {
  requestId: number;
  userId: number;
  projectId?: number | null;
  conversationId: string;
  content: string;
  state?: Record<string, unknown> | null;
}

export interface StoredAgent {
  id: number;
  name: string;
  description?: string | null;
  userId: number;
  projectId?: number | null;
  enabled?: boolean;
  schedule?: string | null;
  ast?: CuratorAstNode | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredTool {
  id: number;
  name: string;
  description: string;
  parametersSchema?: Record<string, unknown> | null;
  sourceCode?: string | null;
  version?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRequestRepository {
  createRequest(data: CreateRequestInput): Promise<CuratorRequestRecord>;
  getRequestById(id: number): Promise<CuratorRequestRecord | null>;
  pollAndLockRequests(workerId: string, limit?: number): Promise<CuratorRequestRecord[]>;
  updateRequest(id: number, data: UpdateRequestInput): Promise<void>;
  createResponse(data: CreateResponseInput): Promise<CuratorResponseRecord>;
  pauseRequest(id: number): Promise<boolean>;
  resumeRequest(id: number): Promise<boolean>;
  decrementPendingDependencies(parentRequestId: number): Promise<number>;
}

export interface IAgentRepository {
  upsertAgent(agent: Omit<StoredAgent, 'id' | 'createdAt' | 'updatedAt'>): Promise<StoredAgent>;
  getAgentByName(name: string): Promise<StoredAgent | null>;
  listScheduledAgents(): Promise<StoredAgent[]>;
}

export interface IToolRepository {
  upsertTool(tool: Omit<StoredTool, 'id' | 'createdAt' | 'updatedAt'>): Promise<StoredTool>;
  listTools(): Promise<StoredTool[]>;
}

export interface IStorageAdapter {
  readonly dialect: string;
  init(): Promise<void>;
  close(): Promise<void>;
  requests: IRequestRepository;
  agents: IAgentRepository;
  tools: IToolRepository;
}
