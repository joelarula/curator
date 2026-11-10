import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv } from '../helpers/harness.js';
import {
  list_shapes,
  upsert_shape_entity,
  get_shape_entity,
  delete_shape_entity,
} from '../../src/tools/shapes.js';
import {
  search_resources,
  upsert_resource,
  get_resource,
  attach_resource,
  delete_resource,
  upsert_text,
  delete_text,
  upsert_relation,
  delete_relation,
} from '../../src/tools/resources.js';
import { AgentRoleService } from '../../src/services/AgentRoleService.js';
import { ensureSystemProject } from '../../src/services/ProjectScopeService.js';

async function setupTest(name: string) {
  const env = await createEnv(name);
  await AgentRoleService.ensureDefaultRoles(env.prisma);
  await ensureSystemProject(env.prisma);

  const runTool = async (
    tool: any,
    args: Record<string, any>,
    caller: { agentId?: string; projectId?: string; userId?: string } = {}
  ) => {
    return tool.runAsync({
      args,
      toolContext: {
        prisma: env.prisma,
        userId: caller.userId ?? env.userId,
        agentId: caller.agentId,
        projectId: caller.projectId ?? 'test-proj',
        conversationId: env.conversationId,
      },
    });
  };

  // Ensure test project exists
  await env.prisma.project.upsert({
    where: { id: 'test-proj' },
    update: {},
    create: { id: 'test-proj', name: 'Test Project', userId: String(env.userId) },
  });

  return { env, runTool };
}

test('shapes: list_shapes returns core semantic shapes and properties', async () => {
  const { env, runTool } = await setupTest('shapes_list');
  try {
    const res = await runTool(list_shapes, {});
    assert.equal(res.count >= 10, true);
    const names = res.shapes.map((s: any) => s.name);
    assert.ok(names.includes('Article'));
    assert.ok(names.includes('Person'));
    assert.ok(names.includes('Folder'));
    assert.ok(names.includes('Media Object'));
    assert.ok(names.includes('Prompt'));
    assert.ok(names.includes('Skill'));

    const skill = res.shapes.find((s: any) => s.name === 'Skill');
    assert.ok(skill.properties.some((p: any) => p.field === 'instructions'));
    assert.ok(skill.properties.some((p: any) => p.field === 'requiredTools'));

    const prompt = res.shapes.find((s: any) => s.name === 'Prompt');
    assert.ok(prompt.properties.some((p: any) => p.field === 'template'));

    const article = res.shapes.find((s: any) => s.name === 'Article');
    assert.ok(article.properties.some((p: any) => p.field === 'headline'));
    assert.ok(article.properties.some((p: any) => p.field === 'status'));
  } finally {
    await env.cleanup();
  }
});

test('shapes: upsert_shape_entity, get_shape_entity, and delete_shape_entity', async () => {
  const { env, runTool } = await setupTest('shapes_crud');
  try {
    const caller = { projectId: 'test-proj' };

    // 1. Create a Person entity
    const person = await runTool(
      upsert_shape_entity,
      {
        shape: 'Person',
        subjectUri: 'person:ada',
        data: { name: 'Ada Lovelace', email: 'ada@example.com' },
      },
      caller
    );
    assert.equal(person.ok, true);
    assert.equal(person.created, true);

    // 2. Create an Article entity referencing the person
    const article = await runTool(
      upsert_shape_entity,
      {
        shape: 'Article',
        subjectUri: 'article:note-1',
        data: {
          headline: 'First Computational Algorithm',
          status: 'PUBLISHED',
          author: 'person:ada',
          keywords: ['Computing', 'History'],
        },
      },
      caller
    );
    assert.equal(article.ok, true);

    // 3. Read back using get_shape_entity
    const read = await runTool(
      get_shape_entity,
      { shape: 'Article', subjectUri: 'article:note-1' },
      caller
    );
    assert.equal(read.found, true);
    assert.equal(read.data.headline, 'First Computational Algorithm');
    assert.equal(read.data.status, 'PUBLISHED');

    // 4. Update the entity
    const updated = await runTool(
      upsert_shape_entity,
      {
        shape: 'Article',
        subjectUri: 'article:note-1',
        data: {
          headline: 'First Computational Algorithm (Revised)',
          status: 'PUBLISHED',
        },
      },
      caller
    );
    assert.equal(updated.ok, true);
    assert.equal(updated.created, false);

    const readUpdated = await runTool(
      get_shape_entity,
      { shape: 'Article', subjectUri: 'article:note-1' },
      caller
    );
    assert.equal(readUpdated.data.headline, 'First Computational Algorithm (Revised)');

    // 5. Delete entity
    const del = await runTool(
      delete_shape_entity,
      { subjectUri: 'article:note-1' },
      caller
    );
    assert.equal(del.ok, true);
    assert.equal(del.deleted, true);

    const readAfter = await runTool(
      get_shape_entity,
      { shape: 'Article', subjectUri: 'article:note-1' },
      caller
    );
    assert.equal(readAfter.found, false);
  } finally {
    await env.cleanup();
  }
});

