import type { MeshEnvelope } from '../types.js';

export function createMeshEnvelope(
  sourcePeer: string,
  topic: string,
  payload: any,
  hops = 0
): MeshEnvelope {
  return {
    id: `mesh_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    sourcePeer,
    topic,
    timestamp: new Date().toISOString(),
    hops,
    payload,
  };
}

export class MeshDeduplicator {
  private seen = new Set<string>();
  private order: string[] = [];

  constructor(private maxEntries = 1000) {}

  public hasSeen(eventId: string): boolean {
    return this.seen.has(eventId);
  }

  public markSeen(eventId: string): void {
    if (this.seen.has(eventId)) return;

    this.seen.add(eventId);
    this.order.push(eventId);

    if (this.order.length > this.maxEntries) {
      const oldest = this.order.shift();
      if (oldest) {
        this.seen.delete(oldest);
      }
    }
  }

  public clear(): void {
    this.seen.clear();
    this.order = [];
  }
}
