import { PrismaClient } from '@prisma/client';
import { executeTool } from './Tools.js';

export class RequestProcessor {
    private prisma: PrismaClient;
    private timer: NodeJS.Timeout | null = null;
    private isRunning = false;
    private workerId = `worker-${Math.random().toString(36).substring(7)}`;
    private requestsProcessed = 0;

    public isAdHoc = false;

    constructor(prisma: PrismaClient) {
        this.prisma = prisma;
    }

    start(intervalMs: number = 5000) {
        console.log(`[RequestProcessor] Starting worker ${this.workerId} with ${intervalMs}ms interval...`);
        this.timer = setInterval(() => this.pollRequests(), intervalMs);
        this.pollRequests();
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    private async pollRequests() {
        if (this.isRunning) return;
        this.isRunning = true;

        try {
            let hasMore = true;
            while (hasMore) {
                // Find and lock NEW requests atomically using a raw update query 
                const lockedRequests = await this.prisma.$queryRaw<any[]>`
                    UPDATE "Request"
                    SET status = 'WAITING', "lockedBy" = ${this.workerId}, "lockedAt" = NOW()
                    WHERE id IN (
                        SELECT id FROM "Request"
                        WHERE status = 'NEW'
                        ORDER BY "createdAt" ASC
                        LIMIT 10
                        FOR UPDATE SKIP LOCKED
                    )
                    RETURNING *;
                `;

                if (!lockedRequests || lockedRequests.length === 0) {
                    hasMore = false;
                    break;
                }

                // Process the batch concurrently
                await Promise.all(lockedRequests.map(req => this.processRequest(req)));
            }
        } catch (error) {
            console.error('[RequestProcessor] Error polling requests:', error);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Recursively resolves all resources in the request lineage, from the leaf to the root.
     * This creates a "Stack" where nearest resources shadow parent resources.
     */
    private async resolveResourceStack(requestId: number): Promise<any[]> {
        const stack: any[] = [];
        let currentId: number | null = requestId;
        const seenIds = new Set<number>();

        while (currentId && !seenIds.has(currentId)) {
            seenIds.add(currentId);
            const reqRecord: any = await this.prisma.request.findUnique({
                where: { id: currentId },
                include: { resources: { include: { resourceType: true } } }
            });

            if (!reqRecord) break;

            // Add all resources of this request to the stack (at the end of current stack)
            stack.push(...reqRecord.resources);
            currentId = reqRecord.parentId;
        }

        return stack;
    }

    public async processRequest(request: any) {
        console.log(`[RequestProcessor] Processing request ${request.id}`);
        try {
            // Fetch request details
            const req = await this.prisma.request.findUnique({
                where: { id: request.id },
                include: { user: true, resources: true }
            });

            if (!req) throw new Error(`Request ${request.id} not found`);

            // Resolve the complete Resource Stack for this request
            const resourceStack = await this.resolveResourceStack(req.id);

            // Fetch or create response shell
            let response = await this.prisma.response.findFirst({
                where: { requestId: request.id }
            });

            if (!response) {
                response = await this.prisma.response.create({
                    data: {
                        requestId: request.id,
                        conversationId: request.conversationId,
                        content: "",
                    }
                });
            }

            const toolCalls: any = req.toolCalls;
            if (Array.isArray(toolCalls) && toolCalls.length > 0) {
                await this.executeToolSequence(toolCalls, req, resourceStack, response.id);
            } else {
                console.log(`[RequestProcessor] Nothing to do for request ${req.id}.`);
            }

            // Mark Request as completed
            await this.prisma.request.update({
                where: { id: request.id },
                data: { status: 'COMPLETED' }
            });
            this.requestsProcessed++;

            console.log(`[RequestProcessor] Finished processing request ${request.id}`);

        } catch (error: any) {
            console.error(`[RequestProcessor] Failed request ${request.id}:`, error);
            // Revert status to NEW for retry, or FAILED if max retries
            await this.prisma.request.update({
                where: { id: request.id },
                data: {
                    status: request.retryCount >= 3 ? 'FAILED' : 'NEW',
                    retryCount: { increment: 1 },
                    lockedBy: null,
                    lockedAt: null
                }
            });
        }
    }

    /**
     * Executes a sequence of tool calls. Chained callbacks execute recursively here.
     */
    private async executeToolSequence(
        calls: any[], 
        req: any, 
        resourceStack: any[], 
        responseId: number, 
        previousResults: Record<string, any> = {}, 
        initialToolData: any = null,
        initialContext: Record<string, any> = {}
    ) {
        const toolResults = { ...previousResults };
        let currentToolData = initialToolData;

        for (const call of calls) {
            if (!call.name) continue;

            // Handle legacy spawn boolean or new ToolFlow structure
            const isSpawn = call.spawn === true;
            if (isSpawn) {
                const childReq = await this.prisma.request.create({
                    data: {
                        status: 'NEW',
                        toolName: call.name,
                        toolArgs: call.args ?? null,
                        callbacks: call.callbacks ?? null,
                        scriptId: req.scriptId,
                        userId: req.userId,
                        toolCalls: [{ ...call, spawn: false }] as any,
                        conversationId: req.conversationId,
                        parentId: req.id,
                        // Inherit current resources
                        ...(req.resources?.length ? { resources: { connect: req.resources.map((r: any) => ({ id: r.id })) } } : {}),
                    }
                });
                console.log(`[Orchestrator] Spawned detached child Request for tool: ${call.name}`);
                
                if (this.isAdHoc) {
                    await this.processRequest(childReq);
                }
                continue;
            }

            // Execute INLINE
            const { onItemExtracted: _oie, onSuccess: _os, ...toolArgs } = call.args ?? {};
            const materializedArgs = this.materializeToolArgs(toolArgs, { 
                resources: resourceStack,
                toolResults,
                toolData: currentToolData,
                ...initialContext
            });

            const result: any = await executeTool(
                call.name,
                materializedArgs,
                this.prisma,
                req.userId,
                responseId,
                req
            );

            console.log(`[Orchestrator] Tool ${call.name} result: data=${!!result?.data}, createdItem=${!!result?.createdItem}`);

            // Store result for subsequent tools in this chain
            currentToolData = result.data ?? result;
            toolResults[call.name] = currentToolData;

            // Persistence: AI Model
            if (result?.aiModel) {
                const aiModel = await this.prisma.aIModel.upsert({
                    where: { name: result.aiModel.name },
                    update: { provider: result.aiModel.provider, type: result.aiModel.type || 'GENERATIVE' },
                    create: {
                        shortName: result.aiModel.shortName || result.aiModel.name.split('/').pop()?.toLowerCase() || 'unknown',
                        name: result.aiModel.name,
                        provider: result.aiModel.provider,
                        type: result.aiModel.type || 'GENERATIVE'
                    }
                });
                await this.prisma.request.update({ where: { id: req.id }, data: { aiModelId: aiModel.id } });
            }

            // Persistence: Created Item
            if (result?.createdItem) {
                await this.prisma.request.update({
                    where: { id: req.id },
                    data: { resources: { connect: { id: result.createdItem.id } } }
                });
                // Update local stack for subsequent tools in this chain
                resourceStack.unshift(result.createdItem);
                
                if (!req.resources) req.resources = [];
                if (!req.resources.some((r: any) => r.id === result.createdItem.id)) {
                    req.resources.push(result.createdItem);
                }
            }

            // Persistence: Response Data
            const responseData = result?.data ?? result;
            if (responseData) {
                let content = typeof responseData === 'string' ? responseData : JSON.stringify(responseData, null, 2);
                await this.prisma.response.update({ where: { id: responseId }, data: { content } });
                
                if (this.isAdHoc) {
                    console.log(`--- RESPONSE (${call.name}) ---\n${content}\n------------------------`);
                }
            }

            // Handle Callbacks (onItemExtracted, onSuccess, onFailure)
            const callbacks = call.callbacks || {};
            for (const [hook, flow] of Object.entries(callbacks)) {
                const items = result?.items || result?.extractedItems;
                const context = {
                    ...initialContext,
                    toolData: result.data,
                    toolResults
                };

                if (hook === 'onItemExtracted' && Array.isArray(items)) {
                    for (const item of items) {
                        await this.dispatchFlow(flow as any, req, resourceStack, responseId, { 
                            ...context,
                            item,
                            parentItem: initialContext.item 
                        });
                    }
                } else if (hook === 'onSuccess' && result) {
                    await this.dispatchFlow(flow as any, req, resourceStack, responseId, context);
                }
            }
        }
    }

    /**
     * Dispatches a flow (either 'spawn' or 'chain').
     */
    private async dispatchFlow(flow: any, req: any, resourceStack: any[], responseId: number, context: any) {
        let childCalls: any[] = [];
        let scriptId = req.scriptId;

        if (flow.yieldTemplateName) {
            const script = await this.prisma.script.findUnique({ where: { name: flow.yieldTemplateName } });
            if (script) {
                childCalls = script.toolCalls as any[];
                scriptId = script.id;
            }
        } else if (flow.spawn || flow.chain) {
            childCalls = flow.spawn || flow.chain;
        }

        if (!childCalls || childCalls.length === 0) return;

        // Materialize templates in the calls using the provided context
        const materializedCalls = this.materializeToolArgs(childCalls, {
            resources: resourceStack,
            ...context
        });

        if (flow.chain) {
            // IMMEDIATE RECURSION
            console.log(`[Orchestrator] Chaining ${materializedCalls.length} calls immediately.`);
            await this.executeToolSequence(materializedCalls, req, resourceStack, responseId, context.toolResults, context.toolData, context);

        } else {
            // SPAWN NEW REQUEST
            const primary = materializedCalls[0];
            const childReq = await this.prisma.request.create({
                data: {
                    status: 'NEW',
                    toolName: primary.name,
                    toolArgs: primary.args,
                    callbacks: primary.callbacks,
                    scriptId: scriptId,
                    userId: req.userId,
                    toolCalls: materializedCalls,
                    conversationId: req.conversationId,
                    parentId: req.id,
                    // Connect nearest item if provided in context
                    resources: {
                        connect: context.item?.id ? [{ id: context.item.id }] : []
                    }
                }
            });
            console.log(`[Orchestrator] Spawned child request for ${primary.name}`);
            
            if (this.isAdHoc) {
                await this.processRequest(childReq);
            }
        }
    }

    getState() {
        return {
            isRunning: this.timer !== null,
            requestsProcessed: this.requestsProcessed
        };
    }

    /**
     * Replaces placeholders like {{resource.title}}, {{item.code}}, {{toolData.result}}, or {{tool_name.field}} in tool arguments.
     */
    private materializeToolArgs(args: any, context: { resources?: any[], toolData?: any, item?: any, toolResults?: Record<string, any> }): any {
        if (!args) return args;


        const resource = context.resources?.[0];
        const toolData = context.toolData || {};
        const item = context.item || {};
        const toolResults = context.toolResults || {};

        const cloneAndMaterialize = (obj: any): any => {
            if (Array.isArray(obj)) {
                return obj.map(cloneAndMaterialize);
            }
            if (obj && typeof obj === 'object') {
                const result: any = {};
                for (const [k, v] of Object.entries(obj)) {
                    if (k === 'spawn' || k === 'chain' || k === 'onSuccess' || k === 'onItemExtracted' || k === 'onFailure') {
                        result[k] = v;
                    } else {
                        result[k] = cloneAndMaterialize(v);
                    }
                }
                return result;
            }
            if (typeof obj === 'string') {
                // If the entire string is exactly one template, return the raw value
                const fullMatch = obj.match(/^\{\{([^}]+)\}\}$/);
                if (fullMatch) {
                    const path = fullMatch[1];
                    if (!path) return obj;
                    const parts = path.split('.');

                    const root = parts[0] as string;
                    const property = parts.slice(1).join('.');

                    let source: any = null;
                    if (root === 'resource') source = resource;
                    else if (root === 'item') source = item;
                    else if (root === 'toolData') source = toolData;
                    else if (root && toolResults[root]) source = toolResults[root];


                    if (source) {
                        const value = property ? property.split('.').reduce((acc: any, p: string) => acc?.[p], source) : source;
                        if (value !== undefined && value !== null && typeof value !== 'function') return value;

                    }
                }

                // Otherwise handle as a template string with interpolation
                return obj.replace(/\{\{([^}]+)\}\}/g, (match, path) => {

                    const parts = path.split('.');
                    const root = parts[0];
                    const property = parts.slice(1).join('.');

                    let source: any = null;
                    if (root === 'resource') source = resource;
                    else if (root === 'item') source = item;
                    else if (root === 'toolData') source = toolData;
                    else if (toolResults[root]) source = toolResults[root];

                    if (!source) return match;

                    // Resolve nested properties, avoiding functions/prototypes
                    const value = property ? property.split('.').reduce((acc: any, p: string) => acc?.[p], source) : source;
                    
                    if (path.startsWith('item.')) {
                        console.log(`[RequestProcessor] Template Replace: path="${path}" value=${JSON.stringify(value)}`);
                    }

                    return value !== undefined && value !== null && typeof value !== 'function' ? String(value) : match;
                });

            }
            return obj;
        };

        return cloneAndMaterialize(args);
    }
}