test('shapes: Prompt and Skill entity creation, linking, and retrieval', async () => {
  const { env, runTool } = await setupTest('shapes_prompt_skill');
  try {
    const caller = { projectId: 'test-proj' };

    // 1. Create a Skill shape entity
    const skill = await runTool(
      upsert_shape_entity,
      {
        shape: 'Skill',
        subjectUri: 'skill:database_admin',
        data: {
          name: 'Database Administrator',
          description: 'Guidelines and procedures for administering SQLite, MariaDB and Postgres schemas.',
          instructions: '# DB Admin Skill\n1. Inspect schemas\n2. Verify migrations\n3. Enforce partitions.',
          requiredTools: ['search_resources', 'upsert_resource'],
          category: 'engineering',
          version: '1.0.0',
        },
      },
      caller
    );
    assert.equal(skill.ok, true);
    assert.equal(skill.targetClass, 'curator:Skill');

    // 2. Read back Skill entity
    const fetchedSkill = await runTool(
      get_shape_entity,
      { shape: 'Skill', subjectUri: 'skill:database_admin' },
      caller
    );
    assert.equal(fetchedSkill.found, true);
    assert.equal(fetchedSkill.data.name, 'Database Administrator');
    assert.equal(fetchedSkill.data.instructions, '# DB Admin Skill\n1. Inspect schemas\n2. Verify migrations\n3. Enforce partitions.');
    assert.ok(fetchedSkill.data.requiredTools.includes('search_resources'));

    // 3. Create a Prompt shape entity
    const prompt = await runTool(
      upsert_shape_entity,
      {
        shape: 'Prompt',
        subjectUri: 'prompt:sql_optimizer',
        data: {
          name: 'SQL Optimizer',
          description: 'Optimizes raw queries for partitioned distributed tables.',
          template: 'Given the following SQL schema: {{schema}}, optimize query: {{query}}',
          systemInstruction: 'Act as a Senior Database Reliability Engineer.',
          inputVariables: ['schema', 'query'],
          modelTarget: 'default',
          version: '1.0.0',
        },
      },
      caller
    );
    assert.equal(prompt.ok, true);
    assert.equal(prompt.targetClass, 'curator:Prompt');

    // 4. Read back Prompt entity
    const fetchedPrompt = await runTool(
      get_shape_entity,
      { shape: 'Prompt', subjectUri: 'prompt:sql_optimizer' },
      caller
    );
    assert.equal(fetchedPrompt.found, true);
    assert.equal(fetchedPrompt.data.name, 'SQL Optimizer');
    assert.equal(fetchedPrompt.data.template, 'Given the following SQL schema: {{schema}}, optimize query: {{query}}');
    assert.equal(fetchedPrompt.data.systemInstruction, 'Act as a Senior Database Reliability Engineer.');

    // 5. Query through search_resources
    const searchSkills = await runTool(
      search_resources,
      { type: 'curator:Skill', query: 'Database' },
      caller
    );
    assert.equal(searchSkills.count >= 1, true);
    assert.equal(searchSkills.resources[0].uri, 'skill:database_admin');
  } finally {
    await env.cleanup();
  }
});

