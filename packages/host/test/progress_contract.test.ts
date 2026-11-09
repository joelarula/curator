import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isProgressEventPayload,
  describeProgressEvent,
  formatProgressDuration,
  progressNodeLabel,
} from '../dist/contracts/progress.js';

const base = { v: 1, seq: 1, ts: 1, conversationId: 7 } as const;

test('isProgressEventPayload accepts v1 events of any kind and rejects others', () => {
  assert.equal(isProgressEventPayload({ ...base, kind: 'step.started', requestId: 1, nodeType: 'Curator_Agent', attempt: 1 }), true);
  assert.equal(isProgressEventPayload({ ...base, kind: 'some.future.kind' }), true);
  assert.equal(isProgressEventPayload({ ...base, v: 2, kind: 'step.started' }), false);
  assert.equal(isProgressEventPayload({ v: 1, kind: 'step.started' }), false);
  assert.equal(isProgressEventPayload(null), false);
});

test('describeProgressEvent produces one line per meaningful kind', () => {
  assert.equal(describeProgressEvent({ ...base, kind: 'step.started', requestId: 1, nodeType: 'Curator_Agent', attempt: 1 } as any), 'Agent started');
  assert.equal(describeProgressEvent({ ...base, kind: 'step.started', requestId: 1, nodeType: 'Curator_Agent', attempt: 2 } as any), 'Agent started (attempt 2)');
  assert.equal(
    describeProgressEvent({ ...base, kind: 'step.retrying', requestId: 1, attempt: 2, maxAttempts: 3, errorClass: 'rate_limit', delayMs: 1500, error: 'x' } as any),
    'Retrying 2/3 (rate_limit) in 1.5 s'
  );
  assert.equal(
    describeProgressEvent({ ...base, kind: 'wait.opened', requestId: 1, interrupt: { kind: 'human_input', prompt: 'Pick one' } } as any),
    'Waiting for input: Pick one'
  );
  assert.equal(describeProgressEvent({ ...base, kind: 'wait.resumed', requestId: 1, interruptId: '1.1', waitKind: 'approval', outcome: 'denied' } as any), 'Denied, continuing');
  assert.equal(describeProgressEvent({ ...base, kind: 'run.finished', requestId: 1, status: 'FAILED' } as any), 'Run failed');
  assert.equal(describeProgressEvent({ ...base, kind: 'state.changed', stateSeq: 1, scope: null, keys: [] } as any), null);
  assert.equal(describeProgressEvent({ ...base, kind: 'unknown.kind' } as any), null);
});

test('label and duration helpers', () => {
  assert.equal(progressNodeLabel('Curator_Tool'), 'Tool');
  assert.equal(progressNodeLabel('poker_deal'), 'poker_deal');
  assert.equal(progressNodeLabel(null), 'Step');
  assert.equal(formatProgressDuration(850), '850 ms');
  assert.equal(formatProgressDuration(1234), '1.2 s');
  assert.equal(formatProgressDuration(null), '');
});
