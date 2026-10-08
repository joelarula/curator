import { WebSocket } from 'ws';
import type { CuratorHost } from '../../../host/dist/index.js';
import type { FederationConfig, MeshEnvelope, PeerDescriptor } from '../types.js';
import { createMeshEnvelope, MeshDeduplicator } from './MeshEnvelope.js';

export class MeshEventBridge {
  private deduplicator = new MeshDeduplicator(2000);
  private peerSockets = new Map<string, WebSocket>(); // peerId -> active outbound WS
  private unsubscribeLocal?: () => void;
  private isClosed = false;

  constructor(
    private host: CuratorHost,
    private config: FederationConfig
  ) {
    this.attachLocalListener();
  }

  private attachLocalListener(): void {
    // Listen to all local host events and broadcast them to the mesh
    this.unsubscribeLocal = this.host.events.onEvent((event: any) => {
      // Don't re-broadcast events that came from the mesh
      if (event.payload?._isMesh) {
        return;
      }

      const envelope = createMeshEnvelope(
        this.config.peerId,
        event.type,
        event.payload,
        0
      );
      this.deduplicator.markSeen(envelope.id);
      this.broadcast(envelope);
    });
  }

  /**
   * Connect to a peer's event WebSocket endpoint
   */
  public connectToPeer(peer: PeerDescriptor): void {
    if (!peer.eventsUrl || this.isClosed) return;
    if (this.peerSockets.has(peer.id)) return;

    try {
      const ws = new WebSocket(peer.eventsUrl);

      ws.on('open', () => {
        peer.status = 'connected';
        peer.lastSeen = new Date().toISOString();
        this.peerSockets.set(peer.id, ws);
      });

      ws.on('message', (data: any) => {
        try {
          const envelope: MeshEnvelope = JSON.parse(data.toString());
          this.handleIncomingEnvelope(envelope);
        } catch (err) {
          console.warn(`[MeshEventBridge] Invalid envelope from peer "${peer.id}":`, err);
        }
      });

      ws.on('error', (err) => {
        peer.status = 'error';
        this.peerSockets.delete(peer.id);
      });

      ws.on('close', () => {
        peer.status = 'disconnected';
        this.peerSockets.delete(peer.id);
      });
    } catch (err) {
      console.warn(`[MeshEventBridge] Failed to connect to peer "${peer.id}" at ${peer.eventsUrl}:`, err);
    }
  }

  /**
   * Disconnect from a peer's event WebSocket
   */
  public disconnectFromPeer(peerId: string): void {
    const ws = this.peerSockets.get(peerId);
    if (ws) {
      ws.close();
      this.peerSockets.delete(peerId);
    }
  }

  /**
   * Handles an incoming MeshEnvelope from another peer
   */
  public handleIncomingEnvelope(envelope: MeshEnvelope): void {
    if (!envelope || !envelope.id) return;

    // Deduplication check
    if (this.deduplicator.hasSeen(envelope.id)) {
      return;
    }
    this.deduplicator.markSeen(envelope.id);

    // Hop limit check
    const maxHops = this.config.maxHops ?? 3;
    if (envelope.hops > maxHops) {
      return;
    }

    // Emit on local host event bus
    const localPayload = {
      ...(typeof envelope.payload === 'object' && envelope.payload !== null
        ? envelope.payload
        : { data: envelope.payload }),
      _isMesh: true,
      _sourcePeer: envelope.sourcePeer,
      _envelopeId: envelope.id,
    };

    // Broadcast on local host event bus
    this.host.events.broadcast(envelope.topic as any, localPayload);

    // Forward to other connected peers (with hop increment) if hop < maxHops
    if (envelope.hops < maxHops) {
      const forwardedEnvelope: MeshEnvelope = {
        ...envelope,
        hops: envelope.hops + 1,
      };
      this.broadcast(forwardedEnvelope, envelope.sourcePeer);
    }
  }

  /**
   * Broadcast an envelope to all connected peer sockets
   */
  public broadcast(envelope: MeshEnvelope, excludePeerId?: string): void {
    const payloadStr = JSON.stringify(envelope);
    for (const [peerId, socket] of this.peerSockets.entries()) {
      if (excludePeerId && peerId === excludePeerId) continue;
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payloadStr);
      }
    }
  }

  /**
   * Manually emit a direct mesh event
   */
  public emitMeshEvent(topic: string, payload: any): void {
    const envelope = createMeshEnvelope(
      this.config.peerId,
      topic,
      payload,
      0
    );
    this.deduplicator.markSeen(envelope.id);
    this.broadcast(envelope);
  }

  public close(): void {
    this.isClosed = true;
    if (this.unsubscribeLocal) {
      this.unsubscribeLocal();
    }
    for (const socket of this.peerSockets.values()) {
      socket.close();
    }
    this.peerSockets.clear();
    this.deduplicator.clear();
  }
}
