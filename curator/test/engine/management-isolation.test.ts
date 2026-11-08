import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, type TestEnv } from '../helpers/harness.js';
import {
  list_agents,
  upsert_agent,
  delete_agent,
  grant_agent_role,
  revoke_agent_role,
  list_scripts,
  get_script,
  upsert_script,
  promote_script_version,
  delete_script,
  list_projects,
  upsert_project,
  delete_project,
} from '../../src/tools/management.js';
import { AgentRoleService } from '../../src/services/AgentRoleService.js';
import { saveScriptVersion } from '../../src/engine/ScriptRegistry.js';

async function setupTest(name: string) {
  const env = await createEnv(name);
  await AgentRoleService.ensureDefaultRoles(env.prisma);

  // Helper to execute a tool with a given caller identity
  const runTool = async (
    tool: any,
    args: Record<string, any>,
    caller: { agentId?: string; scriptId?: number; projectId?: string; userId?: string }
  ) => {
    return tool.runAsync({
      args,
      toolContext: {
        prisma: env.prisma,
        userId: caller.userId ?? env.userId,
        agentId: caller.agentId,
        scriptId: caller.scriptId,
        projectId: caller.projectId,
        conversationId: env.conversationId,
      },
    });
  };

  return { env, runTool };
}

test('management isolation: agent cannot mutate, re-role, or delete itself (self-referential guardrail)', async () => {
  const { env, runTool } = await setupTest('isolation_self');
  try {
    const parentAgent = await env.prisma.agent.create({
      data: { id: 'ag-root', name: 'rootAgent', userId: env.userId },
    });
    await env.prisma.agentRole.create({
      data: { agentId: parentAgent.id, roleId: 'agent:manager' },
    });

    // 1. Cannot update own agent row
    await assert.rejects(
      async () => {
        await runTool(upsert_agent, { id: parentAgent.id, name: 'rootAgent', schedule: 'every 1 hour' }, { agentId: parentAgent.id });
      },
      /FORBIDDEN_SELF_MUTATION: Agent 'rootAgent' cannot modify, re-role or delete itself/
    );

    // 2. Cannot delete itself
    await assert.rejects(
      async () => {
        await runTool(delete_agent, { agent: parentAgent.id }, { agentId: parentAgent.id });
      },
      /FORBIDDEN_SELF_MUTATION: Agent 'rootAgent' cannot modify, re-role or delete itself/
    );

    // 3. Cannot grant roles to itself
    await assert.rejects(
      async () => {
        await runTool(grant_agent_role, { agent: parentAgent.id, roles: ['agent:reader'] }, { agentId: parentAgent.id });
      },
      /FORBIDDEN_SELF_MUTATION: Agent 'rootAgent' cannot modify, re-role or delete itself/
    );
  } finally {
    await env.cleanup();
  }
});

test('management isolation: sub-agent cannot mutate its creator or peer agents', async () => {
  const { env, runTool } = await setupTest('isolation_ancestors');
  try {
    const parentAgent = await env.prisma.agent.create({
      data: { id: 'ag-parent', name: 'parentAgent', userId: env.userId },
    });
    const subAgent = await env.prisma.agent.create({
      data: { id: 'ag-child', name: 'childAgent', userId: env.userId, parentAgentId: parentAgent.id },
    });
    const peerAgent = await env.prisma.agent.create({
      data: { id: 'ag-peer', name: 'peerAgent', userId: env.userId },
    });

    await env.prisma.agentRole.create({ data: { agentId: subAgent.id, roleId: 'agent:manager' } });

    // 1. Cannot mutate parent / creator
    await assert.rejects(
      async () => {
        await runTool(upsert_agent, { id: parentAgent.id, name: 'parentAgent' }, { agentId: subAgent.id });
      },
      /FORBIDDEN_ANCESTOR_MUTATION: Agent 'childAgent' cannot modify its creator agent 'parentAgent'/
    );

    // 2. Cannot delete parent
    await assert.rejects(
      async () => {
        await runTool(delete_agent, { agent: parentAgent.id }, { agentId: subAgent.id });
      },
      /FORBIDDEN_ANCESTOR_MUTATION/
    );

    // 3. Cannot mutate peer (unrelated agent not in its sub-agent lineage)
    await assert.rejects(
      async () => {
        await runTool(upsert_agent, { id: peerAgent.id, name: 'peerAgent' }, { agentId: subAgent.id });
      },
      /NOT_A_SUB_AGENT: Agent 'peerAgent' was not created by agent 'childAgent'/
    );
  } finally {
    await env.cleanup();
  }
});

