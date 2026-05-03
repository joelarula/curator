import { PrismaClient } from '@prisma/client';
import { executeTool } from './Tools.js';

export class RequestProcessor {
    private prisma: PrismaClient;
    private timer: NodeJS.Timeout | null = null;
    private isRunning = false;
    private workerId = `worker-${Math.random().toString(36).substring(7)}`;
    private requestsProcessed = 0;

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
            // Find and lock a NEW request atomically using a raw update query 
            // to prevent multiple workers from grabbing the same request
            const lockedRequests = await this.prisma.$queryRaw<any[]>`
                UPDATE "Request"
                SET status = 'WAITING', "lockedBy" = ${this.workerId}, "lockedAt" = NOW()
                WHERE id = (
                    SELECT id FROM "Request"
                    WHERE status = 'NEW'
                    ORDER BY "createdAt" ASC
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED
                )
                RETURNING *;
            `;

            if (!lockedRequests || lockedRequests.length === 0) {
                return; // No pending requests
            }

            const request = lockedRequests[0];
            await this.processRequest(request);

        } catch (error) {
            console.error('[RequestProcessor] Error polling requests:', error);
        } finally {
            this.isRunning = false;
        }
    }

    private async processRequest(request: any) {
        console.log(`[RequestProcessor] Processing request ${request.id}`);
        try {
            // Fetch prompt details
            const prompt = await this.prisma.prompt.findUnique({
                where: { id: request.promptId },
                include: { user: true }
            });

            if (!prompt) throw new Error(`Prompt ${request.promptId} not found`);

            // -------------------------------------------------------------
            // TODO: Here you would call your actual LLM (Gemini, OpenAI, etc.)
            // using prompt.prompt and prompt.toolCalls.
            // For this simplest implementation, we will simulate an AI response
            // that uses the `persist_address` tool.
            // In the "Everything is a Tool" architecture, RequestProcessor blindly executes toolCalls.
            // If the prompt needs AI processing, it will have an "ask_llm" toolCall!
            let callsToExecute: any[] = [];
            let aiTextResponse = "Executed requested tools.";

            const promptTools: any = prompt.toolCalls;
            if (Array.isArray(promptTools)) {
                callsToExecute = promptTools;
            }

            if (callsToExecute.length === 0) {
                // If there are no explicit tool calls, but there is a text prompt, fallback to simulated LLM tool
                if (prompt.prompt && prompt.aiModelId) {
                    console.log(`[RequestProcessor] Text prompt found without explicit tools. Falling back to ask_llm.`);
                    callsToExecute = [
                        {
                            name: "ask_llm",
                            args: {
                                prompt: prompt.prompt
                            }
                        }
                    ];
                } else {
                    console.log(`[RequestProcessor] Nothing to do for request ${request.id}.`);
                }
            }

            // Save the raw response shell for tools to attach data to
            const response = await this.prisma.response.create({
                data: {
                    requestId: request.id,
                    conversationId: request.conversationId,
                    content: aiTextResponse,
                    toolCalls: callsToExecute,
                }
            });

            // Execute the tool calls locally
            for (const call of callsToExecute) {
                if (call.name) {
                    await executeTool(
                        call.name,
                        call.args,
                        this.prisma,
                        prompt.userId,
                        response.id,
                        request
                    );
                }
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

    getState() {
        return {
            isRunning: this.timer !== null,
            requestsProcessed: this.requestsProcessed
        };
    }
}
