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
export declare class BrowserRelayService {
    private workers;
    private pendingTasks;
    /**
     * Register an active browser worker (e.g. Chrome Extension instance).
     */
    registerWorker(worker: BrowserWorker): () => void;
    /**
     * Check if at least one live browser worker is connected.
     */
    hasAvailableWorker(): boolean;
    /**
     * Returns list of connected workers.
     */
    getWorkers(): Array<{
        id: string;
        name: string;
        type: string;
        lastSeenAt: Date;
        activeTasks: number;
    }>;
    /**
     * Request a page rendered inside a connected browser extension tab, or fallback to Node fetch.
     */
    requestPage(options: BrowserPageRequest): Promise<BrowserPageResult>;
    private getBestWorker;
}
export declare const browserRelayService: BrowserRelayService;
//# sourceMappingURL=BrowserRelayService.d.ts.map