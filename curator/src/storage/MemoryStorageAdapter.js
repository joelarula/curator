export class MemoryStorageAdapter {
    dialect = 'memory';
    requestCounter = 1;
    responseCounter = 1;
    agentCounter = 1;
    toolCounter = 1;
    requestsMap = new Map();
    responsesMap = new Map();
    agentsMap = new Map();
    toolsMap = new Map();
    async init() {
        // In-memory: immediate ready
    }
    async close() {
        this.requestsMap.clear();
        this.responsesMap.clear();
        this.agentsMap.clear();
        this.toolsMap.clear();
    }
    requests = {
        createRequest: async (data) => {
            const id = this.requestCounter++;
            const record = {
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
        getRequestById: async (id) => {
            return this.requestsMap.get(id) || null;
        },
        pollAndLockRequests: async (workerId, limit = 10) => {
            const candidates = [];
            for (const req of this.requestsMap.values()) {
                if (req.status === 'NEW' && req.pendingDependencies <= 0) {
                    req.status = 'WAITING';
                    req.lockedBy = workerId;
                    req.lockedAt = new Date();
                    candidates.push({ ...req });
                    if (candidates.length >= limit)
                        break;
                }
            }
            return candidates;
        },
        updateRequest: async (id, data) => {
            const req = this.requestsMap.get(id);
            if (req) {
                if (data.status)
                    req.status = data.status;
                if (data.lockedBy !== undefined)
                    req.lockedBy = data.lockedBy;
                if (data.lockedAt !== undefined)
                    req.lockedAt = data.lockedAt;
                if (data.retryCount !== undefined)
                    req.retryCount = data.retryCount;
                if (data.pendingDependencies !== undefined)
                    req.pendingDependencies = data.pendingDependencies;
                if (data.context !== undefined)
                    req.context = data.context;
                if (data.ast !== undefined)
                    req.ast = data.ast;
            }
        },
        createResponse: async (data) => {
            const id = this.responseCounter++;
            const record = {
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
        pauseRequest: async (id) => {
            const req = this.requestsMap.get(id);
            if (req && (req.status === 'NEW' || req.status === 'WAITING' || req.status === 'RUNNING')) {
                req.status = 'PAUSED';
                req.lockedBy = null;
                req.lockedAt = null;
                return true;
            }
            return false;
        },
        resumeRequest: async (id) => {
            const req = this.requestsMap.get(id);
            if (req && req.status === 'PAUSED') {
                req.status = 'NEW';
                req.lockedBy = null;
                req.lockedAt = null;
                return true;
            }
            return false;
        },
        decrementPendingDependencies: async (parentRequestId) => {
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
    agents = {
        upsertAgent: async (agentData) => {
            const existing = this.agentsMap.get(agentData.name);
            if (existing) {
                Object.assign(existing, agentData, { updatedAt: new Date() });
                return existing;
            }
            const agent = {
                ...agentData,
                id: this.agentCounter++,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            this.agentsMap.set(agent.name, agent);
            return agent;
        },
        getAgentByName: async (name) => {
            return this.agentsMap.get(name) || null;
        },
        listScheduledAgents: async () => {
            return Array.from(this.agentsMap.values()).filter((a) => !!a.schedule && a.enabled !== false);
        },
    };
    tools = {
        upsertTool: async (toolData) => {
            const existing = this.toolsMap.get(toolData.name);
            if (existing) {
                Object.assign(existing, toolData, { updatedAt: new Date() });
                return existing;
            }
            const tool = {
                ...toolData,
                id: this.toolCounter++,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            this.toolsMap.set(tool.name, tool);
            return tool;
        },
        listTools: async () => {
            return Array.from(this.toolsMap.values());
        },
    };
}
//# sourceMappingURL=MemoryStorageAdapter.js.map