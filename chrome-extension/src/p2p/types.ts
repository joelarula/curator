export type EnvironmentType =
  | 'browser-extension'
  | 'browser-wasm-miniapp'
  | 'native-vm'
  | 'cloud-service';

export interface EnvironmentCapabilities {
  hasDomAccess?: boolean;
  hasGpuInference?: boolean;
  hasPersistentRelationalDb?: boolean;
  hasNativeFileSystem?: boolean;
  hasInteractiveUi?: boolean;
}

export interface PeerEnvironment {
  type: EnvironmentType;
  capabilities?: EnvironmentCapabilities;
  metadata?: Record<string, unknown>;
}

export interface PeerToolDeclaration {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface ExtensionPeerDescriptor {
  id: string;
  name: string;
  environment: PeerEnvironment;
  tools: PeerToolDeclaration[];
  status: 'connected' | 'disconnected' | 'connecting';
  lastSeen: string;
  tabId?: number;
  origin?: string;
}

export interface MeshEventEnvelope {
  id: string;
  sourcePeer: string;
  topic: string;
  timestamp: string;
  hops: number;
  payload: any;
}

// Protocol Message Discriminated Unions
export interface PeerAnnounceMessage {
  type: 'curator:peer:announce';
  peer: {
    id: string;
    name: string;
    environment: PeerEnvironment;
    tools: PeerToolDeclaration[];
  };
}

export interface PeerWelcomeMessage {
  type: 'curator:peer:welcome';
  hubId: string;
  activePeers: ExtensionPeerDescriptor[];
}

export interface PeerJoinedMessage {
  type: 'curator:peer:peer_joined';
  peer: ExtensionPeerDescriptor;
}

export interface PeerLeftMessage {
  type: 'curator:peer:peer_left';
  peerId: string;
}

export interface PeerRequestChannelMessage {
  type: 'curator:peer:request_channel';
  targetPeerId: string;
}

export interface PeerChannelMessage {
  type: 'curator:peer:channel';
  targetPeerId: string;
}

export interface PeerCallToolMessage {
  type: 'curator:peer:call_tool';
  callId: string;
  targetPeerId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface PeerToolResponseMessage {
  type: 'curator:peer:tool_response';
  callId: string;
  result?: any;
  error?: string;
}

export interface PeerBroadcastEventMessage {
  type: 'curator:peer:event';
  envelope: MeshEventEnvelope;
}

export interface PeerHeartbeatMessage {
  type: 'curator:peer:heartbeat';
  peerId: string;
}

export type PeerProtocolMessage =
  | PeerAnnounceMessage
  | PeerWelcomeMessage
  | PeerJoinedMessage
  | PeerLeftMessage
  | PeerRequestChannelMessage
  | PeerChannelMessage
  | PeerCallToolMessage
  | PeerToolResponseMessage
  | PeerBroadcastEventMessage
  | PeerHeartbeatMessage;
