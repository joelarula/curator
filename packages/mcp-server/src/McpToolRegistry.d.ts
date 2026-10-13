import type { CuratorEngine, CuratorToolContext } from '@curator/agent-server';
import type { McpCallResult, McpToolDeclaration } from './types.js';
export declare class McpToolRegistry {
    private engine;
    private getContext;
    private exposedTools;
    constructor(engine: CuratorEngine, getContext: () => Promise<CuratorToolContext>);
    static fromEngine(engine: CuratorEngine, getContext: () => Promise<CuratorToolContext>): McpToolRegistry;
    refresh(): void;
    private isToolExposed;
    list(): McpToolDeclaration[];
    call(name: string, args?: Record<string, unknown>): Promise<McpCallResult>;
}
//# sourceMappingURL=McpToolRegistry.d.ts.map