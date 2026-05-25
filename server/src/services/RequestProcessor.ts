import { PrismaClient } from '@prisma/client';
import { executeTool } from './Tools.js';
import { VOCAB } from '../constants/vocabulary.js';

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
                          AND ( "executionScheduled" IS NULL OR "executionScheduled" <= NOW() )
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
                include: { resources: true }
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

        // If scheduled in the future, wait (especially useful for ad-hoc testing)
        if (request.executionScheduled && new Date(request.executionScheduled) > new Date()) {
            const delay = new Date(request.executionScheduled).getTime() - Date.now();
            if (delay > 0) {
                console.log(`[RequestProcessor] Request ${request.id} is scheduled for ${request.executionScheduled}. Waiting ${Math.round(delay/1000)}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        try {
            // 1. Ensure the Conversation is anchored as a Semantic Resource in the graph
            const convResource = await this.ensureConversationResource(request.conversationId, request.userId);

            // 2. Fetch request details
            const req = await this.prisma.request.findUnique({
                where: { id: request.id },
                include: { user: true, resources: true }
            });

            if (!req) throw new Error(`Request ${request.id} not found`);

            // 3. Link Request to the Conversation Resource if not already linked
            if (!req.resources.some((r: any) => r.id === convResource.id)) {
                await this.prisma.request.update({
                    where: { id: req.id },
                    data: { resources: { connect: { id: convResource.id } } }
                });
                req.resources.push(convResource);
            }

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

            const ast: any = req.ast || (
                req.toolCalls && 
                typeof req.toolCalls === 'object' && 
                !Array.isArray(req.toolCalls) && 
                (req.toolCalls as any).type === 'Sequence' 
                    ? req.toolCalls 
                    : null
            );
            const toolCalls: any = req.toolCalls;
            const initialContext = (req.context as any) || {};

            if (ast) {
                // Execute the new Formal Execution AST
                await this.executeAST(ast, req, resourceStack, response.id, initialContext);
            } else if (Array.isArray(toolCalls) && toolCalls.length > 0) {
                // Legacy callback-based JSON execution
                await this.executeToolSequence(toolCalls, req, resourceStack, response.id, initialContext.toolResults || {}, initialContext.toolData || null, initialContext);
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
            
            // Exponential backoff: 5s, 15s, 45s
            const backoffSeconds = Math.pow(3, request.retryCount) * 5;
            const nextScheduled = new Date(Date.now() + backoffSeconds * 1000);

            // Revert status to NEW for retry, or FAILED if max retries
            await this.prisma.request.update({
                where: { id: request.id },
                data: {
                    status: request.retryCount >= 3 ? 'FAILED' : 'NEW',
                    retryCount: { increment: 1 },
                    executionScheduled: request.retryCount >= 3 ? null : nextScheduled,
                    lockedBy: null,
                    lockedAt: null
                }
            });
        }
    }

    /**
     * Ensures a Conversation is represented as a Resource in the graph.
     */
    private async ensureConversationResource(conversationId: number, userId: string) {
        const conversation = await this.prisma.conversation.findUnique({
            where: { id: conversationId }
        });
        if (!conversation) throw new Error(`Conversation ${conversationId} not found`);

        const uri = `conversation:${conversation.externalId}`;
        return await this.prisma.resource.upsert({
            where: { uri },
            update: { deletedAt: null },
            create: {
                uri,
                title: `Conversation ${conversation.externalId.substring(0, 8)}`,
                userId,
                deletedAt: null,
                isPublished: false
            }
        });
    }

    /**
     * Executes the new Formal Execution AST.
     * Evaluates control flow nodes (Sequence, ForEach, Spawn) and ToolNodes.
     */
    private async executeAST(
        node: any,
        req: any,
        resourceStack: any[],
        responseId: number,
        context: Record<string, any>
    ) {
        if (!node) return;

        // Ensure shared state containers exist at the current level
        if (!context.toolData) context.toolData = {};
        if (!context.toolOutputs) context.toolOutputs = {};

        switch (node.type) {
            case 'Sequence': {
                for (const step of node.steps || []) {
                    await this.executeAST(step, req, resourceStack, responseId, context);
                }
                break;
            }

            case 'ToolTask': {
                const materializedArgs = await this.materializeToolArgs(node.args, {
                    ...context,
                    resources: resourceStack,
                    conversationId: req.conversationId
                });

                const result: any = await executeTool(
                    node.tool,
                    materializedArgs,
                    this.prisma,
                    req.userId,
                    req
                );

                console.log(`[AST Executor] Tool ${node.tool} result: data=${!!result?.data}${node.id ? ` (id=${node.id})` : ''}`);
                
                // Expose tool results in context for downstream nodes
                const dataValue = result?.data ?? result;
                context.toolData[node.tool] = dataValue;
                if (node.id) context.toolData[node.id] = dataValue;
                
                // Expose full raw tool output for structural iteration (.items)
                if (result && result.extractedItems && !result.items) {
                    result.items = result.extractedItems;
                }
                context.toolOutputs[node.tool] = result;
                if (node.id) context.toolOutputs[node.id] = result;
                
                // Persistence
                const responseData = result?.data ?? result;
                if (responseData) {
                    let content = typeof responseData === 'string' ? responseData : JSON.stringify(responseData, null, 2);
                    await this.prisma.response.update({ where: { id: responseId }, data: { content } });
                }
                break;
            }

            case 'ForEach': {
                // Resolve collection
                const resolvedCollection = await this.materializeToolArgs({ items: node.collection }, {
                    ...context,
                    resources: resourceStack,
                    conversationId: req.conversationId
                });
                
                let items = resolvedCollection.items;
                if (typeof items === 'string') {
                    try { items = JSON.parse(items); } catch(e) {}
                }
                if (!Array.isArray(items)) {
                    console.log(`[AST Executor] ForEach collection ${node.collection} did not resolve to an array.`);
                    break;
                }

                console.log(`[AST Executor] ForEach iterating over ${items.length} items`);
                for (const item of items) {
                    const iterationContext = { ...context, [node.iterator]: item, item: item };
                    await this.executeAST(node.body, req, resourceStack, responseId, iterationContext);
                }
                break;
            }

            case 'Spawn': {
                const childReq = await this.prisma.request.create({
                    data: {
                        userId: req.userId,
                        projectId: req.projectId,
                        conversationId: req.conversationId,
                        parentId: req.id,
                        status: 'NEW',
                        toolName: 'AST_Spawn',
                        context: context, // Inherit materialization environment
                        ast: node.body,
                        resources: {
                            connect: resourceStack.map(r => ({ id: r.id }))
                        }
                    }
                });
                console.log(`[AST Executor] Spawned detached child Request ${childReq.id}`);
                
                if (this.isAdHoc) {
                    await this.processRequest(childReq);
                }
                break;
            }

            case 'Match': {
                const resolved = await this.materializeToolArgs({ left: node.left, right: node.right }, {
                    ...context,
                    resources: resourceStack,
                    conversationId: req.conversationId
                });
                
                const isMatch = String(resolved.left) === String(resolved.right);
                console.log(`[AST Executor] Match evaluated to ${isMatch} ("${resolved.left}" === "${resolved.right}")`);
                
                if (isMatch) {
                    await this.executeAST(node.trueBranch, req, resourceStack, responseId, context);
                } else if (node.falseBranch) {
                    await this.executeAST(node.falseBranch, req, resourceStack, responseId, context);
                }
                break;
            }

            case 'IfElse': {
                const conditionArg = await this.materializeToolArgs({ eval: node.condition }, {
                    ...context,
                    resources: resourceStack,
                    conversationId: req.conversationId
                });
                
                // Loose truthy evaluation (supports JS booleans and explicit "true" string)
                const isTruthy = conditionArg.eval === true || 
                                 conditionArg.eval === "true" || 
                                 (typeof conditionArg.eval === 'string' && conditionArg.eval.length > 0 && conditionArg.eval !== "false");
                
                console.log(`[AST Executor] IfElse evaluated to: ${isTruthy}`);
                if (isTruthy) {
                    await this.executeAST(node.trueBranch, req, resourceStack, responseId, context);
                } else if (node.falseBranch) {
                    await this.executeAST(node.falseBranch, req, resourceStack, responseId, context);
                }
                break;
            }

            case 'While': {
                let safetyCounter = 0;
                const MAX_ITERATIONS = 1000;
                
                while (safetyCounter++ < MAX_ITERATIONS) {
                    const conditionArg = await this.materializeToolArgs({ eval: node.condition }, {
                        ...context,
                        resources: resourceStack,
                        conversationId: req.conversationId
                    });
                    
                    const isTruthy = conditionArg.eval === true || 
                                     conditionArg.eval === "true" || 
                                     (typeof conditionArg.eval === 'string' && conditionArg.eval.length > 0 && conditionArg.eval !== "false");
                    
                    console.log(`[AST Executor] While evaluated to: ${isTruthy} (iteration ${safetyCounter})`);
                    if (!isTruthy) break;
                    
                    await this.executeAST(node.body, req, resourceStack, responseId, context);
                }
                
                if (safetyCounter >= MAX_ITERATIONS) {
                    console.warn(`[AST Executor] While loop exceeded MAX_ITERATIONS (${MAX_ITERATIONS}). Breaking to prevent infinite loop.`);
                }
                break;
            }

            default:
                console.warn(`[AST Executor] Unknown node type: ${node.type}`);
        }
    }

    /**
     * Executes a sequence of tool calls. Chained callbacks execute recursively here. (LEGACY)
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

            const isSpawn = call.spawn === true;
            if (isSpawn) {
                // SPAWN Detached Request
                const childReq = await this.prisma.request.create({
                    data: {
                        userId: req.userId,
                        projectId: req.projectId,
                        conversationId: req.conversationId,
                        parentId: req.id,
                        status: 'NEW',
                        toolName: call.name,
                        executionScheduled: call.executionScheduled || null,
                        context: { 
                            ...initialContext, 
                            toolResults, 
                            toolData: currentToolData 
                        },
                        toolCalls: [{ ...call, spawn: false }] as any,
                        resources: {
                            connect: resourceStack.map(r => ({ id: r.id }))
                        }
                    }
                });
                console.log(`[Orchestrator] Spawned detached child Request ${childReq.id} for tool: ${call.name}`);
                
                if (this.isAdHoc) {
                    await this.processRequest(childReq);
                }
                continue;
            }

            // Execute INLINE
            const { onItemExtracted: _oie, onSuccess: _os, ...toolArgs } = call.args ?? {};
            const materializedArgs = await this.materializeToolArgs(toolArgs, { 
                ...initialContext,
                resources: resourceStack,
                toolResults,
                toolData: currentToolData,
                conversationId: req.conversationId
            });

            const result: any = await executeTool(
                call.name,
                materializedArgs,
                this.prisma,
                req.userId,
                req
            );

            console.log(`[Orchestrator] Tool ${call.name} result: data=${!!result?.data}, createdItem=${!!result?.createdItem}`);

            // Store result for subsequent tools in this chain
            currentToolData = result.data ?? result;
            toolResults[call.name] = currentToolData;

            if (call.as) {
                (initialContext as any)[call.as] = currentToolData;
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
                    toolData: currentToolData,
                    toolResults
                };

                if (hook === 'onItemExtracted' && Array.isArray(items)) {
                    for (const item of items) {
                        const childContext = { 
                            ...context,
                            item,
                            parentItem: initialContext.item 
                        };
                        
                        const alias = (flow as any).as;
                        if (alias) {
                            (childContext as any)[alias] = item;
                        }

                        await this.dispatchFlow(flow as any, req, resourceStack, responseId, childContext);
                    }
                } else if (hook === 'onSuccess' && result) {
                    const childContext = { 
                        ...context,
                        item: initialContext.item,
                        parentItem: initialContext.parentItem
                    };
                    
                    const alias = (flow as any).as;
                    if (alias && result.createdItem) {
                        (childContext as any)[alias] = result.createdItem;
                    }

                    await this.dispatchFlow(flow as any, req, resourceStack, responseId, childContext);
                }
            }
        }
    }

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

        if (flow.chain) {
            // Materialize templates in the calls using the provided context for IMMEDIATE execution
            const materializedCalls = await this.materializeToolArgs(childCalls, {
                resources: resourceStack,
                conversationId: req.conversationId,
                ...context
            });
            console.log(`[Orchestrator] Chaining ${materializedCalls.length} calls immediately.`);
            await this.executeToolSequence(materializedCalls, req, resourceStack, responseId, context.toolResults, context.toolData, context);
        } else {
            // SPAWN NEW REQUEST - Save RAW AST (templates preserved)
            const primary = childCalls[0];
            const childReq = await this.prisma.request.create({
                data: {
                    status: 'NEW',
                    toolName: primary.name,
                    toolCalls: childCalls, // Save the RAW tree
                    scriptId: scriptId,
                    userId: req.userId,
                    projectId: req.projectId,
                    conversationId: req.conversationId,
                    parentId: req.id,
                    executionScheduled: primary.executionScheduled || null,
                    context: context, // Save the materialization environment
                    resources: {
                        connect: resourceStack.map(r => ({ id: r.id }))
                    }
                }
            });
            console.log(`[Orchestrator] Spawned detached child Request ${childReq.id} for tool: ${primary.name}`);

            
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

    private async materializeToolArgs(args: any, context: { resources?: any[], toolData?: any, item?: any, toolResults?: Record<string, any>, conversationId?: number }): Promise<any> {
        if (!args) return args;

        let conversationView: any = {};
        if (context.conversationId) {
            const conv = await this.prisma.conversation.findUnique({ 
                where: { id: context.conversationId },
                include: { resources: true }
            });
            conversationView = {
                ...((conv?.metadata as any) || {}),
                id: conv?.id,
                externalId: conv?.externalId,
                resources: conv?.resources || []
            };
        }

        const resource = context.resources?.[0];
        const toolData = context.toolData || {};
        const item = context.item || {};
        const toolResults = context.toolResults || {};
        
        const processRecursive = async (obj: any): Promise<any> => {
            if (obj === null || obj === undefined) return obj;
            if (Array.isArray(obj)) {
                return Promise.all(obj.map(item => processRecursive(item)));
            }
            if (typeof obj === 'object') {
                const result: any = {};
                for (const [k, v] of Object.entries(obj)) {
                    if (k === 'spawn' || k === 'chain' || k === 'onSuccess' || k === 'onItemExtracted' || k === 'onFailure') {
                        result[k] = v;
                    } else {
                        result[k] = await processRecursive(v);
                    }
                }
                return result;
            }
            if (typeof obj === 'string') {
                const fullMatch = obj.match(/^\{\{([^}]+)\}\}$/);
                if (fullMatch) {
                    const path = fullMatch[1];
                    if (!path) return obj;
                    const parts = path.split('.');
                    const root = parts[0];
                    const property = parts.slice(1).join('.');

                    let source: any = null;
                    if (root === 'resource') source = resource;
                    else if (root === 'item') source = item;
                    else if (root === 'toolData') source = toolData;
                    else if (root === 'toolOutputs') source = (context as any).toolOutputs || {};
                    else if (root === 'conversation') source = conversationView;
                    else if (root === 'VOCAB') source = VOCAB;
                    else if (root && toolResults[root]) source = toolResults[root];
                    else if (root && (context as any)[root]) source = (context as any)[root];

                    if (source) {
                        const value = property ? property.split('.').reduce((acc: any, p: string) => {
                            if (acc && p in acc) return acc[p];
                            if (acc && acc.data && p in acc.data) return acc.data[p];
                            return undefined;
                        }, source) : source;
                        
                        if (value !== undefined && value !== null && typeof value !== 'function') {
                            return value;
                        } else {
                            console.warn(`[Template] Failed to resolve property "${property}" in root "${root}". Available keys in source:`, Object.keys(source));
                        }
                    } else {
                        console.warn(`[Template] Root "${root}" not found in context. Available roots:`, Object.keys(context));
                    }
                }

                return obj.replace(/\{\{([^}]+)\}\}/g, (match, pathString) => {
                    const path = pathString || "";
                    const parts = path.split('.');
                    const root = parts[0];
                    const property = parts.slice(1).join('.');

                    let source: any = null;
                    if (root === 'resource') source = resource;
                    else if (root === 'item') source = item;
                    else if (root === 'toolData') source = toolData;
                    else if (root === 'toolOutputs') source = (context as any).toolOutputs || {};
                    else if (root === 'conversation') source = conversationView;
                    else if (root === 'VOCAB') source = VOCAB;
                    else if (root && toolResults[root]) source = toolResults[root];
                    else if (root && (context as any)[root]) source = (context as any)[root];

                    if (!source) {
                        console.warn(`[Template] Replace: Root "${root}" not found in context.`);
                        return match;
                    }

                    const value = property ? property.split('.').reduce((acc: any, p: string) => {
                        if (acc && p in acc) return acc[p];
                        if (acc && acc.data && p in acc.data) return acc.data[p];
                        return undefined;
                    }, source) : source;

                    if (value !== undefined && value !== null && typeof value !== 'function') {
                        return String(value);
                    } else {
                        console.warn(`[Template] Replace: Failed to resolve "${path}".`);
                        return match;
                    }
                });
            }
            return obj;
        };

        return processRecursive(args);
    }
}
