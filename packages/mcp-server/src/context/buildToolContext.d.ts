import type { CuratorToolContext } from '@curator/agent-server';
import type { CuratorHost } from '@curator/host';
export interface ToolContextOptions {
    prisma: any;
    host?: CuratorHost;
}
export declare function buildToolContext(options: ToolContextOptions): Promise<CuratorToolContext>;
//# sourceMappingURL=buildToolContext.d.ts.map