test('management isolation: privilege escalation prevention (cannot grant roles actor does not hold)', async () => {
  const { env, runTool } = await setupTest('isolation_priv_esc');
  try {
    const manager = await env.prisma.agent.create({
      data: { id: 'ag-mgr', name: 'mgrAgent', userId: env.userId },
    });
    // Manager only holds agent:manager and agent:reader
    await env.prisma.agentRole.create({ data: { agentId: manager.id, roleId: 'agent:manager' } });
    await env.prisma.agentRole.create({ data: { agentId: manager.id, roleId: 'agent:reader' } });

    // Creates a valid sub-agent
    const created = await runTool(
      upsert_agent,
      { name: 'workerAgent', roles: ['agent:reader'] },
      { agentId: manager.id }
    );
    assert.equal(created.ok, true);
    assert.equal(created.agent.name, 'workerAgent');

    // Attempt to grant agent:admin to workerAgent -> privilege escalation
    await assert.rejects(
      async () => {
        await runTool(
          grant_agent_role,
          { agent: 'workerAgent', roles: ['agent:admin'] },
          { agentId: manager.id }
        );
      },
      /PRIVILEGE_ESCALATION: Agent 'mgrAgent' cannot grant roles it does not hold: \[agent:admin\]/
    );
  } finally {
    await env.cleanup();
  }
});

test('management isolation: workspace and sub-project scoping', async () => {
  const { env, runTool } = await setupTest('isolation_workspace');
  try {
    await env.prisma.project.create({ data: { id: 'p-corp', name: 'Corporate', userId: env.userId } });
    await env.prisma.project.create({ data: { id: 'p-sub', name: 'SubTeam', parentId: 'p-corp', userId: env.userId } });
    await env.prisma.project.create({ data: { id: 'p-alien', name: 'AlienProject', userId: env.userId } });

    const agent = await env.prisma.agent.create({
      data: { id: 'ag-corp', name: 'corpAgent', userId: env.userId, projectId: 'p-corp' },
    });
    await env.prisma.agentRole.create({ data: { agentId: agent.id, roleId: 'agent:manager' } });

    // 1. Can create sub-project under own workspace
    const subProj = await runTool(
      upsert_project,
      { name: 'InnerProject', parentId: 'p-sub' },
      { agentId: agent.id, projectId: 'p-corp' }
    );
    assert.equal(subProj.ok, true);
    assert.equal(subProj.project.name, 'InnerProject');

    // 2. Cannot modify its own workspace project
    await assert.rejects(
      async () => {
        await runTool(
          upsert_project,
          { id: 'p-corp', name: 'RenamedCorp' },
          { agentId: agent.id, projectId: 'p-corp' }
        );
      },
      /FORBIDDEN_SELF_MUTATION: Agent 'ag-corp' cannot modify its own workspace project/
    );

    // 3. Cannot touch outside alien project
    await assert.rejects(
      async () => {
        await runTool(
          upsert_project,
          { id: 'p-alien', name: 'HackedAlien' },
          { agentId: agent.id, projectId: 'p-corp' }
        );
      },
      /OUT_OF_WORKSPACE/
    );
  } finally {
    await env.cleanup();
  }
});

