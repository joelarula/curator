import type { IStorageAdapter, IRequestRepository, IAgentRepository, IToolRepository, StoredAgent, StoredTool } from './IStorageAdapter.js';
import type { CuratorRequestRecord, CuratorResponseRecord } from '../engine/CuratorContracts.js';
export declare class MemoryStorageAdapter implements IStorageAdapter {
    readonly dialect = "memory";
    private requestCounter;
    private responseCounter;
    private agentCounter;
    private toolCounter;
    requestsMap: Map<number, CuratorRequestRecord>;
    responsesMap: Map<number, CuratorResponseRecord>;
    agentsMap: Map<string, StoredAgent>;
    toolsMap: Map<string, StoredTool>;
    init(): Promise<void>;
    close(): Promise<void>;
    requests: IRequestRepository;
    agents: IAgentRepository;
    tools: IToolRepository;
}
//# sourceMappingURL=MemoryStorageAdapter.d.ts.map