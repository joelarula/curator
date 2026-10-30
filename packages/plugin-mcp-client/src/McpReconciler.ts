import type { McpRemoteRegistry, McpStatusChange } from './McpRemoteRegistry.js';
import { MCP_CONNECT_SCRIPT, mcpServerEvent } from './plugin.js';

/** What the reconciler needs from a running host (`CuratorHost` satisfies it). */
export interface McpReconcilerHost {
  prisma: any;
  project: { id: string };
  /** Host user: flows run (and events are delivered) in this user's conversation, so only theirs are adopted. */
  user?: { id: string };
  triggerAgent(agentName: string, context?: Record<string, any>): Promise<{ id: number }>;
  emitEvent(eventName: string, payload?: any): Promise<unknown>;
}

const ACTIVE = ['NEW', 'WAITING', 'WAITING_FOR_USER', 'WAITING_FOR_EVENT', 'PAUSED'];

/**
 * Starts and nudges the connector workflows (`mcp_connect` script, one flow per server in the host's
 * project, run as the host user). The flows hold the connection state as Requests: retries, backoff and
 * waiting for a sign-in survive restarts and show up like any other work. This class only starts missing flows, turns
 * connections lost outside a sync (e.g. a failing remote tool call) into `mcp:<server>:disconnected`,
 * and asks for an immediate attempt with `mcp:<server>:retry`.
 */
export class McpReconciler {
  private readonly detach: () => void;

  constructor(
    private readonly registry: McpRemoteRegistry,
    private readonly host: McpReconcilerHost
  ) {
    this.detach = registry.onStatus((change) => this.onStatus(change));
  }

  /** Ensures a connector flow runs for a registered server; returns its root Request id. */
  async watch(name: string): Promise<{ requestId: number; started: boolean }> {
    const running = await this.activeFlow(name);
    if (running) {
      // A flow from an earlier process may be parked as `connected` (status and tools come from the database),
      // but connections live in memory: unless this process holds one (or is mid-attempt), have the flow sync now.
      const projectId = this.host.project.id;
      if (!this.registry.isLive(projectId, name) && !this.registry.isConnecting(projectId, name)) {
        await this.retry(name);
      }
      return { requestId: running, started: false };
    }
    const request = await this.host.triggerAgent(MCP_CONNECT_SCRIPT, { server: name });
    return { requestId: request.id, started: true };
  }

  /** Cuts the server's current wait (backoff, login, connected) short and syncs now. */
  async retry(name: string): Promise<void> {
    await this.host.emitEvent(mcpServerEvent(name, 'retry'), { server: name });
  }

  /** Stops listening for status changes; the flows keep running in the host. */
  stop(): void {
    this.detach();
  }

  private async activeFlow(name: string): Promise<number | undefined> {
    const script = await this.host.prisma.script.findUnique({ where: { name: MCP_CONNECT_SCRIPT }, select: { id: true } });
    if (!script) throw new Error(`Script "${MCP_CONNECT_SCRIPT}" is not seeded; run host.seed() first`);
    const rows = await this.host.prisma.request.findMany({
      where: {
        scriptId: script.id,
        projectId: this.host.project.id,
        ...(this.host.user ? { userId: this.host.user.id } : {}),
        status: { in: ACTIVE },
      },
      select: { id: true, ast: true, context: true },
      orderBy: { id: 'asc' },
    });
    for (const row of rows) {
      const ast = parse(row.ast);
      if (ast?.type === 'Curator_Graph' && parse(row.context)?.server === name) return row.id;
    }
    return undefined;
  }

  private onStatus(change: McpStatusChange): void {
    if (change.projectId !== this.host.project.id || change.previous !== 'connected' || change.status === 'connected') return;
    // Status changes during the flow's own sync are its result, not a lost connection.
    if (this.registry.isConnecting(change.projectId, change.server)) return;
    this.host.emitEvent(mcpServerEvent(change.server, 'disconnected'), { server: change.server, status: change.status }).catch(() => {});
  }
}

const parse = (value: any) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};
