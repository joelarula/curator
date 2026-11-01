import { logger } from '../utils/logger.js';

/**
 * Cross-node wake-ups over Postgres LISTEN/NOTIFY (docs/DISTRIBUTED_STORAGE_PLAN.md, Phase 2). A notification is
 * only a hint that runnable work may exist: the database stays the source of truth, and a lost notification costs
 * one poll interval. NOTIFY goes through the processor's own client (it works through pooled connections); LISTEN
 * needs a session connection of its own, so it takes a direct URL (not PgBouncer in transaction mode).
 */
export const WAKE_CHANNEL = 'curator_wake';

const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 30_000;

export class PostgresWakeChannel {
  private client: any = null;
  private closed = false;
  private retryMs = RETRY_MIN_MS;
  private retryTimer: NodeJS.Timeout | null = null;
  private sendPending = false;

  /**
   * @param prisma client used to send notifications
   * @param self this worker's id: its own notifications are ignored (it has already woken itself)
   * @param onWake called for every notification from another worker
   * @param listenUrl direct connection URL to LISTEN on; without it this worker only sends
   */
  constructor(
    private readonly prisma: any,
    private readonly self: string,
    private readonly onWake: () => void,
    private readonly listenUrl?: string
  ) {}

  /** True while the LISTEN connection is up (the poll interval is then only a fallback). */
  get listening(): boolean {
    return this.client != null;
  }

  start(): void {
    this.closed = false;
    if (this.listenUrl) void this.connect();
  }

  /** Tells the other workers to poll; calls in the same turn of the event loop send one notification. */
  notify(): void {
    if (this.sendPending || this.closed) return;
    this.sendPending = true;
    setImmediate(async () => {
      this.sendPending = false;
      try {
        await this.prisma.$executeRawUnsafe('SELECT pg_notify($1, $2)', WAKE_CHANNEL, this.self);
      } catch (err: any) {
        logger.debug(`[WakeChannel] notify failed: ${err?.message || err}`);
      }
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const client = this.client;
    this.client = null;
    await client?.end().catch(() => {});
  }

  private async connect(): Promise<void> {
    if (this.closed) return;
    let client: any;
    try {
      const pgMod: any = await import('pg');
      client = new (pgMod.default ?? pgMod).Client({ connectionString: this.listenUrl, keepAlive: true });
      client.on('notification', (msg: any) => {
        if (msg.channel === WAKE_CHANNEL && msg.payload !== this.self) this.onWake();
      });
      client.on('error', (err: any) => this.lost(client, err));
      client.on('end', () => this.lost(client));
      await client.connect();
      await client.query(`LISTEN ${WAKE_CHANNEL}`);
      if (this.closed) {
        await client.end().catch(() => {});
        return;
      }
      this.client = client;
      this.retryMs = RETRY_MIN_MS;
      // Work may have been announced while this worker was not listening
      this.onWake();
    } catch (err: any) {
      await client?.end().catch(() => {});
      this.lost(null, err);
    }
  }

  /** Drops a broken connection and reconnects with backoff; polling covers the gap. */
  private lost(client: any, err?: any): void {
    if (client && this.client !== client) return;
    this.client = null;
    if (this.closed || this.retryTimer) return;
    logger.warn(`[WakeChannel] LISTEN connection lost${err ? `: ${err.message || err}` : ''}; retrying in ${this.retryMs}ms`);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connect();
    }, this.retryMs);
    this.retryTimer.unref?.();
    this.retryMs = Math.min(this.retryMs * 2, RETRY_MAX_MS);
  }
}
