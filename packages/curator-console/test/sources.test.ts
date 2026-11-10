import test from 'node:test';
import assert from 'node:assert/strict';
import { ref } from 'vue';
import { createRunTimeline, applyProgressEvent } from '@curator/host/contracts';
import { useSources, toolSourcesOfRun, toolResultAt, surfaceForToolResult } from '../src/composables/useSources.ts';

const ev = (e: any) => ({ v: 1, ts: 1, conversationId: 5, ...e });

function runWithCalls() {
  const run = createRunTimeline({ rootRequestId: 10 });
  applyProgressEvent(run, ev({ kind: 'step.started', requestId: 10, nodeType: 'Curator_Agent', attempt: 1, label: 'Ask' }) as any);
  applyProgressEvent(run, ev({ kind: 'tool.started', requestId: 10, callId: 'a', toolName: 'lookup', label: 'Lookup' }) as any);
  applyProgressEvent(run, ev({ kind: 'tool.finished', requestId: 10, callId: 'a', toolName: 'lookup', status: 'COMPLETED', durationMs: 3 }) as any);
  applyProgressEvent(run, ev({ kind: 'tool.started', requestId: 10, callId: 'b', toolName: 'search', label: 'Search' }) as any);
  applyProgressEvent(run, ev({ kind: 'tool.finished', requestId: 10, callId: 'b', toolName: 'search', status: 'FAILED', durationMs: 1 }) as any);
  return run;
}

test('sources: tool calls of a run in order, with their outcome', () => {
  assert.deepEqual(
    toolSourcesOfRun(runWithCalls()).map((s) => [s.label, s.state, s.requestId, s.callIndex]),
    [['Lookup', 'COMPLETED', 10, 0], ['Search', 'FAILED', 10, 1]]
  );
  assert.deepEqual(toolSourcesOfRun(null), []);
});

test('sources: the n-th stored tool result of a request; JSON results open as JSON, others as text', () => {
  const responses = ['[Invoking lookup]', '[Tool Result: lookup]\n{"temp":3}', 'thinking', '[Tool Result: search]\nnot found'];
  assert.equal(toolResultAt(responses, 0), '{"temp":3}');
  assert.equal(toolResultAt(responses, 1), 'not found');
  assert.equal(toolResultAt(responses, 2), null);
  assert.deepEqual(surfaceForToolResult('Lookup', '{"temp":3}'), { component: 'json', title: 'Lookup', data: { temp: 3 } });
  assert.deepEqual(surfaceForToolResult('Search', 'not found'), { component: 'markdown', title: 'Search', data: 'not found' });
});

test('sources: opening a tool chip shows its stored result; a resource chip shows its text', async () => {
  const shown: any[] = [];
  const s = useSources({
    run: ref(runWithCalls()) as any,
    attached: ref([{ uri: 'doc:a', title: 'Doc A', excerpt: 'x' }]),
    loadResponses: async () => ['[Tool Result: lookup]\n{"temp":3}', '[Tool Result: search]\nnot found'],
    runTool: async () => ({ found: true, resource: { title: 'Doc A', texts: [{ content: 'Body' }] } }),
    show: (surface) => shown.push(surface),
  });
  assert.deepEqual(s.sources.value.map((x) => x.kind), ['tool', 'tool', 'resource']);
  await s.open(s.sources.value[1]);
  await s.open(s.sources.value[2]);
  assert.deepEqual(shown, [
    { component: 'markdown', title: 'Search', data: 'not found' },
    { component: 'markdown', title: 'Doc A', data: 'Body' },
  ]);
  assert.equal(s.error.value, null);
});
