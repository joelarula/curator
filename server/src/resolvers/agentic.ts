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
import { buildProjectScopeWhere } from '../services/ProjectScopeService.js';
import { compileToAST } from '../services/ast/compiler.js';
import { AuditService } from '../services/AuditService.js';
import { AgentRoleService } from '../services/AgentRoleService.js';
import { ApprovalService } from '../services/ApprovalService.js';

/** Core model change audit: a Request + MODEL_CHANGED Response. Actor/scope come from the authenticated context. */
function recordChange(context: any, entityType: string, entityId: string, action: string, changes?: Record<string, any>, agentId?: string | null) {
    return AuditService.recordModelChange(context.prisma, {
        entityType,
        entityId,
        action,
        userId: context.user.id,
        projectId: context.activeProjectId ?? null,
        agentId: agentId ?? null,
        ...(changes !== undefined ? { changes } : {}),
        origin: 'GRAPHQL',
    });
}

async function anchorAgentIdentityResource(prisma: any, agent: any, userId: string, projectId?: string | null) {
    const uri = agent.uri || `agent:${agent.name}`;
    try {
        await prisma.resource.upsert({
            where: { uri },
            update: {
                title: agent.name,
                description: agent.description || `AI Agent: ${agent.name}`,
                userId,
                projectId: projectId || null,
                isPublished: false,
                existent: true,
            },
            create: {
                uri,
                title: agent.name,
                description: agent.description || `AI Agent: ${agent.name}`,
                userId,
                projectId: projectId || null,
                isPublished: false,
                existent: true,
            }
        });
    } catch (err) {
        console.warn(`[AgentIdentity] Could not anchor agent Resource for ${uri}:`, err);
    }
}

