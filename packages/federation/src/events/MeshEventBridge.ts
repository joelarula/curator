import { WebSocket } from 'ws';
import type { CuratorHost } from '../../../host/dist/index.js';
import type { FederationConfig, MeshEnvelope, PeerDescriptor } from '../types.js';
import { createMeshEnvelope, MeshDeduplicator } from './MeshEnvelope.js';

export class MeshEventBridge {
  private deduplicator = new MeshDeduplicator(2000);
  private peerSockets = new Map<string, WebSocket>(); // peerId -> active outbound WS
  private pendingSockets = new Map<string, WebSocket>(); // peerId -> outbound WS still connecting
  private reconnectTimers = new Map<string, { timer: NodeJS.Timeout; delayMs: number }>();
  private incomingTransport?: (envelope: MeshEnvelope) => void; // sends to peers connected to our MeshServer
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
   * Lets the MeshServer deliver envelopes to peers that dialed in to us, so a single
   * live link carries traffic both ways (duplicates are dropped by envelope id).
   */
  public setIncomingTransport(send: (envelope: MeshEnvelope) => void): void {
    this.incomingTransport = send;
  }

  /**
   * Connect to a peer's event WebSocket endpoint; retries with backoff until connected,
   * the peer is disconnected, or the bridge is closed (the peer may not be listening yet).
   */
  public connectToPeer(peer: PeerDescriptor): void {
    if (!peer.eventsUrl || this.isClosed) return;
    if (this.peerSockets.has(peer.id) || this.pendingSockets.has(peer.id)) return;
    this.clearReconnect(peer.id);

    try {
      const ws = new WebSocket(peer.eventsUrl);
      this.pendingSockets.set(peer.id, ws);

      ws.on('open', () => {
        this.pendingSockets.delete(peer.id);
        this.reconnectTimers.delete(peer.id);
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

      ws.on('error', () => {
        peer.status = 'error';
      });

      // 'close' also follows a failed connect attempt
      ws.on('close', () => {
        if (this.peerSockets.get(peer.id) === ws) this.peerSockets.delete(peer.id);
        if (this.pendingSockets.get(peer.id) === ws) this.pendingSockets.delete(peer.id);
        if (peer.status !== 'error') peer.status = 'disconnected';
        this.scheduleReconnect(peer, ws);
      });
    } catch (err) {
      console.warn(`[MeshEventBridge] Failed to connect to peer "${peer.id}" at ${peer.eventsUrl}:`, err);
    }
  }

  private scheduleReconnect(peer: PeerDescriptor, closedSocket: WebSocket): void {
    if (this.isClosed || (closedSocket as any)._meshDisconnected) return;
    const prevDelay = this.reconnectTimers.get(peer.id)?.delayMs ?? 0;
    const delayMs = Math.min(prevDelay ? prevDelay * 2 : 250, 10_000);
    const timer = setTimeout(() => {
      const entry = this.reconnectTimers.get(peer.id);
      if (entry?.timer !== timer) return;
      this.connectToPeerKeepingBackoff(peer, entry);
    }, delayMs);
    timer.unref?.();
    this.reconnectTimers.set(peer.id, { timer, delayMs });
  }

  private connectToPeerKeepingBackoff(peer: PeerDescriptor, entry: { timer: NodeJS.Timeout; delayMs: number }): void {
    this.connectToPeer(peer);
    // connectToPeer clears the timer entry; keep the delay so the next failure backs off further
    if (!this.peerSockets.has(peer.id)) this.reconnectTimers.set(peer.id, entry);
  }

  private clearReconnect(peerId: string): void {
    const entry = this.reconnectTimers.get(peerId);
    if (entry) clearTimeout(entry.timer);
    this.reconnectTimers.delete(peerId);
  }

  /**
   * Disconnect from a peer's event WebSocket (stops reconnect attempts)
   */
  public disconnectFromPeer(peerId: string): void {
    this.clearReconnect(peerId);
    for (const sockets of [this.peerSockets, this.pendingSockets]) {
      const ws = sockets.get(peerId);
      if (ws) {
        (ws as any)._meshDisconnected = true;
        ws.close();
        sockets.delete(peerId);
      }
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
   * Broadcast an envelope to all connected peer sockets, outbound and incoming
   */
  public broadcast(envelope: MeshEnvelope, excludePeerId?: string): void {
    const payloadStr = JSON.stringify(envelope);
    for (const [peerId, socket] of this.peerSockets.entries()) {
      if (excludePeerId && peerId === excludePeerId) continue;
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payloadStr);
      }
    }
    this.incomingTransport?.(envelope);
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
    for (const entry of this.reconnectTimers.values()) {
      clearTimeout(entry.timer);
    }
    this.reconnectTimers.clear();
    for (const socket of [...this.peerSockets.values(), ...this.pendingSockets.values()]) {
      socket.close();
    }
    this.peerSockets.clear();
    this.pendingSockets.clear();
    this.deduplicator.clear();
  }
}
