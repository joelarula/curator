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

    describe('Audit Log Service (AuditService)', () => {
        it('should record structured audit log entries and query by agentId', async () => {
            const createdEntries: any[] = [];
            const mockPrisma: any = {
                auditLog: {
                    create: vi.fn().mockImplementation(async ({ data }) => {
                        const entry = { id: `audit-${Date.now()}`, ...data };
                        createdEntries.push(entry);
                        return entry;
                    }),
                    findMany: vi.fn().mockImplementation(async ({ where }) => {
                        return createdEntries.filter(e => e.agentId === where.OR?.[0]?.agentId);
                    })
                }
            };

            const entry = await AuditService.log(mockPrisma, {
                entityType: 'AGENT',
                entityId: 'agent-123',
                action: 'TOOL_EXECUTION',
                userId: 'user-456',
                agentId: 'agent-123',
                requestId: 99,
                status: 'SUCCESS',
                metadata: { tool: 'ask_llm', tokens: 42 }
            });

            expect(entry).toBeDefined();
            expect(entry?.action).toBe('TOOL_EXECUTION');
            expect(mockPrisma.auditLog.create).toHaveBeenCalledOnce();

            const logs = await AuditService.getLogs(mockPrisma, { agentId: 'agent-123' });
            expect(logs.length).toBe(1);
            expect(logs[0].requestId).toBe(99);
        });
    });
});
