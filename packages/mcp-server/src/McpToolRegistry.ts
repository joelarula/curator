import type {
  CuratorEngine,
  CuratorTool,
  ExposurePolicyController,
  PeerSessionContext,
} from '@curator/agent-server';
import type { CuratorHost } from '@curator/host';
import type { McpCallResult, McpToolDeclaration } from './types.js';

/** Outcome of a durable tool execution (a Request row with its Response). */
export interface McpToolExecution {
  requestId: number;
  status: string;
  result?: unknown;
}

/**
 * Durable executor: runs the tool as a Request on a Curator host (database + engine).
 * MCP never calls tool functions directly.
 */
export type McpToolExecutor = (
  toolName: string,
  args: Record<string, unknown>,
  session?: PeerSessionContext
) => Promise<McpToolExecution>;

/** Executor bound to a host: `host.runTool(..., { origin: 'MCP' })`; the actor is the host session, the peer is recorded in context. */
export function createHostToolExecutor(host: CuratorHost): McpToolExecutor {
  return (toolName, args, session) =>
    host.runTool(toolName, args as Record<string, any>, {
      origin: 'MCP',
      context: session
        ? { mcpPeerId: session.peerId, mcpTrustTier: session.trustTier, mcpConversationId: (session as any).conversationId }
        : undefined,
    });
}

export class McpToolRegistry {
  private exposedTools = new Map<string, CuratorTool>(); // key: MCP exposed name -> tool

  constructor(
    private engine: CuratorEngine,
    private execute: McpToolExecutor,
    private exposureController?: ExposurePolicyController
  ) {
    if (typeof execute !== 'function') {
      throw new Error('McpToolRegistry requires a durable tool executor (Curator host); use McpToolRegistry.fromHost(host).');
    }
    this.refresh();
  }

  /** Preferred: tools from the host engine, executed as Requests in the host database. */
  public static fromHost(host: CuratorHost, exposureController?: ExposurePolicyController): McpToolRegistry {
    return new McpToolRegistry(host.engine, createHostToolExecutor(host), exposureController ?? host.conversations?.exposure);
  }

  /** Engine listing with an explicit durable executor (e.g. a host's runTool bound to another engine view). */
  public static fromEngine(
    engine: CuratorEngine,
    execute: McpToolExecutor,
    exposureController?: ExposurePolicyController
  ): McpToolRegistry {
    return new McpToolRegistry(engine, execute, exposureController);
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
      // Durable execution: a Request row (origin MCP) with RBAC, approval and a Response.
      const execution = await this.execute(tool.name, args, session);

      if (execution.status === 'WAITING_FOR_USER') {
        return {
          content: [
            {
              type: 'text',
              text: `Tool "${name}" requires human approval (request #${execution.requestId}); it runs once approved.`,
            },
          ],
          isError: true,
          requestId: execution.requestId,
        };
      }

      if (execution.status === 'FAILED') {
        const failure = execution.result;
        return {
          content: [
            {
              type: 'text',
              text: `Error: Tool "${name}" failed (request #${execution.requestId}): ${typeof failure === 'string' ? failure : JSON.stringify(failure ?? null)}`,
            },
          ],
          isError: true,
          requestId: execution.requestId,
        };
      }

      // Record invocation against lease if an ephemeral lease was utilized
      if (this.exposureController && session?.peerId) {
        this.exposureController.recordLeaseInvocation(session.peerId, tool.name, session.conversationId);
      }

      const output = execution.result;
      const formattedText =
        typeof output === 'string'
          ? output
          : JSON.stringify(output, null, 2);

      return {
        content: [{ type: 'text', text: formattedText ?? '' }],
        requestId: execution.requestId,
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Error: ${err?.message || String(err)}` }],
        isError: true,
      };
    }
  }
}
