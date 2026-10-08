import type { SemanticNodeShape } from '../services/SemanticSchemaEngine.js';
import type { CuratorAgentDefinition, CuratorPluginDefinition, CuratorScriptDefinition } from './CuratorContracts.js';
import type { CuratorAstNode } from './CuratorAst.js';
import type { CuratorTool } from '../tools/CuratorTool.js';
import type { LlmRequest, LlmResponse, LlmEmbeddingRequest, LlmEmbeddingResponse, LlmCreateCacheRequest, LlmCacheInfo } from './llm/ILlmProvider.js';
export type CuratorPlugin = CuratorPluginDefinition;
export declare class CuratorEngine {
    tools: Map<string, CuratorTool>;
    models: Map<string, SemanticNodeShape>;
    scripts: Map<string, CuratorScriptDefinition>;
    agents: Map<string, CuratorAstNode | CuratorAgentDefinition>;
    plugins: CuratorPlugin[];
    registerPlugin(plugin: CuratorPlugin): void;
    registerLlmProvider(name: string, provider: any): void;
    registerTool(tool: CuratorTool): void;
    isAgentEnabled(nameOrDef: string | CuratorAgentDefinition | any): boolean;
    getActiveAgents(): Array<{
        name: string;
        definition: any;
    }>;
    getScheduledAgents(): Array<{
        name: string;
        schedule: string;
        enabled: boolean;
        definition: any;
    }>;
    generateContent(req: LlmRequest & {
        provider?: string;
    }): Promise<LlmResponse>;
    embed(text: string | string[], options?: Partial<LlmEmbeddingRequest> & {
        provider?: string;
    }): Promise<LlmEmbeddingResponse>;
    createContextCache(options: LlmCreateCacheRequest & {
        provider?: string;
    }): Promise<LlmCacheInfo>;
    deleteContextCache(name: string, options?: {
        provider?: string;
        apiKey?: string;
    }): Promise<void>;
}
export declare const curatorEngine: CuratorEngine;
//# sourceMappingURL=CuratorEngine.d.ts.map