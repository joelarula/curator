import type { CuratorTool, CuratorPluginDefinition } from '../../../curator/dist/src/index.js';
import type { CuratorHost } from '../../host/dist/index.js';

export interface PeerIdentity {
  id: string;
  name?: string;
  email?: string;
  token?: string;
  roleName?: string;
  allowedTools?: string[];
}

export interface PeerDescriptor {
  id: string;
  name?: string;
  mcpUrl?: string;     // e.g. http://127.0.0.1:3002/mcp or stdio command
  eventsUrl?: string;  // e.g. ws://127.0.0.1:3002/api/events or /api/mesh/events
  status?: 'connected' | 'disconnected' | 'connecting' | 'error';
  lastSeen?: string;
  latencyMs?: number;
  identity?: PeerIdentity;
  token?: string;
  metadata?: Record<string, unknown>;
}

export interface MeshEnvelope {
  id: string;
  sourcePeer: string;
  topic: string;
  timestamp: string;
  hops: number;
  payload: any;
}

export interface FederationConfig {
  peerId: string;
  name?: string;
  meshPort?: number;
  peers?: PeerDescriptor[];
  exposeLocalTools?: boolean;
  toolPrefix?: string; // Prefix for remote tools, default: '<peerId>:' or '<peerName>:'
  heartbeatIntervalMs?: number;
  maxHops?: number;
}

export interface RemoteToolDeclaration {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  peerId: string;
}

export interface FederatedMesh {
  host: CuratorHost;
  config: FederationConfig;
  peers: Map<string, PeerDescriptor>;
  remoteTools: Map<string, CuratorTool>;
  broadcastEvent: (topic: string, payload: any) => void;
  invokeRemoteTool: (peerId: string, toolName: string, args: Record<string, unknown>) => Promise<any>;
  addPeer: (peer: PeerDescriptor) => Promise<void>;
  removePeer: (peerId: string) => Promise<void>;
  getPlugin: () => CuratorPluginDefinition;
  close: () => Promise<void>;
}
