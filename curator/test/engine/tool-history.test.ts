import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst, compileFixture } from '../helpers/harness.ts';
import { defineTool } from '../../src/tools/CuratorTool.ts';

// A tool used in an earlier turn is no longer offered in the current one. What does the model see?
test('history: an earlier tool call replays in a form the provider accepts, with the tool no longer offered', async () => {
  const env = await createEnv('tool_history');
  try {
    ((env.processor as any).engine.tools as Map<string, any>).set('fold', defineTool({
      name: 'fold', description: 'Fold', parameters: { type: 'object', properties: {} },
      execute: async () => JSON.stringify({ ok: true, action: 'fold' }),
    } as any));
    const llm = env.useLlm([{ toolCalls: [{ name: 'fold' }] }, 'Folded.', 'You folded.']);
    await runAst(env, await compileFixture('tool_history.coffee'));
    const last = llm.requests[llm.requests.length - 1];
    assert.equal(last.tools, undefined);
    // Earlier tool use is replayed as plain text, so there is no tool_use / tool message to orphan.
    for (const m of last.messages as any[]) {
      assert.notEqual(m.role, 'tool');
      assert.equal(m.toolCalls, undefined);
    }
    assert.ok(last.messages.some((m: any) => /\[Tool Result: fold\]/.test(m.content)));
  } finally { await env.cleanup(); }
});
