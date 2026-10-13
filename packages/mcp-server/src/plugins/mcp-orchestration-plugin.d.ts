import { type CuratorPluginDefinition } from '@curator/agent-server';
import type { CuratorHost } from '@curator/host';
export interface McpOrchestrationPluginOptions {
    host?: CuratorHost;
    prisma?: any;
}
export declare function mcpOrchestrationPlugin(options: McpOrchestrationPluginOptions): CuratorPluginDefinition;
//# sourceMappingURL=mcp-orchestration-plugin.d.ts.map