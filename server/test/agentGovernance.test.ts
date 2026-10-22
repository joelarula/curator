import { describe, it, expect, vi } from 'vitest';
import { getRegisteredTools, getToolDefinition, isToolRequiringApproval } from '../src/services/ToolRegistry.js';
import { AgentRoleService } from '../src/services/AgentRoleService.js';
import { AuditService } from '../src/services/AuditService.js';

describe('Curator Core - AI Agent Governance & Least Privilege', () => {

    describe('Tool Configuration & Human Approval Gating', () => {
        it('should correctly configure and identify tools requiring human approval', () => {
            // Critical / destructive / elevated tools must mandate human approval
            expect(isToolRequiringApproval('delete_resource')).toBe(true);
            expect(isToolRequiringApproval('execute_script')).toBe(true);
            expect(isToolRequiringApproval('browser_action')).toBe(true);
            expect(isToolRequiringApproval('llama_props_set')).toBe(true);
            expect(isToolRequiringApproval('llama_slot_action')).toBe(true);
            expect(isToolRequiringApproval('llama_lora_set')).toBe(true);

            // Safe read / write tools must be autonomous by default
            expect(isToolRequiringApproval('ask_llm')).toBe(false);
            expect(isToolRequiringApproval('query_resources')).toBe(false);
            expect(isToolRequiringApproval('classify')).toBe(false);
            expect(isToolRequiringApproval('upsert_resource')).toBe(false);
            expect(isToolRequiringApproval('upsert_text')).toBe(false);
        });

        it('should expose gating and role requirements in registered tools', () => {
            const tools = getRegisteredTools();
            expect(tools.length).toBeGreaterThan(20);

            const deleteTool = tools.find(t => t.name === 'delete_resource');
            expect(deleteTool).toBeDefined();
            expect(deleteTool?.requiresHumanApproval).toBe(true);
            expect(deleteTool?.accessLevel).toBe('destructive');
            expect(deleteTool?.requiredRole).toBe('agent:admin');

            const scriptTool = tools.find(t => t.name === 'execute_script');
            expect(scriptTool).toBeDefined();
            expect(scriptTool?.requiresHumanApproval).toBe(true);
            expect(scriptTool?.accessLevel).toBe('elevated');

            const askLlmTool = tools.find(t => t.name === 'ask_llm');
            expect(askLlmTool).toBeDefined();
            expect(askLlmTool?.requiresHumanApproval).toBe(false);
            expect(askLlmTool?.accessLevel).toBe('safe_read');
            expect(askLlmTool?.requiredRole).toBe('agent:reader');
        });
    });

    describe('Whitelist-Based Role Access Control (AgentRoleService)', () => {
        it('should DENY all tools by default if an agent has no roles assigned', async () => {
            const mockPrisma: any = {
                agent: {
                    findUnique: vi.fn().mockResolvedValue({
                        id: 'agent-no-roles',
                        name: 'UnrestrictedAttemptAgent',
                        roles: []
                    })
                }
            };

            const result = await AgentRoleService.validateAgentToolAccess(
                mockPrisma,
                'agent-no-roles',
                'ask_llm',
                getToolDefinition('ask_llm')
            );

            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('has no assigned roles');
            expect(result.reason).toContain('whitelist-based by default');
        });

        it('should ALLOW tools matching assigned role (e.g. agent:reader)', async () => {
            const mockPrisma: any = {
                agent: {
                    findUnique: vi.fn().mockResolvedValue({
                        id: 'agent-reader',
                        name: 'ReaderAgent',
                        roles: [
                            { role: { name: 'agent:reader', permissions: [] } }
                        ]
                    })
                }
            };

            const readerCheck = await AgentRoleService.validateAgentToolAccess(
                mockPrisma,
                'agent-reader',
                'ask_llm',
                getToolDefinition('ask_llm')
            );
            expect(readerCheck.allowed).toBe(true);

            // Attempting delete_resource with only reader role must be DENIED
            const deleteCheck = await AgentRoleService.validateAgentToolAccess(
                mockPrisma,
                'agent-reader',
                'delete_resource',
                getToolDefinition('delete_resource')
            );
            expect(deleteCheck.allowed).toBe(false);
            expect(deleteCheck.reason).toContain('not whitelisted');
        });

        it('should ALLOW all tools if agent holds agent:admin role', async () => {
            const mockPrisma: any = {
                agent: {
                    findUnique: vi.fn().mockResolvedValue({
                        id: 'agent-admin',
                        name: 'AdminAgent',
                        roles: [
                            { role: { name: 'agent:admin', permissions: [] } }
                        ]
                    })
                }
            };

            const check = await AgentRoleService.validateAgentToolAccess(
                mockPrisma,
                'agent-admin',
                'delete_resource',
                getToolDefinition('delete_resource')
            );
            expect(check.allowed).toBe(true);
        });

        it('should ALLOW a specific tool if agent has direct tool role (e.g. tool:delete_resource)', async () => {
            const mockPrisma: any = {
                agent: {
                    findUnique: vi.fn().mockResolvedValue({
                        id: 'agent-specific',
                        name: 'SpecialistAgent',
                        roles: [
                            { role: { name: 'tool:delete_resource', permissions: [] } }
                        ]
                    })
                }
            };

            const check = await AgentRoleService.validateAgentToolAccess(
                mockPrisma,
                'agent-specific',
                'delete_resource',
                getToolDefinition('delete_resource')
            );
            expect(check.allowed).toBe(true);
        });
    });

    describe('Audit view derived from Responses (AuditService)', () => {
        it('should derive structured audit entries from Responses and filter by agentId', async () => {
            const responses: any[] = [
                {
                    id: 2,
                    requestId: 99,
                    content: JSON.stringify({ type: 'TOOL_BLOCKED', tool: 'delete_resource', reason: 'not whitelisted' }),
                    createdAt: new Date('2026-01-01T00:00:02Z'),
                    request: { id: 99, agentId: 'agent-123', userId: 'user-456', status: 'FAILED', toolName: 'delete_resource', ast: null },
                },
                {
                    id: 1,
                    requestId: 98,
                    content: '{"answer":42}',
                    createdAt: new Date('2026-01-01T00:00:01Z'),
                    request: { id: 98, agentId: 'agent-123', userId: 'user-456', status: 'COMPLETED', toolName: null, ast: { type: 'Curator_Tool', toolName: 'ask_llm' } },
                },
            ];
            const mockPrisma: any = {
                response: {
                    findMany: vi.fn().mockImplementation(async ({ where }) =>
                        responses.filter(r => !where?.request?.agentId || r.request.agentId === where.request.agentId)
                    ),
                },
            };

            const logs = await AuditService.getLogs(mockPrisma, { agentId: 'agent-123' });
            expect(mockPrisma.response.findMany).toHaveBeenCalledOnce();
            expect(mockPrisma.response.findMany.mock.calls[0][0].where).toEqual({ request: { agentId: 'agent-123' } });
            expect(logs.length).toBe(2);
            expect(logs[0]).toMatchObject({ action: 'TOOL_BLOCKED', requestId: 99, status: 'FAILED', entityType: 'AGENT' });
            expect(logs[0].metadata).toMatchObject({ tool: 'delete_resource', reason: 'not whitelisted' });
            expect(logs[1]).toMatchObject({ action: 'TOOL_RESULT', requestId: 98, metadata: { tool: 'ask_llm' } });
        });

        it('should record core model changes as a Request + MODEL_CHANGED Response and list them', async () => {
            const requests: any[] = [];
            const responses: any[] = [];
            const mockPrisma: any = {
                conversation: {
                    findFirst: vi.fn().mockResolvedValue(null),
                    create: vi.fn().mockResolvedValue({ id: 7 }),
                },
                request: {
                    create: vi.fn().mockImplementation(async ({ data }) => {
                        const row = { id: 100 + requests.length, ...data };
                        requests.push(row);
                        return row;
                    }),
                },
                response: {
                    create: vi.fn().mockImplementation(async ({ data }) => {
                        const row = { id: responses.length + 1, createdAt: new Date(), ...data };
                        responses.push(row);
                        return row;
                    }),
                    findMany: vi.fn().mockImplementation(async () =>
                        responses.map(r => ({ ...r, request: requests.find(q => q.id === r.requestId) }))
                    ),
                },
            };

            const rec = await AuditService.recordModelChange(mockPrisma, {
                entityType: 'AGENT', entityId: 'agent-1', action: 'ROLE_ASSIGNED',
                userId: 'user-1', projectId: 'p1', agentId: 'agent-1', changes: { roleName: 'agent:reader' },
            });
            expect(rec?.requestId).toBe(100);
            expect(requests[0]).toMatchObject({ status: 'COMPLETED', conversationId: 7, userId: 'user-1', context: { origin: 'GRAPHQL' } });
            expect(JSON.parse(responses[0].content)).toMatchObject({ type: 'MODEL_CHANGED', change: { action: 'ROLE_ASSIGNED' } });

            const logs = await AuditService.getLogs(mockPrisma, { agentId: 'agent-1' });
            expect(logs[0]).toMatchObject({ entityType: 'AGENT', entityId: 'agent-1', action: 'ROLE_ASSIGNED', status: 'SUCCESS', metadata: { roleName: 'agent:reader' } });
        });
    });
});
