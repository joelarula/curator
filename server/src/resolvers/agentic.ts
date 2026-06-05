/**
 * resolvers/agentic.ts
 *
 * GraphQL resolvers for the agentic pipeline:
 *   Prompt, Request, Response, Conversation, Agent.
 *
 * Queries:
 *   scripts                  — List scripts for current user
 *   script                   — Fetch a specific script by name
 *   conversations / conversation — Conversation listing
 *   requests                 — Request queue filtered by status
 *   agents                   — Agent listing for current user
 *
 * Mutations:
 *   createScript             — Creates a named script
 *   upsertScript             — Updates or creates a script
 *   submitRequest            — Queues a new Request (status: NEW)
 *   createConversation       — Creates an empty Conversation
 *   createAgent / updateAgent / toggleAgent / triggerAgent — Agent CRUD
 *
 * Field Resolvers:
 *   Script: user, requests
 *   Request: script, conversation, responses
 *   Response: request, conversation, relations
 *   Conversation: requests, responses
 *   Agent: script, user
 */

import { ScriptRunner } from '../services/ScriptRunner.js';

export const agenticResolvers = {
    Query: {
        agentWorkerState: async (_parent: any, _args: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const schedulerState = context.agentScheduler.getState();
            const processorState = context.requestProcessor.getState();
            return {
                schedulerRunning: schedulerState.isRunning,
                processorRunning: processorState.isRunning,
                activeBreeJobs: schedulerState.activeJobs,
                requestsProcessed: processorState.requestsProcessed
            };
        },



        scripts: async (_parent: any, _args: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.script.findMany({
                where: { userId: context.user.id, existent: true },
                orderBy: { createdAt: 'desc' },
            });

        },

        script: async (_parent: any, { name, userId }: { name: string, userId?: string }, context: any) => {
            if (!context.user && !userId) throw new Error('Unauthorized');
            const targetUserId = userId || context.user.id;
            return await context.prisma.script.findUnique({
                where: { name }
            });
        },

        conversations: async (_parent: any, { skip, take }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.conversation.findMany({
                where: { existent: true },
                skip: skip || 0,
                take: take || 20,
                orderBy: { updatedAt: 'desc' },
            });
        },


        conversation: async (_parent: any, { id }: { id: number }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.conversation.findUnique({
                where: { id },
                include: {
                    requests: { orderBy: { createdAt: 'desc' }, include: { template: true } },
                    responses: { orderBy: { createdAt: 'desc' } },
                },
            });
        },

        conversationByExternalId: async (_parent: any, { externalId }: { externalId: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.conversation.findUnique({
                where: { externalId },
                include: {
                    user: true,
                    requests: {
                        orderBy: { createdAt: 'asc' },
                        include: { template: true, responses: { orderBy: { createdAt: 'asc' } } },
                    },
                    responses: { orderBy: { createdAt: 'asc' } },
                },
            });
        },

        requests: async (_parent: any, { status, skip, take }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const where: any = { existent: true };

            if (status) where.status = status;

            return await context.prisma.request.findMany({
                where,
                skip: skip || 0,
                take: take || 20,
                orderBy: { createdAt: 'desc' },
                include: { template: true, conversation: true },
            });
        },

        agents: async (_parent: any, _args: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.agent.findMany({
                where: { userId: context.user.id, existent: true },
                orderBy: { updatedAt: 'desc' },
            });
        },


        agent: async (_parent: any, { name, userId }: { name: string, userId?: string }, context: any) => {
            if (!context.user && !userId) throw new Error('Unauthorized');
            const targetUserId = userId || context.user.id;
            return await context.prisma.agent.findUnique({
                where: { name }
            });
        },

        tools: async (_parent: any, _args: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.tool.findMany({
                orderBy: { name: 'asc' },
            });
        },

        tool: async (_parent: any, { name }: { name: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.tool.findUnique({ where: { name } });
        },
    },

    Mutation: {
        createScript: async (_parent: any, { name, body, toolCalls }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.script.create({
                data: {
                    name,
                    body: body || null,
                    toolCalls: toolCalls || null,
                    userId: context.user.id,
                },
            });
        },

        upsertScript: async (_parent: any, { name, body, toolCalls }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const userId = context.user.id;
            return await context.prisma.script.upsert({
                where: { name },
                update: {
                    body: body || null,
                    toolCalls: toolCalls || null,
                },
                create: {
                    name,
                    body: body || null,
                    toolCalls: toolCalls || null,
                    userId,
                }
            });
        },

        submitRequest: async (_parent: any, { scriptId, body, toolCalls, conversationId }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');

            let convId = conversationId;
            if (!convId) {
                const conv = await context.prisma.conversation.create({ data: { userId: context.user.id } });
                convId = conv.id;
            }

            const finalToolCalls = toolCalls;
            const primaryToolName = Array.isArray(finalToolCalls) && finalToolCalls.length > 0 ? finalToolCalls[0].name : null;
            const primaryToolArgs = Array.isArray(finalToolCalls) && finalToolCalls.length > 0 ? finalToolCalls[0].args : null;
            const primaryCallbacks = Array.isArray(finalToolCalls) && finalToolCalls.length > 0 ? finalToolCalls[0].callbacks : null;

            let resolvedScriptId = scriptId || null;
            if (body && !resolvedScriptId) {
                const inlineScript = await context.prisma.script.create({
                    data: { name: `inline_${Date.now()}`, body, userId: context.user.id },
                });
                resolvedScriptId = inlineScript.id;
            }

            return await context.prisma.request.create({
                data: {
                    status: 'NEW',
                    toolName: primaryToolName,
                    toolArgs: primaryToolArgs,
                    callbacks: primaryCallbacks,
                    scriptId: resolvedScriptId,
                    toolCalls: finalToolCalls || null,
                    conversationId: convId,
                    userId: context.user.id,
                },
                include: { script: true, conversation: true },
            });
        },

        createConversation: async (_parent: any, _args: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.conversation.create({ data: { userId: context.user.id } });
        },

        executeRequest: async (_parent: any, { scriptId, body, toolCalls, conversationId, timeoutMs }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');

            const TIMEOUT = timeoutMs ?? 30_000;
            const POLL_INTERVAL = 500;

            let convId = conversationId;
            if (!convId) {
                const conv = await context.prisma.conversation.create({ data: { userId: context.user.id } });
                convId = conv.id;
            }

            const finalToolCalls = toolCalls;
            const primaryToolName = Array.isArray(finalToolCalls) && finalToolCalls.length > 0 ? finalToolCalls[0].name : null;
            const primaryToolArgs = Array.isArray(finalToolCalls) && finalToolCalls.length > 0 ? finalToolCalls[0].args : null;
            const primaryCallbacks = Array.isArray(finalToolCalls) && finalToolCalls.length > 0 ? finalToolCalls[0].callbacks : null;

            let resolvedScriptId = scriptId || null;
            if (body && !resolvedScriptId) {
                const inlineScript = await context.prisma.script.create({
                    data: { name: `inline_${Date.now()}`, body, userId: context.user.id },
                });
                resolvedScriptId = inlineScript.id;
            }

            const created = await context.prisma.request.create({
                data: {
                    status: 'NEW',
                    toolName: primaryToolName,
                    toolArgs: primaryToolArgs,
                    callbacks: primaryCallbacks,
                    scriptId: resolvedScriptId,
                    toolCalls: finalToolCalls || null,
                    conversationId: convId,
                    userId: context.user.id,
                },
            });

            const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
            const deadline = Date.now() + TIMEOUT;
            let current: any = null;

            while (Date.now() < deadline) {
                await sleep(POLL_INTERVAL);
                current = await context.prisma.request.findUnique({
                    where: { id: created.id },
                    include: {
                        script: true,
                        conversation: true,
                        responses: { orderBy: { createdAt: 'asc' } },
                    },
                });
                if (current?.status === 'COMPLETED' || current?.status === 'FAILED') {
                    return { request: current, responses: current.responses ?? [], timedOut: false };
                }
            }

            if (!current) {
                current = await context.prisma.request.findUnique({
                    where: { id: created.id },
                    include: { script: true, conversation: true, responses: true },
                });
            }
            return { request: current, responses: current?.responses ?? [], timedOut: true };
        },

        submitScript: async (_parent: any, { name, body, toolCalls, conversationId }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');

            let convId = conversationId;
            if (!convId) {
                const conv = await context.prisma.conversation.create({ data: { userId: context.user.id } });
                convId = conv.id;
            }

            let finalToolCalls: any = toolCalls || null;
            if (body) {
                finalToolCalls = await ScriptRunner.evaluate(body, {}, context.prisma, context.user.id);
            }

            let resolvedScriptId: number | null = null;
            if (name) {
                const script = await context.prisma.script.upsert({
                    where: { name },
                    update: { body: body || null, toolCalls: finalToolCalls || toolCalls || null },
                    create: { name, body: body || null, toolCalls: finalToolCalls || toolCalls || null, userId: context.user.id },
                });
                resolvedScriptId = script.id;
            }

            const primaryToolName = Array.isArray(finalToolCalls) && finalToolCalls.length > 0 ? finalToolCalls[0].name : null;
            const primaryToolArgs = Array.isArray(finalToolCalls) && finalToolCalls.length > 0 ? finalToolCalls[0].args : null;
            const primaryCallbacks = Array.isArray(finalToolCalls) && finalToolCalls.length > 0 ? finalToolCalls[0].callbacks : null;

            return await context.prisma.request.create({
                data: {
                    status: 'NEW',
                    scriptId: resolvedScriptId,
                    toolName: primaryToolName,
                    toolArgs: primaryToolArgs,
                    callbacks: primaryCallbacks,
                    toolCalls: finalToolCalls,
                    conversationId: convId,
                    userId: context.user.id,
                },
                include: { script: true, conversation: true },
            });
        },

        executeScript: async (_parent: any, { name, body, toolCalls, conversationId, timeoutMs }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');

            const TIMEOUT = timeoutMs ?? 30_000;
            const POLL_INTERVAL = 500;

            let convId = conversationId;
            if (!convId) {
                const conv = await context.prisma.conversation.create({ data: { userId: context.user.id } });
                convId = conv.id;
            }

            let finalToolCalls: any = toolCalls || null;
            if (body) {
                finalToolCalls = await ScriptRunner.evaluate(body, {}, context.prisma, context.user.id);
            }

            let resolvedScriptId: number | null = null;
            if (name) {
                const script = await context.prisma.script.upsert({
                    where: { name },
                    update: { body: body || null, toolCalls: finalToolCalls || toolCalls || null },
                    create: { name, body: body || null, toolCalls: finalToolCalls || toolCalls || null, userId: context.user.id },
                });
                resolvedScriptId = script.id;
            }

            const primaryToolName = Array.isArray(finalToolCalls) && finalToolCalls.length > 0 ? finalToolCalls[0].name : null;
            const primaryToolArgs = Array.isArray(finalToolCalls) && finalToolCalls.length > 0 ? finalToolCalls[0].args : null;
            const primaryCallbacks = Array.isArray(finalToolCalls) && finalToolCalls.length > 0 ? finalToolCalls[0].callbacks : null;

            const created = await context.prisma.request.create({
                data: {
                    status: 'NEW',
                    scriptId: resolvedScriptId,
                    toolName: primaryToolName,
                    toolArgs: primaryToolArgs,
                    callbacks: primaryCallbacks,
                    toolCalls: finalToolCalls,
                    conversationId: convId,
                    userId: context.user.id,
                },
            });

            const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
            const deadline = Date.now() + TIMEOUT;
            let current: any = null;

            while (Date.now() < deadline) {
                await sleep(POLL_INTERVAL);
                current = await context.prisma.request.findUnique({
                    where: { id: created.id },
                    include: {
                        script: true,
                        conversation: true,
                        responses: { orderBy: { createdAt: 'asc' } },
                    },
                });
                if (current?.status === 'COMPLETED' || current?.status === 'FAILED') {
                    return { request: current, responses: current.responses ?? [], timedOut: false };
                }
            }

            if (!current) {
                current = await context.prisma.request.findUnique({
                    where: { id: created.id },
                    include: { script: true, conversation: true, responses: true },
                });
            }
            return { request: current, responses: current?.responses ?? [], timedOut: true };
        },

        createAgent: async (_parent: any, { input }: { input: any }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.agent.create({
                data: {
                    name: input.name,
                    scriptId: input.scriptId,
                    schedule: input.schedule || 'every 1 hour',
                    userId: context.user.id,
                },
                include: { user: true, script: true },
            });
        },

        updateAgent: async (_parent: any, { id, input }: { id: string; input: any }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const data: any = {};
            if (input.name !== undefined) data.name = input.name;
            if (input.scriptId !== undefined) data.scriptId = input.scriptId;
            if (input.schedule !== undefined) data.schedule = input.schedule;

            return await context.prisma.agent.update({
                where: { id },
                data,
                include: { user: true, script: true },
            });
        },

        upsertAgentWithScript: async (_parent: any, { input }: { input: any }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const userId = context.user.id;

            const script = await context.prisma.script.upsert({
                where: { name: input.scriptName },
                update: {
                    body: input.body || null,
                    toolCalls: input.toolCalls || null,
                },
                create: {
                    name: input.scriptName,
                    body: input.body || null,
                    toolCalls: input.toolCalls || null,
                    userId,
                }
            });

            return await context.prisma.agent.upsert({
                where: { name: input.agentName },
                update: {
                    scriptId: script.id,
                    schedule: input.schedule,
                },
                create: {
                    name: input.agentName,
                    scriptId: script.id,
                    schedule: input.schedule,
                    userId,
                },
                include: { user: true, script: true },
            });
        },

        toggleAgent: async (_parent: any, { id, enabled }: { id: string; enabled: boolean }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.agent.update({
                where: { id },
                data: { enabled },
                include: { user: true },
            });
        },

        triggerAgent: async (_parent: any, { id }: { id: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            // Create a request from this agent's context
            const agent = await context.prisma.agent.findUnique({ where: { id } });
            if (!agent) throw new Error('Agent not found');

            const conv = await context.prisma.conversation.create({ data: { userId: context.user.id } });
            return await context.prisma.request.create({
                data: {
                    status: 'NEW',
                    conversationId: conv.id,
                },
                include: { conversation: true },
            });
        },
    },

    // Field resolvers
    Script: {
        user: async (script: any, _args: any, context: any) => {
            if (script.user) return script.user;
            return await context.prisma.user.findUnique({ where: { id: script.userId } });
        },
        requests: async (script: any, _args: any, context: any) => {
            if (script.requests) return script.requests;
            return await context.prisma.request.findMany({ where: { scriptId: script.id } });
        },
        toolCalls: (script: any) => script.toolCalls ? (Array.isArray(script.toolCalls) ? script.toolCalls : []) : [],
    },

    Request: {
        script: async (request: any, _args: any, context: any) => {
            if (request.script) return request.script;
            if (!request.scriptId) return null;
            return await context.prisma.script.findUnique({ where: { id: request.scriptId } });
        },
        aiModel: async (request: any, _args: any, context: any) => {
            if (request.aiModel) return request.aiModel;
            if (!request.aiModelId) return null;
            return await context.prisma.aIModel.findUnique({ where: { id: request.aiModelId } });
        },
        user: async (request: any, _args: any, context: any) => {
            if (request.user) return request.user;
            return await context.prisma.user.findUnique({ where: { id: request.userId } });
        },
        resources: async (request: any, _args: any, context: any) => {
            if (request.resources) return request.resources;
            const r = await context.prisma.request.findUnique({
                where: { id: request.id },
                include: { resources: true },
            });
            return r?.resources || [];
        },
        parent: async (request: any, _args: any, context: any) => {
            if (request.parent) return request.parent;
            if (!request.parentId) return null;
            return await context.prisma.request.findUnique({ where: { id: request.parentId } });
        },
        children: async (request: any, _args: any, context: any) => {
            if (request.children) return request.children;
            return await context.prisma.request.findMany({ where: { parentId: request.id } });
        },
        toolCalls: (request: any) => request.toolCalls ? (Array.isArray(request.toolCalls) ? request.toolCalls : []) : [],
        conversation: async (request: any, _args: any, context: any) => {
            if (request.conversation) return request.conversation;
            return await context.prisma.conversation.findUnique({ where: { id: request.conversationId } });
        },
        responses: async (request: any, _args: any, context: any) => {
            if (request.responses) return request.responses;
            return await context.prisma.response.findMany({
                where: { requestId: request.id },
                orderBy: { createdAt: 'desc' },
            });
        },
    },

    Response: {
        request: async (response: any, _args: any, context: any) => {
            if (response.request) return response.request;
            return await context.prisma.request.findUnique({ where: { id: response.requestId } });
        },
        conversation: async (response: any, _args: any, context: any) => {
            if (response.conversation) return response.conversation;
            return await context.prisma.conversation.findUnique({ where: { id: response.conversationId } });
        },

        toolCalls: (response: any) => response.toolCalls ? (Array.isArray(response.toolCalls) ? response.toolCalls : []) : [],
        data: (response: any) => {
            if (!response.content) return null;
            try {
                return JSON.parse(response.content);
            } catch {
                return response.content;
            }
        },
    },

    Conversation: {
        user: async (conversation: any, _args: any, context: any) => {
            if (conversation.user) return conversation.user;
            return await context.prisma.user.findUnique({ where: { id: conversation.userId } });
        },
        requests: async (conversation: any, _args: any, context: any) => {
            if (conversation.requests) return conversation.requests;
            return await context.prisma.request.findMany({
                where: { conversationId: conversation.id },
                orderBy: { createdAt: 'desc' },
            });
        },
        responses: async (conversation: any, _args: any, context: any) => {
            if (conversation.responses) return conversation.responses;
            return await context.prisma.response.findMany({
                where: { conversationId: conversation.id },
                orderBy: { createdAt: 'desc' },
            });
        },
    },

    Agent: {
        user: async (agent: any, _args: any, context: any) => {
            if (agent.user) return agent.user;
            return await context.prisma.user.findUnique({ where: { id: agent.userId } });
        },
        requests: async (agent: any, _args: any, context: any) => {
            if (agent.requests) return agent.requests;
            return await context.prisma.request.findMany({ 
                where: { agentId: agent.id },
                orderBy: { createdAt: 'desc' }
            });
        },
    },
};