test('management isolation: script protection and draft versioning', async () => {
  const { env, runTool } = await setupTest('isolation_scripts');
  try {
    const dummyAst = {
      type: 'Curator_Module',
      name: 'my_running_script',
      main: { type: 'Curator_Script', language: 'javascript', code: 'return 42;' },
    };
    const saved = await saveScriptVersion(env.prisma, {
      name: 'my_running_script',
      ast: dummyAst as any,
      userId: env.userId,
    });

    const agent = await env.prisma.agent.create({
      data: { id: 'ag-coder', name: 'coderAgent', userId: env.userId, scriptId: saved.scriptId },
    });
    await env.prisma.agentRole.create({ data: { agentId: agent.id, roleId: 'agent:developer' } });

    // 1. Agent cannot mutate its own running script
    await assert.rejects(
      async () => {
        await runTool(
          upsert_script,
          {
            name: 'my_running_script',
            ast: {
              type: 'Curator_Module',
              name: 'my_running_script',
              main: { type: 'Curator_Script', language: 'javascript', code: 'return 100;' },
            },
          },
          { agentId: agent.id, scriptId: saved.scriptId }
        );
      },
      /PROTECTED_SCRIPT: Script 'my_running_script' defines the acting agent or the running workflow/
    );

    // 2. Agent can create a brand new auxiliary script
    const newAst = {
      type: 'Curator_Module',
      name: 'task_worker_flow',
      main: { type: 'Curator_Script', language: 'javascript', code: 'return "hello";' },
    };
    const createdScript = await runTool(
      upsert_script,
      { name: 'task_worker_flow', ast: newAst },
      { agentId: agent.id }
    );
    assert.equal(createdScript.ok, true);
    assert.equal(createdScript.active, true);

    // 3. Agent editing existing auxiliary script is saved as DRAFT (requires promotion)
    const updatedAst = {
      type: 'Curator_Module',
      name: 'task_worker_flow',
      main: { type: 'Curator_Script', language: 'javascript', code: 'return "updated";' },
    };
    const draftUpdate = await runTool(
      upsert_script,
      { name: 'task_worker_flow', ast: updatedAst },
      { agentId: agent.id }
    );
    assert.equal(draftUpdate.ok, true);
    assert.equal(draftUpdate.active, false); // draft!
    assert.match(draftUpdate.note, /Stored as draft v2/);

    // Check that active version in database is still v1
    const scriptRow = await env.prisma.script.findUnique({ where: { name: 'task_worker_flow' } });
    assert.equal(scriptRow.currentVersion, 1);

    // 4. Promote script version activates it
    const promoted = await runTool(
      promote_script_version,
      { name: 'task_worker_flow', version: 2 },
      { agentId: agent.id }
    );
    assert.equal(promoted.ok, true);
    assert.equal(promoted.version, 2);

    const scriptRowAfter = await env.prisma.script.findUnique({ where: { name: 'task_worker_flow' } });
    assert.equal(scriptRowAfter.currentVersion, 2);
  } finally {
    await env.cleanup();
  }
});

test('management isolation: soft-delete cascading and active-chain validation', async () => {
  const { env, runTool } = await setupTest('isolation_soft_delete');
  try {
    // 1. Setup project hierarchy: p-root -> p-child -> p-grandchild
    await env.prisma.project.create({ data: { id: 'p-root', name: 'Root', userId: env.userId } });
    await env.prisma.project.create({ data: { id: 'p-child', name: 'Child', parentId: 'p-root', userId: env.userId } });
    await env.prisma.project.create({ data: { id: 'p-grandchild', name: 'GrandChild', parentId: 'p-child', userId: env.userId } });

    // Setup an agent in p-child
    const childAgent = await env.prisma.agent.create({
      data: { id: 'ag-child-worker', name: 'childWorker', userId: env.userId, projectId: 'p-child' },
    });
    await env.prisma.agentRole.create({ data: { agentId: childAgent.id, roleId: 'agent:manager' } });

    // Setup a resource in p-grandchild
    await env.prisma.resource.create({
      data: { uri: 'res:sample', title: 'Sample', userId: env.userId, projectId: 'p-grandchild' },
    });

    // 2. Cascade delete p-child (which includes p-grandchild)
    const delRes = await runTool(
      delete_project,
      { id: 'p-child' },
      { userId: env.userId } // Human admin deletes p-child
    );
    assert.equal(delRes.ok, true);
    assert.ok(delRes.deletedProjects.includes('p-child'));
    assert.ok(delRes.deletedProjects.includes('p-grandchild'));

    // Verify projects are soft deleted
    const childProj = await env.prisma.project.findUnique({ where: { id: 'p-child' } });
    assert.equal(childProj.existent, false);
    assert.ok(childProj.deletedAt != null);

    const grandProj = await env.prisma.project.findUnique({ where: { id: 'p-grandchild' } });
    assert.equal(grandProj.existent, false);

    // Verify child agent is disabled & soft-deleted
    const agentRow = await env.prisma.agent.findUnique({ where: { id: 'ag-child-worker' } });
    assert.equal(agentRow.enabled, false);
    assert.equal(agentRow.existent, false);

    // Verify child resource is soft deleted
    const resRow = await env.prisma.resource.findUnique({ where: { uri: 'res:sample' } });
    assert.equal(resRow.existent, false);

    // 3. Verify AgentRoleService rejects the soft-deleted / disabled agent
    const roleCheck = await AgentRoleService.validateActorToolAccess(
      env.prisma,
      { agentId: childAgent.id, projectId: 'p-child' },
      'list_scripts'
    );
    assert.equal(roleCheck.allowed, false);
    assert.match(roleCheck.reason, /not found or has been deleted/);
  } finally {
    await env.cleanup();
  }
});
