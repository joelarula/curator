import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv } from '../helpers/harness.ts';
import { prompt_list, prompt_get, prompt_save, prompt_delete, promptPlaceholders, renderPrompt } from '../../src/tools/prompts.ts';

test('prompts: placeholders and rendering', () => {
  assert.deepEqual(promptPlaceholders('Summarize {topic} for {audience}, about {topic}'), ['topic', 'audience']);
  assert.equal(renderPrompt('Hi {name}, {other}', { name: 'Ann' }), 'Hi Ann, {other}');
});

test('prompts: saved per project, visible in sub-projects, nearest wins, soft-deleted', async () => {
  const env = await createEnv('prompt_library');
  try {
    await env.prisma.project.create({ data: { id: 'parent', name: 'Parent', userId: String(env.userId) } });
    await env.prisma.project.create({ data: { id: 'child', name: 'Child', userId: String(env.userId), parentId: 'parent' } });
    const run = (tool: any, args: any, projectId: string) =>
      tool.runAsync({ args, toolContext: { prisma: env.prisma, userId: env.userId, projectId, conversationId: env.conversationId } });

    await run(prompt_save, { name: 'summary', text: 'Summarize {topic}', title: 'Summary' }, 'parent');
    await run(prompt_save, { name: 'greet', text: 'Say hello' }, 'parent');
    // The child sees the parent's prompts; its own prompt of the same name wins
    await run(prompt_save, { name: 'greet', text: 'Say hello to the child team' }, 'child');
    const childList = await run(prompt_list, {}, 'child');
    assert.deepEqual(childList.prompts.map((p: any) => [p.name, p.projectId]), [['greet', 'child'], ['summary', 'parent']]);
    assert.deepEqual(childList.prompts[1].arguments, [{ name: 'topic', required: true }]);
    assert.deepEqual((await run(prompt_list, {}, 'parent')).prompts.map((p: any) => p.projectId), ['parent', 'parent']);

    assert.equal((await run(prompt_get, { name: 'greet' }, 'child')).text, 'Say hello to the child team');
    assert.equal((await run(prompt_get, { name: 'summary', arguments: { topic: 'roles' } }, 'child')).text, 'Summarize roles');
    await assert.rejects(run(prompt_get, { name: 'summary' }, 'child'), /needs: topic/);
    await assert.rejects(run(prompt_save, { name: '../x', text: 't' }, 'child'), /prompt name/);

    // Deleting the child's prompt shows the parent's again; the name can be saved again
    assert.equal((await run(prompt_delete, { name: 'greet' }, 'child')).deleted, true);
    assert.equal((await run(prompt_get, { name: 'greet' }, 'child')).text, 'Say hello');
    await run(prompt_save, { name: 'greet', text: 'Again' }, 'child');
    assert.equal((await run(prompt_get, { name: 'greet' }, 'child')).text, 'Again');
  } finally { await env.cleanup(); }
});
