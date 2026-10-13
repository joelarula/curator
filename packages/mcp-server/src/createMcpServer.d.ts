import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { McpToolRegistry } from './McpToolRegistry.js';
import type { McpServerConfig } from './types.js';
import type { CuratorHost } from '@curator/host';
export interface CuratorMcpInstance {
    server: Server;
    registry: McpToolRegistry;
    listen: () => Promise<void>;
    close: () => Promise<void>;
}
export declare function createMcpServer(config: McpServerConfig): Promise<CuratorMcpInstance>;
export declare function createMcpServerFromHost(host: CuratorHost, options?: Partial<McpServerConfig>): Promise<CuratorMcpInstance>;
//# sourceMappingURL=createMcpServer.d.ts.map