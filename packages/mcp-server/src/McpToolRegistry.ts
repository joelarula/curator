import type {
  CuratorEngine,
  CuratorTool,
  CuratorToolContext,
  ExposurePolicyController,
  PeerSessionContext,
} from '@curator/agent-server';
import type { McpCallResult, McpToolDeclaration } from './types.js';

export class McpToolRegistry {
  private exposedTools = new Map<string, CuratorTool>(); // key: MCP exposed name -> tool

  constructor(
    private engine: CuratorEngine,
    private getContext: () => Promise<CuratorToolContext>,
    private exposureController?: ExposurePolicyController
  ) {
    this.refresh();
  }

  public static fromEngine(
    engine: CuratorEngine,
    getContext: () => Promise<CuratorToolContext>,
    exposureController?: ExposurePolicyController
  ): McpToolRegistry {
    return new McpToolRegistry(engine, getContext, exposureController);
  }

  public getExposureController(): ExposurePolicyController | undefined {
    return this.exposureController;
  }

  public setExposureController(controller: ExposurePolicyController): void {
    this.exposureController = controller;
  }

  public refresh(): void {
    this.exposedTools.clear();

    for (const [toolKey, tool] of this.engine.tools.entries()) {
      if (this.isToolExposed(toolKey, tool)) {
        const declaration = tool.toMcpDeclaration();
        const mcpName = declaration.name || toolKey;
        this.exposedTools.set(mcpName, tool);
      }
    }
  }

  private isToolExposed(toolKey: string, tool: CuratorTool): boolean {
    const pluginName = this.engine.toolPlugins?.get(toolKey);
    const plugin = pluginName
      ? this.engine.plugins?.find((p) => p.name === pluginName)
      : undefined;

    if (plugin?.mcp) {
      if (plugin.mcp.exclude?.includes(toolKey)) {
        return false;
      }
      if (plugin.mcp.include && Array.isArray(plugin.mcp.include)) {
        return plugin.mcp.include.includes(toolKey);
      }
      if (plugin.mcp.exposeAll === true) {
        return true;
      }
    }

    // Per-tool fallback
    if (tool.mcp?.expose === true) {
      return true;
    }

    // Default safe deny
    return false;
  }

  public list(session?: PeerSessionContext): McpToolDeclaration[] {
    const list: McpToolDeclaration[] = [];
    const allTools = Array.from(this.exposedTools.values());

    const allowedTools = this.exposureController
      ? this.exposureController.filterTools(allTools, session || { peerId: 'local', trustTier: 'cluster_admin' })
      : allTools;

    for (const tool of allowedTools) {
      list.push(tool.toMcpDeclaration());
    }
    return list;
  }

  public async call(
    name: string,
    args: Record<string, unknown> = {},
    session?: PeerSessionContext
  ): Promise<McpCallResult> {
    const tool = this.exposedTools.get(name);
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Error: Unknown or unexposed MCP tool "${name}"` }],
        isError: true,
      };
    }

    // Dynamic Exposure Policy Evaluation (Trust tiers, ephemeral leases, CPU throttling, multi-tenant boundaries)
    if (this.exposureController) {
      const peerSession = session || { peerId: 'local', trustTier: 'cluster_admin' };
      const accessEval = this.exposureController.evaluateToolAccess(tool, peerSession);
      if (!accessEval.allowed) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${accessEval.reason || 'Access denied by exposure policy controller.'}`,
            },
          ],
          isError: true,
        };
      }
    }

    if (tool.accessLevel === 'destructive' && process.env.MCP_ALLOW_DESTRUCTIVE !== 'true') {
      return {
        content: [
          {
            type: 'text',
            text: `Error: Tool "${name}" is marked destructive and requires MCP_ALLOW_DESTRUCTIVE=true in environment.`,
          },
        ],
        isError: true,
      };
    }

    try {
      const toolContext = await this.getContext();
      const output = await tool.runAsync({
        args,
        toolContext,
      });

      // Record invocation against lease if an ephemeral lease was utilized
      if (this.exposureController && session?.peerId) {
        this.exposureController.recordLeaseInvocation(session.peerId, tool.name, session.conversationId);
      }

      const formattedText =
        typeof output === 'string'
          ? output
          : JSON.stringify(output, null, 2);

      return {
        content: [{ type: 'text', text: formattedText }],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Error: ${err?.message || String(err)}` }],
        isError: true,
      };
    }
  }
}
