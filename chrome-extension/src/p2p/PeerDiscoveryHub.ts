import type {
  ExtensionPeerDescriptor,
  PeerProtocolMessage,
  PeerToolDeclaration,
  MeshEventEnvelope,
  PeerEnvironment,
} from './types.js';

export interface HubConfig {
  hubId?: string;
  name?: string;
  localTools?: PeerToolDeclaration[];
  onLog?: (level: 'INFO' | 'WARN' | 'ERROR', type: string, message: string, detail?: any) => void;
  executeLocalTool?: (toolName: string, args: Record<string, unknown>) => Promise<any>;
}

export class PeerDiscoveryHub {
  public readonly hubId: string;
  public readonly name: string;
  public readonly environment: PeerEnvironment;
  public readonly peers = new Map<string, ExtensionPeerDescriptor>();
  private peerPorts = new Map<string, chrome.runtime.Port>();
  private pendingCalls = new Map<string, {
    resolve: (val: any) => void;
    reject: (err: any) => void;
    timer: any;
  }>();
  private seenEvents = new Set<string>();
  private localTools: PeerToolDeclaration[] = [];
  private onLog?: (level: 'INFO' | 'WARN' | 'ERROR', type: string, message: string, detail?: any) => void;
  private executeLocalTool?: (toolName: string, args: Record<string, unknown>) => Promise<any>;

  constructor(config: HubConfig = {}) {
    this.hubId = config.hubId || 'chrome-extension';
    this.name = config.name || 'Curator Chrome Extension Hub';
    this.localTools = config.localTools || [];
    this.onLog = config.onLog;
    this.executeLocalTool = config.executeLocalTool;

    this.environment = {
      type: 'browser-extension',
      capabilities: {
        hasDomAccess: true,
        hasInteractiveUi: true,
        hasPersistentRelationalDb: true,
      },
      metadata: {
        runtime: 'Chrome Manifest V3',
      },
    };

    // Register self as the first peer
    this.peers.set(this.hubId, {
      id: this.hubId,
      name: this.name,
      environment: this.environment,
      tools: this.localTools,
      status: 'connected',
      lastSeen: new Date().toISOString(),
    });
  }

  private log(level: 'INFO' | 'WARN' | 'ERROR', type: string, message: string, detail?: any) {
    if (this.onLog) {
      this.onLog(level, type, message, detail);
    } else {
      console.log(`[PeerDiscoveryHub][${level}][${type}] ${message}`, detail || '');
    }
  }

  public updateLocalTools(tools: PeerToolDeclaration[]) {
    this.localTools = tools;
    const self = this.peers.get(this.hubId);
    if (self) {
      self.tools = tools;
    }
  }

  /**
   * Handle incoming connection from a peer (content script, external tab, or extension page)
   */
  public handlePortConnection(port: chrome.runtime.Port) {
    this.log('INFO', 'PEER_CONNECT', `Incoming port connection: ${port.name}`);
    let connectedPeerId: string | null = null;

    port.onMessage.addListener(async (msg: PeerProtocolMessage) => {
      try {
        await this.handleMessage(port, msg, (id) => {
          connectedPeerId = id;
        });
      } catch (err: any) {
        this.log('ERROR', 'PEER_MSG_ERROR', `Failed processing message from port ${port.name}: ${err?.message}`, err);
      }
    });

    port.onDisconnect.addListener(() => {
      if (connectedPeerId) {
        this.handlePeerDisconnect(connectedPeerId);
      }
    });
  }

