import type { CuratorHost } from '../../../host/dist/index.js';
import type { CuratorTool } from '../../../../curator/dist/src/index.js';
import type { FederationConfig, PeerDescriptor } from '../types.js';
import { McpPeerClient } from '../mcp/McpPeerClient.js';
import { createRemoteMcpProxyTool } from '../mcp/RemoteMcpProxyTool.js';
import { MeshEventBridge } from '../events/MeshEventBridge.js';
import { MeshServer } from '../events/MeshServer.js';
import { resolvePeerSession, type PeerSessionResult } from '../identity/PeerSessionResolver.js';

export class PeerConnectionManager {
  public readonly peers = new Map<string, PeerDescriptor>();
  public readonly peerSessions = new Map<string, PeerSessionResult>(); // peerId -> resolved session
  public readonly remoteTools = new Map<string, CuratorTool>();       // fullName -> CuratorTool
  private mcpClients = new Map<string, McpPeerClient>();             // peerId -> McpPeerClient
  public readonly eventBridge: MeshEventBridge;
  public readonly meshServer?: MeshServer;

  constructor(
    public readonly host: CuratorHost,
    public readonly config: FederationConfig
  ) {
    this.eventBridge = new MeshEventBridge(host, config);

    if (config.meshPort) {
      this.meshServer = new MeshServer(this.eventBridge, { port: config.meshPort });
    }

    if (config.peers && Array.isArray(config.peers)) {
      for (const peer of config.peers) {
        this.addPeer(peer).catch((err) => {
          console.warn(`[PeerConnectionManager] Failed initial connect to peer "${peer.id}":`, err?.message || err);
        });
      }
    }
  }

  /**
   * Registers a new peer into the mesh and provisions database User, Role, and Session
   */
  public async addPeer(peer: PeerDescriptor): Promise<void> {
    this.peers.set(peer.id, peer);

    // 1. Resolve Peer Session & DB entities (User, Role, UserRole, Session, Conversation)
    try {
      if (this.host.prisma) {
        const sessionResult = await resolvePeerSession(this.host.prisma, peer);
        this.peerSessions.set(peer.id, sessionResult);

        // Also track/update active peer conversation in database with metadata
        const convExternalId = `conv_peer_${peer.id}`;
        await this.host.prisma.conversation.upsert({
          where: { externalId: convExternalId },
          update: {
            metadata: {
              peerId: peer.id,
              name: peer.name || peer.id,
              mcpUrl: peer.mcpUrl,
              eventsUrl: peer.eventsUrl,
              status: peer.status || 'connected',
              lastSeen: new Date().toISOString(),
            },
          },
          create: {
            externalId: convExternalId,
            userId: sessionResult.userId,
            projectId: sessionResult.projectId,
            metadata: {
              peerId: peer.id,
              name: peer.name || peer.id,
              mcpUrl: peer.mcpUrl,
              eventsUrl: peer.eventsUrl,
              status: peer.status || 'connected',
              lastSeen: new Date().toISOString(),
            },
          },
        });
      }
    } catch (err: any) {
      console.warn(`[PeerConnectionManager] Warning: Could not provision peer database session for "${peer.id}":`, err?.message || err);
    }

    // 2. Setup MCP Client if mcpUrl is provided
    if (peer.mcpUrl) {
      const client = new McpPeerClient(peer);
      this.mcpClients.set(peer.id, client);
      await this.syncPeerTools(peer, client);
    }

    // 3. Connect event bridge if eventsUrl is provided
    if (peer.eventsUrl) {
      this.eventBridge.connectToPeer(peer);
    }
  }

  /**
   * Removes a peer and unregisters its remote tools from the engine
   */
  public async removePeer(peerId: string): Promise<void> {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    // 1. Unregister remote tools from engine
    const prefix = `${peer.name || peer.id}:`;
    for (const [toolName] of this.remoteTools.entries()) {
      if (toolName.startsWith(prefix)) {
        this.remoteTools.delete(toolName);
        this.host.engine.tools.delete(toolName);
      }
    }

    // 2. Disconnect event bridge & MCP client
    this.eventBridge.disconnectFromPeer(peerId);
    this.mcpClients.delete(peerId);
    this.peers.delete(peerId);
  }

  /**
   * Fetches remote tool declarations from peer and registers local proxy tools
   */
  public async syncPeerTools(peer: PeerDescriptor, client: McpPeerClient): Promise<void> {
    try {
      const tools = await client.listTools();
      const prefix = this.config.toolPrefix ?? `${peer.name || peer.id}:`;

      for (const t of tools) {
        const proxyTool = createRemoteMcpProxyTool({
          peer,
          remoteName: t.name,
          description: t.description,
          parameters: t.inputSchema,
          localPrefix: prefix,
          callRemote: async (pId, tName, args) => this.invokeRemoteTool(pId, tName, args),
        });

        this.remoteTools.set(proxyTool.name, proxyTool);
        this.host.engine.registerTool(proxyTool);
      }
    } catch (err: any) {
      console.warn(`[PeerConnectionManager] Tool sync failed for peer "${peer.id}":`, err?.message || err);
    }
  }

  /**
   * Executes a tool on a remote peer
   */
  public async invokeRemoteTool(
    peerId: string,
    toolName: string,
    args: Record<string, unknown> = {}
  ): Promise<any> {
    let client = this.mcpClients.get(peerId);

    // Fallback search by peer name
    if (!client) {
      for (const [id, p] of this.peers.entries()) {
        if (p.name === peerId || id === peerId) {
          client = this.mcpClients.get(id);
          break;
        }
      }
    }

    if (!client) {
      throw new Error(`Remote peer "${peerId}" not connected or has no MCP client configured.`);
    }

    return await client.callTool(toolName, args);
  }

  public async close(): Promise<void> {
    this.eventBridge.close();
    if (this.meshServer) {
      await this.meshServer.close();
    }
    this.mcpClients.clear();
    this.peers.clear();
  }
}
