import test from 'node:test';
import assert from 'node:assert/strict';
import { useRunTimeline } from '../src/composables/useRunTimeline.ts';

// The fold itself (applyProgressEvent, summarizeRun) is tested in packages/host/test/run_timeline.test.ts.
let seq = 0;
const ev = (e: Record<string, any>) => ({ v: 1, seq: ++seq, ts: 1000 + seq, conversationId: 42, ...e }) as any;

test('useRunTimeline buffers events that arrive before begin() and snapshots an inactive copy', () => {
  let emit: (type: string, payload: any) => void = () => {};
  const timeline = useRunTimeline((cb) => {
    emit = cb;
    return () => {};
  });
  emit('curator:progress', ev({ kind: 'step.started', requestId: 20, nodeType: 'Curator_Agent', attempt: 1 }));
  emit('log', { message: 'ignored' });
  timeline.begin('20');
  assert.equal(timeline.current.value?.steps.length, 1);
  emit('curator:progress', ev({ kind: 'step.finished', requestId: 20, nodeType: 'Curator_Agent', status: 'COMPLETED', durationMs: 5 }));
  assert.equal(timeline.activeLine.value, 'Agent completed · 5 ms');

  const snap = timeline.snapshot();
  assert.equal(snap?.active, false);
  timeline.end();
  assert.equal(timeline.activeLine.value, null);
  timeline.reset();
  assert.equal(timeline.current.value, null);
});

test('a tool turn that finished before begin() is fully replayed from the buffer', () => {
  let emit: (type: string, payload: any) => void = () => {};
  const timeline = useRunTimeline((cb) => {
    emit = cb;
    return () => {};
  });
  emit('curator:progress', ev({ kind: 'step.started', requestId: 30, nodeType: 'Curator_Tool', attempt: 1 }));
  emit('curator:progress', ev({ kind: 'step.finished', requestId: 30, nodeType: 'Curator_Tool', status: 'COMPLETED', durationMs: 12 }));
  emit('curator:progress', ev({ kind: 'run.finished', requestId: 30, status: 'COMPLETED' }));
  const run = timeline.begin(30);
  assert.equal(run?.status, 'COMPLETED');
  assert.equal(run?.steps[0].label, 'Tool');
});