  private async handleMessage(
    port: chrome.runtime.Port,
    msg: PeerProtocolMessage,
    setPeerId: (id: string) => void
  ) {
    switch (msg.type) {
      case 'curator:peer:announce': {
        const { peer } = msg;
        setPeerId(peer.id);

        const descriptor: ExtensionPeerDescriptor = {
          id: peer.id,
          name: peer.name || peer.id,
          environment: peer.environment,
          tools: peer.tools || [],
          status: 'connected',
          lastSeen: new Date().toISOString(),
          tabId: port.sender?.tab?.id,
          origin: port.sender?.origin,
        };

        this.peers.set(peer.id, descriptor);
        this.peerPorts.set(peer.id, port);

        this.log('INFO', 'PEER_ANNOUNCED', `Peer "${peer.name}" (${peer.id}) joined from env "${peer.environment.type}"`, {
          origin: port.sender?.origin,
          toolsCount: descriptor.tools.length,
        });

        // 1. Send welcome message back to the joining peer with current active peers
        const activePeers = Array.from(this.peers.values()).filter((p) => p.id !== peer.id);
        port.postMessage({
          type: 'curator:peer:welcome',
          hubId: this.hubId,
          activePeers,
        });

        // 2. Broadcast peer_joined to all other existing peers
        this.broadcastToOthers(peer.id, {
          type: 'curator:peer:peer_joined',
          peer: descriptor,
        });
        break;
      }

      case 'curator:peer:heartbeat': {
        const peer = this.peers.get(msg.peerId);
        if (peer) {
          peer.lastSeen = new Date().toISOString();
        }
        break;
      }

      case 'curator:peer:call_tool': {
        const { callId, targetPeerId, toolName, args } = msg;
        this.log('INFO', 'TOOL_DISPATCH', `Call tool "${toolName}" on peer "${targetPeerId}" [CallId: ${callId}]`);

        if (targetPeerId === this.hubId) {
          // Local Hub Tool
          try {
            if (!this.executeLocalTool) {
              throw new Error(`Hub has no executeLocalTool handler configured.`);
            }
            const result = await this.executeLocalTool(toolName, args);
            port.postMessage({
              type: 'curator:peer:tool_response',
              callId,
              result,
            });
          } catch (err: any) {
            port.postMessage({
              type: 'curator:peer:tool_response',
              callId,
              error: err?.message || String(err),
            });
          }
        } else {
          // Route to remote target peer
          const targetPort = this.peerPorts.get(targetPeerId);
          if (!targetPort) {
            port.postMessage({
              type: 'curator:peer:tool_response',
              callId,
              error: `Target peer "${targetPeerId}" not found or disconnected.`,
            });
            return;
          }

          // Register call pending so when target responds, we forward back to the caller
          this.pendingCalls.set(callId, {
            resolve: (result) => {
              port.postMessage({
                type: 'curator:peer:tool_response',
                callId,
                result,
              });
            },
            reject: (error) => {
              port.postMessage({
                type: 'curator:peer:tool_response',
                callId,
                error: error?.message || String(error),
              });
            },
            timer: setTimeout(() => {
              this.pendingCalls.delete(callId);
              port.postMessage({
                type: 'curator:peer:tool_response',
                callId,
                error: `Call to peer "${targetPeerId}" timed out after 30s.`,
              });
            }, 30000),
          });

          targetPort.postMessage(msg);
        }
        break;
      }

      case 'curator:peer:tool_response': {
        const { callId, result, error } = msg;
        const pending = this.pendingCalls.get(callId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingCalls.delete(callId);
          if (error) {
            pending.reject(new Error(error));
          } else {
            pending.resolve(result);
          }
        }
        break;
      }

      case 'curator:peer:event': {
        const { envelope } = msg;
        this.broadcastEvent(envelope);
        break;
      }

      case 'curator:peer:request_channel': {
        // Peer A requests direct channel with Peer B
        const { targetPeerId } = msg;
        const sourcePeerId = Array.from(this.peerPorts.entries()).find(([_, p]) => p === port)?.[0];
        if (sourcePeerId) {
          this.log('INFO', 'PEER_CHANNEL_REQUEST', `Peer "${sourcePeerId}" requested direct channel to "${targetPeerId}"`);
          // Notify target peer
          const targetPort = this.peerPorts.get(targetPeerId);
          if (targetPort) {
            targetPort.postMessage({
              type: 'curator:peer:channel',
              targetPeerId: sourcePeerId,
            });
            port.postMessage({
              type: 'curator:peer:channel',
              targetPeerId,
            });
          }
        }
        break;
      }
    }
  }

