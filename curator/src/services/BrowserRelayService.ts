import { logger } from '../utils/logger.js';

export interface BrowserPageRequest {
  id?: string;
  url: string;
  waitForSelector?: string;
  timeoutMs?: number;
  extract?: 'all' | 'html' | 'text' | 'metadata';
}

export interface BrowserPageResult {
  url: string;
  title: string;
  html?: string;
  text?: string;
  meta?: Record<string, string>;
  isJsRendered: boolean;
  durationMs: number;
  workerId?: string;
}

export interface BrowserWorker {
  id: string;
  name: string;
  type: 'chrome-extension' | 'standalone-browser';
  connectedAt: Date;
  lastSeenAt: Date;
  activeTasks: number;
  dispatchTask: (task: BrowserPageRequest) => Promise<BrowserPageResult>;
}

export class BrowserRelayService {
  private workers = new Map<string, BrowserWorker>();
  private pendingTasks = new Map<string, {
    resolve: (res: BrowserPageResult) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }>();

  /**
   * Register an active browser worker (e.g. Chrome Extension instance).
   */
  public registerWorker(worker: BrowserWorker): () => void {
    this.workers.set(worker.id, worker);
    logger.info(`[BrowserRelayService] Worker registered: ${worker.name} (${worker.id}) [Total: ${this.workers.size}]`);

    return () => {
      this.workers.delete(worker.id);
      logger.info(`[BrowserRelayService] Worker disconnected: ${worker.name} (${worker.id}) [Total: ${this.workers.size}]`);
    };
  }

  /**
   * Check if at least one live browser worker is connected.
   */
  public hasAvailableWorker(): boolean {
    return this.workers.size > 0;
  }

  /**
   * Returns list of connected workers.
   */
  public getWorkers(): Array<{ id: string; name: string; type: string; lastSeenAt: Date; activeTasks: number }> {
    return Array.from(this.workers.values()).map(w => ({
      id: w.id,
      name: w.name,
      type: w.type,
      lastSeenAt: w.lastSeenAt,
      activeTasks: w.activeTasks,
    }));
  }

  /**
   * Request a page rendered inside a connected browser extension tab, or fallback to Node fetch.
   */
  public async requestPage(options: BrowserPageRequest): Promise<BrowserPageResult> {
    const startTime = Date.now();
    const taskId = options.id || `task_${Math.random().toString(36).substring(2, 9)}`;
    const timeoutMs = options.timeoutMs || 30000;

    // 1. If we have a connected Chrome extension worker, dispatch to it
    const availableWorker = this.getBestWorker();
    if (availableWorker) {
      try {
        availableWorker.activeTasks += 1;
        logger.info(`[BrowserRelayService] Dispatching URL to worker ${availableWorker.name}: ${options.url}`);
        const result = await availableWorker.dispatchTask({
          ...options,
          id: taskId,
          timeoutMs,
        });
        return {
          ...result,
          isJsRendered: true,
          durationMs: Date.now() - startTime,
          workerId: availableWorker.id,
        };
      } catch (err: any) {
        logger.warn(`[BrowserRelayService] Worker ${availableWorker.name} failed: ${err.message}. Falling back to fetch.`);
      } finally {
        availableWorker.activeTasks = Math.max(0, availableWorker.activeTasks - 1);
      }
    }

    // 2. Fallback: Native Node HTTP fetch (without JS hydration)
    logger.info(`[BrowserRelayService] No browser worker available. Executing direct HTTP fetch: ${options.url}`);
    const response = await fetch(options.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) CuratorEngine/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText} fetching ${options.url}`);
    }

    const html = await response.text();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : options.url;
    const text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                     .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                     .replace(/<[^>]+>/g, ' ')
                     .replace(/\s+/g, ' ')
                     .trim();

    return {
      url: options.url,
      title,
      html: options.extract === 'text' ? undefined : html,
      text: options.extract === 'html' ? undefined : text,
      isJsRendered: false,
      durationMs: Date.now() - startTime,
    };
  }

  private getBestWorker(): BrowserWorker | null {
    if (this.workers.size === 0) return null;
    // Pick worker with least active tasks
    let best: BrowserWorker | null = null;
    for (const worker of this.workers.values()) {
      if (!best || worker.activeTasks < best.activeTasks) {
        best = worker;
      }
    }
    return best;
  }
}

// Global Singleton Instance
export const browserRelayService = new BrowserRelayService();