async function syncAgentRoles(prisma: any, agentId: string, roleNames?: string[], roleIds?: (string | number)[]) {
    if (!roleNames?.length && !roleIds?.length) return;
    
    const resolvedRoleIds = new Set<number>();
    if (roleIds?.length) {
        for (const rid of roleIds) {
            const num = Number(rid);
            if (!isNaN(num)) resolvedRoleIds.add(num);
        }
    }
    if (roleNames?.length) {
        for (const name of roleNames) {
            let role = await prisma.role.findUnique({ where: { name } });
            if (!role) {
                role = await prisma.role.create({ data: { name, description: `Role ${name}` } });
            }
            resolvedRoleIds.add(role.id);
        }
    }

    for (const rId of resolvedRoleIds) {
        await prisma.agentRole.upsert({
            where: { agentId_roleId: { agentId, roleId: rId } },
            update: {},
            create: { agentId, roleId: rId }
        });
    }
}

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
            const scope = buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId);
            return await context.prisma.script.findMany({
                where: { userId: context.user.id, existent: true, ...scope },
                orderBy: { createdAt: 'desc' },
            });
        },

        script: async (_parent: any, { name, userId }: { name: string, userId?: string }, context: any) => {
            if (!context.user && !userId) throw new Error('Unauthorized');
            const targetUserId = userId || context.user.id;
            const scope = buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId);
            return await context.prisma.script.findFirst({
                where: { name, ...scope }
            });
        },

        conversations: async (_parent: any, { skip, take }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const scope = buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId);
            return await context.prisma.conversation.findMany({
                where: { existent: true, ...scope },
                skip: skip || 0,
                take: take || 20,
                orderBy: { updatedAt: 'desc' },
            });
        },


        conversation: async (_parent: any, { id }: { id: number }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const scope = buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId);
            return await context.prisma.conversation.findFirst({
                where: { id, ...scope },
                include: {
                    requests: { orderBy: { createdAt: 'desc' }, include: { template: true } },
                    responses: { orderBy: { createdAt: 'desc' } },
                },
            });
        },

        conversationByExternalId: async (_parent: any, { externalId }: { externalId: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const scope = buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId);
            return await context.prisma.conversation.findFirst({
                where: { externalId, ...scope },
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
            const scope = buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId);
            const where: any = { existent: true, ...scope };
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
            const scope = buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId);
            return await context.prisma.agent.findMany({
                where: { userId: context.user.id, existent: true, ...scope },
                orderBy: { updatedAt: 'desc' },
            });
        },


        agent: async (_parent: any, { name, userId }: { name: string, userId?: string }, context: any) => {
            if (!context.user && !userId) throw new Error('Unauthorized');
            const targetUserId = userId || context.user.id;
            const scope = buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId);
            return await context.prisma.agent.findFirst({
                where: { name, ...scope }
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

        roles: async (_parent: any, _args: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            await AgentRoleService.ensureDefaultRoles(context.prisma);
            return await context.prisma.role.findMany({
                orderBy: { name: 'asc' },
                include: { permissions: { include: { permission: true } } }
            });
        },

        auditLogs: async (_parent: any, args: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await AuditService.getLogs(context.prisma, args);
        },

        toolApprovals: async (_parent: any, { agentId, toolName, scope }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await ApprovalService.listApprovals(context.prisma, { agentId, toolName, scope, includeRevoked: true });
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
                    projectId: context.activeProjectId || null,
                },
            });
        },

        upsertScript: async (_parent: any, { name, body, toolCalls }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const userId = context.user.id;
            const scope = buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId);
            
            const existing = await context.prisma.script.findFirst({
                where: { name, ...scope }
            });

            if (existing) {
                return await context.prisma.script.update({
                    where: { id: existing.id },
                    data: {
                        body: body || null,
                        toolCalls: toolCalls || null,
                    }
                });
            }

            return await context.prisma.script.create({
                data: {
                    name,
                    body: body || null,
                    toolCalls: toolCalls || null,
                    userId,
                    projectId: context.activeProjectId || null,
                }
            });
        },

        submitRequest: async (_parent: any, { scriptId, body, toolCalls, conversationId }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');

            let convId = conversationId;
            if (!convId) {
                const conv = await context.prisma.conversation.create({
                    data: {
                        userId: context.user.id,
                        projectId: context.activeProjectId || null,
                    }
                });
                convId = conv.id;
            }

            let resolvedScriptId = scriptId || null;
            if (body && !resolvedScriptId) {
                const inlineScript = await context.prisma.script.create({
                    data: {
                        name: `inline_${Date.now()}`,
                        body,
                        userId: context.user.id,
                        projectId: context.activeProjectId || null,
                    },
                });
                resolvedScriptId = inlineScript.id;
            }

            let scriptAst = null;
            if (resolvedScriptId) {
                const script = await context.prisma.script.findUnique({ where: { id: resolvedScriptId } });
                if (script) {
                    scriptAst = script.ast || (script.toolCalls ? compileToAST(script.toolCalls as any[]) : null);
                }
            } else if (toolCalls) {
                scriptAst = compileToAST(toolCalls);
            }

            const primaryToolName = scriptAst && (scriptAst as any).steps?.[0]?.tool || 'AST_Root';

            return await context.prisma.request.create({
                data: {
                    status: 'NEW',
                    toolName: primaryToolName,
                    scriptId: resolvedScriptId,
                    ast: scriptAst as any,
                    conversationId: convId,
                    userId: context.user.id,
                    projectId: context.activeProjectId || null,
                },
                include: { script: true, conversation: true },
            });
        },

        createConversation: async (_parent: any, _args: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.conversation.create({
                data: {
                    userId: context.user.id,
                    projectId: context.activeProjectId || null,
                }
            });
        },

        executeRequest: async (_parent: any, { scriptId, body, toolCalls, conversationId, timeoutMs }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');

            const TIMEOUT = timeoutMs ?? 30_000;
            const POLL_INTERVAL = 500;

            let convId = conversationId;
            if (!convId) {
                const conv = await context.prisma.conversation.create({
                    data: {
                        userId: context.user.id,
                        projectId: context.activeProjectId || null,
                    }
                });
                convId = conv.id;
            }

            let resolvedScriptId = scriptId || null;
            if (body && !resolvedScriptId) {
                const inlineScript = await context.prisma.script.create({
                    data: {
                        name: `inline_${Date.now()}`,
                        body,
                        userId: context.user.id,
                        projectId: context.activeProjectId || null,
                    },
                });
                resolvedScriptId = inlineScript.id;
            }

            let scriptAst = null;
            if (resolvedScriptId) {
                const script = await context.prisma.script.findUnique({ where: { id: resolvedScriptId } });
                if (script) {
                    scriptAst = script.ast || (script.toolCalls ? compileToAST(script.toolCalls as any[]) : null);
                }
            } else if (toolCalls) {
                scriptAst = compileToAST(toolCalls);
            }

            const primaryToolName = scriptAst && (scriptAst as any).steps?.[0]?.tool || 'AST_Root';

            const created = await context.prisma.request.create({
                data: {
                    status: 'NEW',
                    toolName: primaryToolName,
                    scriptId: resolvedScriptId,
                    ast: scriptAst as any,
                    conversationId: convId,
                    userId: context.user.id,
                    projectId: context.activeProjectId || null,
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
                const conv = await context.prisma.conversation.create({
                    data: {
                        userId: context.user.id,
                        projectId: context.activeProjectId || null,
                    }
                });
                convId = conv.id;
            }

            let finalToolCalls: any = toolCalls || null;
            if (body) {
                finalToolCalls = await ScriptRunner.evaluate(body, {}, context.prisma, context.user.id);
            }

            let resolvedScriptId: number | null = null;
            if (name) {
                const scope = buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId);
                const existingScript = await context.prisma.script.findFirst({
                    where: { name, ...scope }
                });
                let script;
                if (existingScript) {
                    script = await context.prisma.script.update({
                        where: { id: existingScript.id },
                        data: { body: body || null, toolCalls: finalToolCalls || toolCalls || null },
                    });
                } else {
                    script = await context.prisma.script.create({
                        data: { name, body: body || null, toolCalls: finalToolCalls || toolCalls || null, userId: context.user.id, projectId: context.activeProjectId || null },
                    });
                }
                resolvedScriptId = script.id;
            }

            const scriptAst = finalToolCalls ? compileToAST(finalToolCalls) : null;
            const primaryToolName = scriptAst && (scriptAst as any).steps?.[0]?.tool || 'AST_Root';

            return await context.prisma.request.create({
                data: {
                    status: 'NEW',
                    scriptId: resolvedScriptId,
                    toolName: primaryToolName,
                    ast: scriptAst as any,
                    conversationId: convId,
                    userId: context.user.id,
                    projectId: context.activeProjectId || null,
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
                const conv = await context.prisma.conversation.create({
                    data: {
                        userId: context.user.id,
                        projectId: context.activeProjectId || null,
                    }
                });
                convId = conv.id;
            }

            let finalToolCalls: any = toolCalls || null;
            if (body) {
                finalToolCalls = await ScriptRunner.evaluate(body, {}, context.prisma, context.user.id);
            }

            let resolvedScriptId: number | null = null;
            if (name) {
                const scope = buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId);
                const existingScript = await context.prisma.script.findFirst({
                    where: { name, ...scope }
                });
                let script;
                if (existingScript) {
                    script = await context.prisma.script.update({
                        where: { id: existingScript.id },
                        data: { body: body || null, toolCalls: finalToolCalls || toolCalls || null },
                    });
                } else {
                    script = await context.prisma.script.create({
                        data: { name, body: body || null, toolCalls: finalToolCalls || toolCalls || null, userId: context.user.id, projectId: context.activeProjectId || null },
                    });
                }
                resolvedScriptId = script.id;
            }

            const scriptAst = finalToolCalls ? compileToAST(finalToolCalls) : null;
            const primaryToolName = scriptAst && (scriptAst as any).steps?.[0]?.tool || 'AST_Root';

            const created = await context.prisma.request.create({
                data: {
                    status: 'NEW',
                    scriptId: resolvedScriptId,
                    toolName: primaryToolName,
                    ast: scriptAst as any,
                    conversationId: convId,
                    userId: context.user.id,
                    projectId: context.activeProjectId || null,
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
            const scope = buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId);
            const script = await context.prisma.script.findFirst({
                where: { id: input.scriptId, ...scope }
            });
            if (!script) throw new Error('Script not found or outside active project scope');

            const uri = input.uri || `agent:${input.name}`;
            const agent = await context.prisma.agent.create({
                data: {
                    name: input.name,
                    uri,
                    description: input.description || null,
                    systemPrompt: input.systemPrompt || null,
                    avatar: input.avatar || null,
                    scriptId: input.scriptId,
                    schedule: input.schedule || 'every 1 hour',
                    userId: context.user.id,
                    projectId: context.activeProjectId || null,
                },
                include: { user: true, script: true },
            });

            await anchorAgentIdentityResource(context.prisma, agent, context.user.id, context.activeProjectId);
            await syncAgentRoles(context.prisma, agent.id, input.roleNames, input.roleIds);
            await recordChange(context, 'AGENT', agent.id, 'AGENT_CREATED', { name: agent.name, uri: agent.uri, scriptId: agent.scriptId, roles: input.roleNames ?? input.roleIds ?? [] }, agent.id);

            return agent;
        },

        updateAgent: async (_parent: any, { id, input }: { id: string; input: any }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const scope = buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId);
            const agent = await context.prisma.agent.findFirst({
                where: { id, ...scope }
            });
            if (!agent) throw new Error('Agent not found or outside active project scope');

            const data: any = {};
            if (input.name !== undefined) data.name = input.name;
            if (input.uri !== undefined) data.uri = input.uri;
            if (input.description !== undefined) data.description = input.description;
            if (input.systemPrompt !== undefined) data.systemPrompt = input.systemPrompt;
            if (input.avatar !== undefined) data.avatar = input.avatar;
            if (input.scriptId !== undefined) {
                const script = await context.prisma.script.findFirst({
                    where: { id: input.scriptId, ...scope }
                });
                if (!script) throw new Error('Script not found or outside active project scope');
                data.scriptId = input.scriptId;
            }
            if (input.schedule !== undefined) {
                data.schedule = input.schedule.trim();
                const nextRunDate = new Date(Date.now() + 60000);
                const pendingConditions: any[] = [{ agentId: id }, { agentId: agent.name }];
                if (agent.scriptId) pendingConditions.push({ scriptId: agent.scriptId });

                await context.prisma.request.updateMany({
                    where: {
                        OR: pendingConditions,
                        status: { in: ['NEW', 'WAITING', 'WAITING_FOR_USER', 'WAITING_FOR_EVENT', 'PAUSED'] }
                    },
                    data: {
                        scheduledAt: nextRunDate,
                        executionScheduled: nextRunDate
                    }
                });
            }

            const updated = await context.prisma.agent.update({
                where: { id },
                data,
                include: { user: true, script: true },
            });

            await anchorAgentIdentityResource(context.prisma, updated, context.user.id, context.activeProjectId);
            await syncAgentRoles(context.prisma, updated.id, input.roleNames, input.roleIds);
            await recordChange(context, 'AGENT', updated.id, 'AGENT_UPDATED', { ...data, ...(input.roleNames || input.roleIds ? { roles: input.roleNames ?? input.roleIds } : {}) }, updated.id);

            return updated;
        },

        upsertAgentWithScript: async (_parent: any, { input }: { input: any }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const userId = context.user.id;
            const scope = buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId);

            const existingScript = await context.prisma.script.findFirst({
                where: { name: input.scriptName, ...scope }
            });
            let script;
            if (existingScript) {
                script = await context.prisma.script.update({
                    where: { id: existingScript.id },
                    data: {
                        body: input.body || null,
                        toolCalls: input.toolCalls || null,
                    }
                });
            } else {
                script = await context.prisma.script.create({
                    data: {
                        name: input.scriptName,
                        body: input.body || null,
                        toolCalls: input.toolCalls || null,
                        userId,
                        projectId: context.activeProjectId || null,
                    }
                });
            }

            const existingAgent = await context.prisma.agent.findFirst({
                where: { name: input.agentName, ...scope }
            });

            const uri = input.uri || `agent:${input.agentName}`;
            let agent;

            if (existingAgent) {
                if (input.schedule !== undefined) {
                    const nextRunDate = new Date(Date.now() + 60000);
                    const pendingConditions: any[] = [{ agentId: existingAgent.id }, { agentId: existingAgent.name }];
                    if (existingAgent.scriptId) pendingConditions.push({ scriptId: existingAgent.scriptId });

                    await context.prisma.request.updateMany({
                        where: {
                            OR: pendingConditions,
                            status: { in: ['NEW', 'WAITING', 'WAITING_FOR_USER', 'WAITING_FOR_EVENT', 'PAUSED'] }
                        },
                        data: {
                            scheduledAt: nextRunDate,
                            executionScheduled: nextRunDate
                        }
                    });
                }

                agent = await context.prisma.agent.update({
                    where: { id: existingAgent.id },
                    data: {
                        scriptId: script.id,
                        schedule: input.schedule,
                        ...(input.uri ? { uri: input.uri } : {}),
                        ...(input.description !== undefined ? { description: input.description } : {}),
                        ...(input.systemPrompt !== undefined ? { systemPrompt: input.systemPrompt } : {}),
                        ...(input.avatar !== undefined ? { avatar: input.avatar } : {}),
                    },
                    include: { user: true, script: true }
                });
            } else {
                agent = await context.prisma.agent.create({
                    data: {
                        name: input.agentName,
                        uri,
                        description: input.description || null,
                        systemPrompt: input.systemPrompt || null,
                        avatar: input.avatar || null,
                        scriptId: script.id,
                        schedule: input.schedule,
                        userId,
                        projectId: context.activeProjectId || null,
                    },
                    include: { user: true, script: true },
                });
            }

            await anchorAgentIdentityResource(context.prisma, agent, userId, context.activeProjectId);
            await syncAgentRoles(context.prisma, agent.id, input.roleNames, input.roleIds);
            await recordChange(context, 'AGENT', agent.id, existingAgent ? 'AGENT_UPDATED' : 'AGENT_CREATED', {
                name: agent.name, uri: agent.uri, scriptId: script.id, scriptName: input.scriptName, schedule: input.schedule
            }, agent.id);

            return agent;
        },

        toggleAgent: async (_parent: any, { id, enabled }: { id: string; enabled: boolean }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const scope = buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId);
            const agent = await context.prisma.agent.findFirst({
                where: { id, ...scope }
            });
            if (!agent) throw new Error('Agent not found or outside active project scope');

            const updated = await context.prisma.agent.update({
                where: { id },
                data: { enabled },
                include: { user: true },
            });

            if (!enabled) {
                const enabledCount = await context.prisma.agent.count({ where: { enabled: true } });
                if (enabledCount === 0) {
                    await context.prisma.request.updateMany({
                        where: {
                            status: { in: ['NEW', 'WAITING', 'WAITING_FOR_USER', 'WAITING_FOR_EVENT', 'PAUSED'] }
                        },
                        data: {
                            status: 'CANCELLED',
                            lockedBy: null,
                            lockedAt: null
                        }
                    });
                } else {
                    const conditions: any[] = [{ agentId: id }, { agentId: agent.name }];
                    if (agent.scriptId) conditions.push({ scriptId: agent.scriptId });

                    const relatedReqs = await context.prisma.request.findMany({
                        where: { OR: conditions },
                        select: { conversationId: true }
                    });
                    const convIds = Array.from(new Set(relatedReqs.map((r: any) => r.conversationId).filter(Boolean)));
                    if (convIds.length > 0) {
                        conditions.push({ conversationId: { in: convIds } });
                    }

                    await context.prisma.request.updateMany({
                        where: {
                            OR: conditions,
                            status: { in: ['NEW', 'WAITING', 'WAITING_FOR_USER', 'WAITING_FOR_EVENT', 'PAUSED'] }
                        },
                        data: {
                            status: 'CANCELLED',
                            lockedBy: null,
                            lockedAt: null
                        }
                    });
                }
            }

            await recordChange(context, 'AGENT', id, enabled ? 'AGENT_ENABLED' : 'AGENT_DISABLED', { enabled }, id);
            return updated;
        },

        triggerAgent: async (_parent: any, { id }: { id: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const scope = buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId);
            const agent = await context.prisma.agent.findFirst({
                where: { id, ...scope },
                include: { script: true }
            });
            if (!agent) throw new Error('Agent not found or outside active project scope');
            if (agent.enabled === false) {
                throw new Error(`Cannot trigger agent '${agent.name}': agent is disabled. Please enable it before running.`);
            }

            const conv = await context.prisma.conversation.create({
                data: {
                    userId: context.user.id,
                    projectId: context.activeProjectId || null,
                }
            });
            return await context.prisma.request.create({
                data: {
                    status: 'NEW',
                    agentId: agent.id,
                    scriptId: agent.scriptId,
                    ast: agent.script?.ast,
                    conversationId: conv.id,
                    projectId: context.activeProjectId || null,
                },
                include: { conversation: true },
            });
        },

        deleteAgent: async (_parent: any, { id }: { id: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const scope = buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId);
            const agent = await context.prisma.agent.findFirst({
                where: { id, ...scope },
                include: { script: true }
            });
            if (!agent) throw new Error('Agent not found or outside active project scope');

            const now = new Date();
            await context.prisma.agent.update({
                where: { id },
                data: { existent: false, deletedAt: now, enabled: false }
            });

            if (agent.scriptId) {
                await context.prisma.script.update({
                    where: { id: agent.scriptId },
                    data: { existent: false, deletedAt: now }
                });
            }

            const conditions: any[] = [{ agentId: id }, { agentId: agent.name }];
            if (agent.scriptId) conditions.push({ scriptId: agent.scriptId });

            const relatedReqs = await context.prisma.request.findMany({
                where: { OR: conditions },
                select: { conversationId: true }
            });
            const convIds = Array.from(new Set(relatedReqs.map((r: any) => r.conversationId).filter(Boolean)));
            if (convIds.length > 0) {
                conditions.push({ conversationId: { in: convIds } });
            }

            await context.prisma.request.updateMany({
                where: {
                    OR: conditions,
                    status: { in: ['NEW', 'WAITING', 'WAITING_FOR_USER', 'WAITING_FOR_EVENT', 'PAUSED'] }
                },
                data: {
                    status: 'CANCELLED',
                    lockedBy: null,
                    lockedAt: null
                }
            });

            await recordChange(context, 'AGENT', id, 'AGENT_DELETED', { name: agent.name, scriptId: agent.scriptId }, id);
            return true;
        },

        approveRequest: async (_parent: any, { id, scope }: { id: string; scope?: 'ONETIME' | 'CONVERSATION' | 'PERMANENT' }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const requestId = Number(id);
            const req = await context.prisma.request.findUnique({
                where: { id: requestId }
            });
            if (!req) throw new Error(`Request ${id} not found`);

            const currentContext = (req.context && typeof req.context === 'object') ? req.context as any : {};
            const pending = currentContext.pendingToolCall;
            // An expired approval wait is closed by the processor (APPROVAL_EXPIRED); it cannot be approved anymore.
            if (pending?.expiresAt && Date.parse(pending.expiresAt) <= Date.now()) {
                throw new Error(`Approval for '${pending.name}' on request ${id} expired at ${pending.expiresAt}`);
            }
            const toolName = pending?.name || currentContext.__pendingApprovalTool__ || req.toolName || '*';
            const approvalScope = scope || 'ONETIME';

            // Grant approval using ApprovalService
            await ApprovalService.grantApproval(context.prisma, {
                toolName,
                scope: approvalScope,
                approvedBy: context.user.email || context.user.id,
                agentId: req.agentId,
                conversationId: req.conversationId,
                requestId: req.id,
                userId: context.user.id
            });
            await recordChange(context, 'TOOL_APPROVAL', String(req.id), 'APPROVAL_GRANTED', { toolName, scope: approvalScope, requestId: req.id }, req.agentId);

            currentContext.__humanApproved__ = true;
            currentContext.__approvalScope__ = approvalScope;
            delete currentContext.__paused__;

            const updatedReq = await context.prisma.request.update({
                where: { id: requestId },
                data: {
                    status: 'NEW',
                    context: currentContext,
                    executionScheduled: new Date(),
                    lockedBy: null,
                    lockedAt: null
                }
            });

            return updatedReq;
        },

        revokeToolApproval: async (_parent: any, { id }: { id: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            await ApprovalService.revokeApproval(context.prisma, id, context.user.email || context.user.id);
            await recordChange(context, 'TOOL_APPROVAL', id, 'APPROVAL_REVOKED');
            return true;
        },

        revokeAgentToolApproval: async (_parent: any, { agentId, toolName }: { agentId: string; toolName: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            await ApprovalService.revokeAgentToolApproval(context.prisma, agentId, toolName, context.user.email || context.user.id);
            await recordChange(context, 'TOOL_APPROVAL', `${agentId}:${toolName}`, 'APPROVAL_REVOKED', { toolName }, agentId);
            return true;
        },

        grantToolApproval: async (_parent: any, { agentId, toolName, scope }: { agentId: string; toolName: string; scope: 'ONETIME' | 'CONVERSATION' | 'PERMANENT' }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const approval = await ApprovalService.grantApproval(context.prisma, {
                toolName,
                scope,
                agentId,
                approvedBy: context.user.email || context.user.id,
                userId: context.user.id
            });
            await recordChange(context, 'TOOL_APPROVAL', String(approval?.id ?? `${agentId}:${toolName}`), 'APPROVAL_GRANTED', { toolName, scope }, agentId);
            return approval;
        },

        assignAgentRole: async (_parent: any, { agentId, roleName }: { agentId: string, roleName: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            let role = await context.prisma.role.findUnique({ where: { name: roleName } });
            if (!role) {
                role = await context.prisma.role.create({ data: { name: roleName, description: `Role ${roleName}` } });
            }
            await context.prisma.agentRole.upsert({
                where: { agentId_roleId: { agentId, roleId: role.id } },
                update: {},
                create: { agentId, roleId: role.id }
            });
            await recordChange(context, 'AGENT', agentId, 'ROLE_ASSIGNED', { roleName }, agentId);
            return await context.prisma.agent.findUnique({
                where: { id: agentId },
                include: { user: true, script: true }
            });
        },

        removeAgentRole: async (_parent: any, { agentId, roleName }: { agentId: string, roleName: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const role = await context.prisma.role.findUnique({ where: { name: roleName } });
            if (role) {
                await context.prisma.agentRole.deleteMany({
                    where: { agentId, roleId: role.id }
                });
                await recordChange(context, 'AGENT', agentId, 'ROLE_REMOVED', { roleName }, agentId);
            }
            return await context.prisma.agent.findUnique({
                where: { id: agentId },
                include: { user: true, script: true }
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
        roles: async (agent: any, _args: any, context: any) => {
            const agentRoles = await context.prisma.agentRole.findMany({
                where: { agentId: agent.id },
                include: { role: { include: { permissions: { include: { permission: true } } } } }
            });
            return agentRoles.map((ar: any) => ar.role).filter(Boolean);
        },
        auditLogs: async (agent: any, args: any, context: any) => {
            return await AuditService.getLogs(context.prisma, { agentId: agent.id, limit: args.limit });
        },
        toolApprovals: async (agent: any, _args: any, context: any) => {
            return await context.prisma.toolApproval.findMany({
                where: { agentId: agent.id },
                orderBy: { createdAt: 'desc' }
            });
        },
    },

    ToolApproval: {
        agent: async (approval: any, _args: any, context: any) => {
            if (!approval.agentId) return null;
            return await context.prisma.agent.findUnique({ where: { id: approval.agentId } });
        },
        createdAt: (approval: any) => approval.createdAt ? new Date(approval.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: (approval: any) => approval.updatedAt ? new Date(approval.updatedAt).toISOString() : new Date().toISOString(),
        revokedAt: (approval: any) => approval.revokedAt ? new Date(approval.revokedAt).toISOString() : null,
    },

    Tool: {
        requiresHumanApproval: (tool: any) => tool.requiresHumanApproval ?? tool.requiresConfirmation ?? false,
        requiresConfirmation: (tool: any) => tool.requiresConfirmation ?? tool.requiresHumanApproval ?? false,
        accessLevel: (tool: any) => tool.accessLevel || 'safe_write',
        requiredRole: (tool: any) => tool.requiredRole || 'agent:writer',
    },

    Role: {
        permissions: async (role: any, _args: any, context: any) => {
            if (role.permissions && Array.isArray(role.permissions) && role.permissions[0]?.name) {
                return role.permissions;
            }
            const rolePerms = await context.prisma.rolePermission.findMany({
                where: { roleId: role.id },
                include: { permission: true }
            });
            return rolePerms.map((rp: any) => rp.permission).filter(Boolean);
        }
    },
};