test('resources: raw CRUD, text attachments, and search/filtering', async () => {
  const { env, runTool } = await setupTest('resources_crud');
  try {
    const caller = { projectId: 'test-proj' };

    // 1. Raw Resource Upsert
    const r1 = await runTool(
      upsert_resource,
      {
        uri: 'doc:spec-01',
        title: 'Architectural Specification',
        description: 'Details on entity isolation and tools',
        isPublished: true,
        metadata: { category: 'docs', version: '2.0' },
      },
      caller
    );
    assert.equal(r1.ok, true);
    assert.equal(r1.resource.uri, 'doc:spec-01');

    // 2. Upsert Text on Resource
    const t1 = await runTool(
      upsert_text,
      {
        resourceUri: 'doc:spec-01',
        role: 'MAIN',
        content: '# Core Engine\nThis document outlines tool isolation and shape support.',
        mimeType: 'text/markdown',
      },
      caller
    );
    assert.equal(t1.ok, true);
    assert.equal(t1.role, 'MAIN');

    // 3. Upsert Relation (RDF triple)
    const rel = await runTool(
      upsert_relation,
      {
        subjectUri: 'doc:spec-01',
        predicateUri: 'schema:about',
        objectUri: 'topic:security',
        justification: 'Document discusses guardrails and isolation',
      },
      caller
    );
    assert.equal(rel.ok, true);

    // 4. Get Raw Resource (including texts and relations)
    const fetched = await runTool(
      get_resource,
      { uri: 'doc:spec-01' },
      caller
    );
    assert.equal(fetched.found, true);
    assert.equal(fetched.resource.title, 'Architectural Specification');
    assert.equal(fetched.resource.texts.length, 1);
    assert.equal(fetched.resource.texts[0].role, 'MAIN');
    assert.equal(fetched.resource.relations.length, 1);

    // 5. Search Resources with filtering
    const searchResult = await runTool(
      search_resources,
      {
        query: 'Architectural',
        uriPrefix: 'doc:',
        includeTexts: true,
        includeRelations: true,
      },
      caller
    );
    assert.equal(searchResult.count >= 1, true);
    assert.equal(searchResult.resources[0].uri, 'doc:spec-01');
    assert.ok(searchResult.resources[0].texts.length > 0);

    // 6. Delete Text
    const delText = await runTool(
      delete_text,
      { resourceUri: 'doc:spec-01', role: 'MAIN' },
      caller
    );
    assert.equal(delText.ok, true);
    assert.equal(delText.deleted, true);

    // 7. Delete Relation
    const delRel = await runTool(
      delete_relation,
      {
        subjectUri: 'doc:spec-01',
        predicateUri: 'schema:about',
        objectUri: 'topic:security',
      },
      caller
    );
    assert.equal(delRel.ok, true);
    assert.equal(delRel.deletedCount, 1);

    // 8. Delete Resource
    const delResource = await runTool(
      delete_resource,
      { uri: 'doc:spec-01' },
      caller
    );
    assert.equal(delResource.ok, true);
    assert.equal(delResource.deleted, true);

    const fetchedAfter = await runTool(
      get_resource,
      { uri: 'doc:spec-01' },
      caller
    );
    assert.equal(fetchedAfter.found, false);
  } finally {
    await env.cleanup();
  }
});

test('resources: attach_resource links a readable resource to the conversation and returns an excerpt', async () => {
  const { env, runTool } = await setupTest('resources_attach');
  try {
    const own = await env.prisma.resource.create({ data: { uri: 'doc:own', title: 'Own doc', userId: String(env.userId), projectId: 'test-proj' } });
    await env.prisma.text.create({ data: { resourceId: own.id, content: 'Hello from the doc', userId: String(env.userId) } });
    await env.prisma.project.create({ data: { id: 'other-proj', name: 'Other', userId: String(env.userId) } });
    await env.prisma.resource.create({ data: { uri: 'doc:other', title: 'Other doc', userId: String(env.userId), projectId: 'other-proj' } });

    const res = await runTool(attach_resource, { uri: 'doc:own' });
    assert.equal(res.attached, true);
    assert.equal(res.linked, true);
    assert.equal(res.resource.title, 'Own doc');
    assert.equal(res.excerpt, 'Hello from the doc');
    const conv = await env.prisma.conversation.findUnique({ where: { id: env.conversationId }, include: { resources: true } });
    assert.deepEqual(conv.resources.map((r: any) => r.uri), ['doc:own']);

    // Another project's resource is not found from this project
    const other = await runTool(attach_resource, { uri: 'doc:other' });
    assert.equal(other.attached, false);
  } finally { await env.cleanup(); }
});
