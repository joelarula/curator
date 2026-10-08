export interface CuratorRequestProcessorOptions {
    onEvent?: (type: string, payload: any) => void;
    maxConcurrency?: number;
    reserveWebConnections?: number;
    poolLimit?: number;
}
export declare class CuratorRequestProcessor {
    private prisma;
    private timer;
    private isPolling;
    private activeTasks;
    private backoffUntil;
    private workerId;
    private onEvent?;
    private poolLimit;
    private reserveWebConnections;
    private maxConcurrency;
    constructor(prisma: any, options?: CuratorRequestProcessorOptions);
    private emit;
    private createValidatedRequest;
    private getConversationState;
    private updateConversationState;
    start(intervalMs?: number): Promise<void>;
    private syncToolsToDb;
    private syncAgentsToDb;
    private lastScheduleMinuteBucket;
    stop(): void;
    private pollScheduledAgents;
    /**
     * Returns how many new tasks can be started without exceeding the safe concurrency threshold.
     */
    getAvailableConcurrencySlots(): number;
    /**
     * Recovers stale or abandoned tasks locked by a crashed/restarted worker > 5 mins ago.
     */
    private unlockStaleRequests;
    private pollRequests;
    private runTask;
    private processRequest;
    private handleEmitEvent;
    private handleWaitEvent;
    /**
     * Parses a node's `scheduledAt` field into a Date for use in Request.scheduledAt.
     * Supports:
     *  - ISO 8601 strings: "2026-12-25T09:00:00Z"
     *  - Human duration strings: "in 5 minutes", "in 2 hours", "in 1 day"
     *  - undefined/null → returns undefined (execute immediately)
     */
    private resolveScheduledAt;
    private handleSequential;
    private handleParallel;
    private handleJoin;
    private handleRoute;
    private handleGraph;
    private handleHumanInput;
    private handleAgentRef;
    private handleScript;
    private resolveActorPermissions;
    private checkToolAccess;
    private handleTool;
    /**
     * Derives a short context key from a tool name so that downstream nodes can reference
     * tool output with concise expressions like {{discovery.data}} or {{episode}}.
     *
     * Examples:
     *   vikerraadio_discover_episodes → discovery
     *   vikerraadio_process_episode   → episode
     *   vikerraadio_scrape            → scrape
     */
    private toolNameToContextKey;
    private handleSetState;
    /**
     * Curator_Interrupt handler — Play / Pause / Stop for a conversation.
     *
     * mode: 'stop'  (default) — cancels all NEW requests below cancelBelowPriority, then runs handler.
     * mode: 'pause'           — suspends (PAUSED status) all NEW requests below priority, runs handler, then resumes them.
     * mode: 'play'            — resumes all PAUSED requests in this conversation.
     */
    private handleInterrupt;
    private interpolateTemplate;
    private loadConversationHistory;
    private executeAgent;
    private saveResponse;
    private completeRequest;
    private evaluateExpressionAsync;
    private handleAssign;
    private handleIfElse;
    private handleWhile;
    private handleForEach;
}
/**
 * Standard 5-field cron matcher (minute hour dom month dow).
 * Supports numbers, comma lists, ranges (1-5), steps (* / 15, 1-5/2).
 */
export declare function isCronDue(cronExpression: string, date?: Date): boolean;
/**
 * Unified schedule evaluator supporting both 5-field Cron expressions and Bree/Later human syntax
 * (e.g. "0 14 * * 1-5", "every 10 minutes", "every 1 hour", "at 14:00").
 */
export declare function isScheduleDue(schedule: string, date?: Date): boolean;
/**
 * Calculates the next upcoming Date matching the schedule (cron or interval) starting from fromDate.
 */
export declare function computeNextRunDate(schedule: string, fromDate?: Date): Date;
//# sourceMappingURL=CuratorRequestProcessor.d.ts.map