  private handlePeerDisconnect(peerId: string) {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    this.log('WARN', 'PEER_DISCONNECT', `Peer "${peer.name}" (${peerId}) disconnected.`);
    this.peers.delete(peerId);
    this.peerPorts.delete(peerId);

    // Broadcast leave
    this.broadcastToOthers(peerId, {
      type: 'curator:peer:peer_left',
      peerId,
    });
  }

  private broadcastToOthers(excludePeerId: string, message: any) {
    for (const [peerId, port] of this.peerPorts.entries()) {
      if (peerId !== excludePeerId) {
        try {
          port.postMessage(message);
        } catch (err) {
          console.warn(`Failed to broadcast to peer ${peerId}:`, err);
        }
      }
    }
  }

  /**
   * Broadcast a distributed mesh event to all connected peers
   */
  public broadcastEvent(envelope: MeshEventEnvelope) {
    if (this.seenEvents.has(envelope.id)) return;
    this.seenEvents.add(envelope.id);

    // Limit seen cache to 2000 entries
    if (this.seenEvents.size > 2000) {
      const first = this.seenEvents.values().next().value;
      if (first) this.seenEvents.delete(first);
    }

    if (envelope.hops >= 5) {
      this.log('WARN', 'MESH_HOP_LIMIT', `Event ${envelope.id} reached max hops (${envelope.hops})`);
      return;
    }

    const nextEnvelope: MeshEventEnvelope = {
      ...envelope,
      hops: envelope.hops + 1,
    };

    this.log('INFO', 'MESH_EVENT', `Event [${nextEnvelope.topic}] from [${nextEnvelope.sourcePeer}] (hop: ${nextEnvelope.hops})`);

    for (const [peerId, port] of this.peerPorts.entries()) {
      if (peerId !== envelope.sourcePeer) {
        try {
          port.postMessage({
            type: 'curator:peer:event',
            envelope: nextEnvelope,
          });
        } catch (err) {
          console.warn(`Failed forwarding event to peer ${peerId}:`, err);
        }
      }
    }
  }

  /**
   * Invoke a tool on any peer in the mesh (called by MCP Server or local AST engine)
   */
  public async callRemoteTool(peerId: string, toolName: string, args: Record<string, unknown>): Promise<any> {
    if (peerId === this.hubId) {
      if (!this.executeLocalTool) {
        throw new Error('Local tool execution not configured on Hub.');
      }
      return this.executeLocalTool(toolName, args);
    }

    const targetPort = this.peerPorts.get(peerId);
    if (!targetPort) {
      throw new Error(`Peer "${peerId}" is not connected to the mesh.`);
    }

    const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCalls.delete(callId);
        reject(new Error(`Remote call "${peerId}:${toolName}" timed out after 30 seconds.`));
      }, 30000);

      this.pendingCalls.set(callId, { resolve, reject, timer });

      targetPort.postMessage({
        type: 'curator:peer:call_tool',
        callId,
        targetPeerId: peerId,
        toolName,
        args,
      });
    });
  }

  /**
   * List all tools across all peers, formatted with peer namespace (<peerId>:<toolName>)
   */
  public listAllFederatedTools(): Array<{
    fullName: string;
    peerId: string;
    toolName: string;
    description?: string;
    parameters?: Record<string, unknown>;
    environment: PeerEnvironment;
  }> {
    const list: Array<any> = [];

    for (const peer of this.peers.values()) {
      for (const tool of peer.tools) {
        list.push({
          fullName: peer.id === this.hubId ? tool.name : `${peer.id}:${tool.name}`,
          peerId: peer.id,
          toolName: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          environment: peer.environment,
        });
      }
    }

    return list;
  }

  /**
   * List all currently active peers
   */
  public listPeers(): ExtensionPeerDescriptor[] {
    return Array.from(this.peers.values());
  }
}
