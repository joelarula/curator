import type {
  PeerEnvironment,
  PeerToolDeclaration,
  ExtensionPeerDescriptor,
  MeshEventEnvelope,
  PeerProtocolMessage,
} from './types.js';

export interface BrowserPeerClientConfig {
  peerId: string;
  name: string;
  environment?: Partial<PeerEnvironment>;
  tools?: Array<{
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
    execute: (args: Record<string, unknown>) => Promise<any> | any;
  }>;
  onEvent?: (topic: string, payload: any, envelope: MeshEventEnvelope) => void;
  onPeerJoined?: (peer: ExtensionPeerDescriptor) => void;
  onPeerLeft?: (peerId: string) => void;
}

export class BrowserPeerClient {
  public readonly peerId: string;
  public readonly name: string;
  public readonly environment: PeerEnvironment;
  private tools = new Map<string, {
    declaration: PeerToolDeclaration;
    execute: (args: any) => Promise<any> | any;
  }>();
  private activePeers = new Map<string, ExtensionPeerDescriptor>();
  private onEvent?: (topic: string, payload: any, envelope: MeshEventEnvelope) => void;
  private onPeerJoined?: (peer: ExtensionPeerDescriptor) => void;
  private onPeerLeft?: (peerId: string) => void;
  private isConnected = false;
  private heartbeatInterval: any = null;

  constructor(config: BrowserPeerClientConfig) {
    this.peerId = config.peerId;
    this.name = config.name;
    this.environment = {
      type: 'browser-wasm-miniapp',
      capabilities: {
        hasInteractiveUi: true,
        hasPersistentRelationalDb: true,
        ...(config.environment?.capabilities || {}),
      },
      metadata: config.environment?.metadata || {},
    };

    if (config.tools) {
      for (const t of config.tools) {
        this.tools.set(t.name, {
          declaration: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
          execute: t.execute,
        });
      }
    }

    this.onEvent = config.onEvent;
    this.onPeerJoined = config.onPeerJoined;
    this.onPeerLeft = config.onPeerLeft;
  }

  /**
   * Connect to the Curator Extension Mesh via window.postMessage
   */
  public async connect(): Promise<void> {
    if (this.isConnected) return;

    window.addEventListener('message', this.handleWindowMessage);

    // Announce to the content script bridge
    const toolDeclarations: PeerToolDeclaration[] = Array.from(this.tools.values()).map(
      (t) => t.declaration
    );

    window.postMessage(
      {
        source: 'curator-peer-client',
        type: 'curator:peer:announce',
        peer: {
          id: this.peerId,
          name: this.name,
          environment: this.environment,
          tools: toolDeclarations,
        },
      },
      '*'
    );

    this.isConnected = true;

    // Start heartbeat
    this.heartbeatInterval = setInterval(() => {
      window.postMessage(
        {
          source: 'curator-peer-client',
          type: 'curator:peer:heartbeat',
          peerId: this.peerId,
        },
        '*'
      );
    }, 10000);
  }

  public disconnect(): void {
    if (!this.isConnected) return;
    clearInterval(this.heartbeatInterval);
    window.removeEventListener('message', this.handleWindowMessage);
    this.isConnected = false;
  }

  private handleWindowMessage = async (event: MessageEvent) => {
    const data = event.data;
    if (!data || data.source !== 'curator-content-bridge') return;

    switch (data.type) {
      case 'curator:peer:welcome': {
        const { activePeers } = data;
        this.activePeers.clear();
        for (const p of activePeers) {
          this.activePeers.set(p.id, p);
        }
        console.log(`[BrowserPeerClient:${this.peerId}] Welcomed to mesh! Active peers:`, activePeers.map((p: any) => p.name));
        break;
      }

      case 'curator:peer:peer_joined': {
        const { peer } = data;
        this.activePeers.set(peer.id, peer);
        this.onPeerJoined?.(peer);
        break;
      }

      case 'curator:peer:peer_left': {
        const { peerId } = data;
        this.activePeers.delete(peerId);
        this.onPeerLeft?.(peerId);
        break;
      }

      case 'curator:peer:call_tool': {
        const { callId, toolName, args } = data;
        const tool = this.tools.get(toolName);
        if (!tool) {
          window.postMessage(
            {
              source: 'curator-peer-client',
              type: 'curator:peer:tool_response',
              callId,
              error: `Tool "${toolName}" not found on peer "${this.peerId}"`,
            },
            '*'
          );
          return;
        }

        try {
          const result = await tool.execute(args || {});
          window.postMessage(
            {
              source: 'curator-peer-client',
              type: 'curator:peer:tool_response',
              callId,
              result,
            },
            '*'
          );
        } catch (err: any) {
          window.postMessage(
            {
              source: 'curator-peer-client',
              type: 'curator:peer:tool_response',
              callId,
              error: err?.message || String(err),
            },
            '*'
          );
        }
        break;
      }

      case 'curator:peer:event': {
        const { envelope } = data;
        this.onEvent?.(envelope.topic, envelope.payload, envelope);
        break;
      }
    }
  };

  /**
   * Broadcast an event across the mesh to all peers
   */
  public broadcastEvent(topic: string, payload: any): void {
    const envelope: MeshEventEnvelope = {
      id: `mesh_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      sourcePeer: this.peerId,
      topic,
      timestamp: new Date().toISOString(),
      hops: 0,
      payload,
    };

    window.postMessage(
      {
        source: 'curator-peer-client',
        type: 'curator:peer:event',
        envelope,
      },
      '*'
    );
  }

  /**
   * Invoke a tool on another peer (e.g. 'chrome-extension' or another MiniApp)
   */
  public async invokeRemoteTool(targetPeerId: string, toolName: string, args: Record<string, unknown> = {}): Promise<any> {
    const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        window.removeEventListener('message', responseHandler);
        reject(new Error(`Call "${targetPeerId}:${toolName}" timed out after 30s`));
      }, 30000);

      const responseHandler = (event: MessageEvent) => {
        const data = event.data;
        if (!data || data.source !== 'curator-content-bridge') return;

        if (data.type === 'curator:peer:tool_response' && data.callId === callId) {
          clearTimeout(timeout);
          window.removeEventListener('message', responseHandler);
          if (data.error) {
            reject(new Error(data.error));
          } else {
            resolve(data.result);
          }
        }
      };

      window.addEventListener('message', responseHandler);

      window.postMessage(
        {
          source: 'curator-peer-client',
          type: 'curator:peer:call_tool',
          callId,
          targetPeerId,
          toolName,
          args,
        },
        '*'
      );
    });
  }

  public getActivePeers(): ExtensionPeerDescriptor[] {
    return Array.from(this.activePeers.values());
  }
}
