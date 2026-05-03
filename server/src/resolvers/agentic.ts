/**
 * resolvers/agentic.ts
 *
 * GraphQL resolvers for the agentic pipeline:
 *   Prompt, Request, Response, Conversation, Agent.
 *
 * Queries:
 *   prompts / prompt         — Prompt CRUD
 *   promptTemplates          — List templates for current user
 *   conversations / conversation — Conversation listing
 *   requests                 — Request queue filtered by status
 *   agents                   — Agent listing for current user
 *
 * Mutations:
 *   createPromptTemplate     — Creates a named template
 *   createPrompt             — Materializes a prompt from template + model + resources
 *   submitRequest            — Queues a new Request (status: NEW)
 *   createConversation       — Creates an empty Conversation
 *   createAgent / updateAgent / toggleAgent / triggerAgent — Agent CRUD
 *
 * Field Resolvers:
 *   Prompt: template, aiModel, user, resources, requests
 *   Request: prompt, conversation, responses
 *   Response: request, conversation, relations
 *   Conversation: requests, responses
 *   Agent: user
 */

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

        prompts: async (_parent: any, { skip, take }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.prompt.findMany({
                where: { userId: context.user.id, existent: true },
                skip: skip || 0,
                take: take || 20,
                orderBy: { createdAt: 'desc' },
                include: { template: true, aiModel: true },
            });
        },

        prompt: async (_parent: any, { id }: { id: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.prompt.findUnique({
                where: { id },
                include: {
                    template: true,
                    aiModel: true,
                    user: true,
                    resources: true,
                    requests: { orderBy: { createdAt: 'desc' } },
                },
            });
        },

        promptTemplates: async (_parent: any, _args: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.promptTemplate.findMany({
                where: { userId: context.user.id, existent: true },
                orderBy: { createdAt: 'desc' },
            });
        },

        promptTemplate: async (_parent: any, { name, userId }: { name: string, userId?: string }, context: any) => {
            if (!context.user && !userId) throw new Error('Unauthorized');
            const targetUserId = userId || context.user.id;
            return await context.prisma.promptTemplate.findUnique({
                where: { userId_name: { userId: targetUserId, name } }
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

        conversation: async (_parent: any, { id }: { id: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.conversation.findUnique({
                where: { id },
                include: {
                    requests: { orderBy: { createdAt: 'desc' }, include: { prompt: true } },
                    responses: { orderBy: { createdAt: 'desc' } },
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
                include: { prompt: true, conversation: true },
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
                where: { userId_name: { userId: targetUserId, name } }
            });
        },
    },

    Mutation: {
        createPromptTemplate: async (_parent: any, { name, prompt, toolCalls }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.promptTemplate.create({
                data: {
                    name,
                    prompt,
                    toolCalls: toolCalls || null,
                    userId: context.user.id,
                },
            });
        },

        createPrompt: async (_parent: any, { input }: { input: any }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.prompt.create({
                data: {
                    uri: input.uri,
                    templateId: input.templateId,
                    aiModelId: input.aiModelId,
                    userId: context.user.id,
                    prompt: input.prompt,
                    toolCalls: input.toolCalls || null,
                    resources: input.resourceIds?.length
                        ? { connect: input.resourceIds.map((id: number) => ({ id })) }
                        : undefined,
                },
                include: { template: true, aiModel: true, user: true, resources: true },
            });
        },

        submitRequest: async (_parent: any, { promptId, conversationId }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');

            // Create conversation if not provided
            let convId = conversationId;
            if (!convId) {
                const conv = await context.prisma.conversation.create({ data: {} });
                convId = conv.id;
            }

            return await context.prisma.request.create({
                data: {
                    status: 'NEW',
                    promptId: promptId || null,
                    conversationId: convId,
                },
                include: { prompt: true, conversation: true },
            });
        },

        createConversation: async (_parent: any, _args: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.conversation.create({ data: {} });
        },

        createAgent: async (_parent: any, { input }: { input: any }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.agent.create({
                data: {
                    name: input.name,
                    templateId: input.templateId,
                    schedule: input.schedule || 'every 1 hour',
                    userId: context.user.id,
                },
                include: { user: true, template: true },
            });
        },

        updateAgent: async (_parent: any, { id, input }: { id: string; input: any }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const data: any = {};
            if (input.name !== undefined) data.name = input.name;
            if (input.templateId !== undefined) data.templateId = input.templateId;
            if (input.schedule !== undefined) data.schedule = input.schedule;

            return await context.prisma.agent.update({
                where: { id },
                data,
                include: { user: true, template: true },
            });
        },

        upsertAgentWithTemplate: async (_parent: any, { input }: { input: any }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const userId = context.user.id;

            // 1. Upsert PromptTemplate
            const template = await context.prisma.promptTemplate.upsert({
                where: { userId_name: { userId, name: input.templateName } },
                update: {
                    prompt: input.prompt,
                    toolCalls: input.toolCalls || null,
                },
                create: {
                    name: input.templateName,
                    prompt: input.prompt,
                    toolCalls: input.toolCalls || null,
                    userId,
                }
            });

            // 2. Upsert Agent
            return await context.prisma.agent.upsert({
                where: { userId_name: { userId, name: input.agentName } },
                update: {
                    templateId: template.id,
                    schedule: input.schedule,
                },
                create: {
                    name: input.agentName,
                    templateId: template.id,
                    schedule: input.schedule,
                    userId,
                },
                include: { user: true, template: true },
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

            const conv = await context.prisma.conversation.create({ data: {} });
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
    Prompt: {
        template: async (prompt: any, _args: any, context: any) => {
            if (prompt.template) return prompt.template;
            return await context.prisma.promptTemplate.findUnique({ where: { id: prompt.templateId } });
        },
        aiModel: async (prompt: any, _args: any, context: any) => {
            if (prompt.aiModel) return prompt.aiModel;
            return await context.prisma.aIModel.findUnique({ where: { id: prompt.aiModelId } });
        },
        user: async (prompt: any, _args: any, context: any) => {
            if (prompt.user) return prompt.user;
            return await context.prisma.user.findUnique({ where: { id: prompt.userId } });
        },
        resources: async (prompt: any, _args: any, context: any) => {
            if (prompt.resources) return prompt.resources;
            const p = await context.prisma.prompt.findUnique({
                where: { id: prompt.id },
                include: { resources: true },
            });
            return p?.resources || [];
        },
        requests: async (prompt: any, _args: any, context: any) => {
            if (prompt.requests) return prompt.requests;
            return await context.prisma.request.findMany({
                where: { promptId: prompt.id },
                orderBy: { createdAt: 'desc' },
            });
        },
        toolCalls: (prompt: any) => prompt.toolCalls ? JSON.stringify(prompt.toolCalls) : null,
    },

    Request: {
        prompt: async (request: any, _args: any, context: any) => {
            if (request.prompt) return request.prompt;
            if (!request.promptId) return null;
            return await context.prisma.prompt.findUnique({ where: { id: request.promptId } });
        },
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
        relations: async (response: any, _args: any, context: any) => {
            if (response.relations) return response.relations;
            return await context.prisma.relation.findMany({
                where: { responseId: response.id },
            });
        },
        toolCalls: (response: any) => response.toolCalls ? JSON.stringify(response.toolCalls) : null,
    },

    Conversation: {
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
    },
};
