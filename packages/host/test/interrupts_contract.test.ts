import test from 'node:test';
import assert from 'node:assert/strict';
import { applyInterruptEvent, interruptInputMode, interruptOptions, interruptTitle } from '../dist/contracts/interrupts.js';
import { createClientShell } from '../dist/index.js';

const base = { v: 1, id: '7.1', requestId: 7, conversationId: 3, projectId: null } as any;
const ev = (e: any) => ({ v: 1, seq: 1, ts: 1, conversationId: 3, ...e });

test('input mode and options per interrupt kind', () => {
  const choice = { ...base, kind: 'human_input', prompt: 'Pick', payload: { choices: [{ id: 'a', label: 'Alpha' }, 'beta', { label: 'Gamma', value: { g: 1 } }] } };
  assert.equal(interruptInputMode(choice), 'choices');
  assert.deepEqual(interruptOptions(choice).map((o) => [o.label, o.value]), [['Alpha', 'a'], ['beta', 'beta'], ['Gamma', { g: 1 }]]);
  assert.equal(interruptTitle(choice), 'Pick');

  const approval = { ...base, kind: 'approval', payload: { tool: 'danger' } };
  assert.equal(interruptInputMode(approval), 'approval');
  assert.deepEqual(interruptOptions(approval).map((o) => o.value), [{ approved: true, scope: 'ONETIME' }, { approved: true, scope: 'CONVERSATION' }, { approved: false }]);
  assert.equal(interruptTitle(approval), "Approve tool 'danger'?");

  assert.equal(interruptInputMode({ ...base, kind: 'human_input', payload: { inputType: 'text', choices: [] } }), 'text');
  assert.equal(interruptInputMode({ ...base, kind: 'human_input', resumeSchema: { type: 'object' } }), 'json');
  assert.equal(interruptInputMode({ ...base, kind: 'event', payload: { eventNames: ['x'] } }), 'event');
});

test('applyInterruptEvent tracks wait.opened / wait.resumed and keeps identity when nothing changed', () => {
  const i = { ...base, kind: 'human_input' };
  let open = applyInterruptEvent([], ev({ kind: 'wait.opened', requestId: 7, interrupt: i }));
  assert.deepEqual(open.map((x) => x.id), ['7.1']);
  const same = applyInterruptEvent(open, ev({ kind: 'step.started', requestId: 8, nodeType: 'Curator_Tool', attempt: 1 }));
  assert.equal(same, open);
  assert.equal(applyInterruptEvent(open, ev({ kind: 'wait.resumed', requestId: 9, interruptId: '9.1', waitKind: 'human_input', outcome: 'resumed' })), open);
  open = applyInterruptEvent(open, ev({ kind: 'wait.resumed', requestId: 7, interruptId: '7.1', waitKind: 'human_input', outcome: 'resumed' }));
  assert.deepEqual(open, []);
});

test('CLI: an approval interrupt becomes choices that resume it; speech acts do not replace them', async () => {
  const calls: any[] = [];
  const shell = createClientShell({ onToolCall: async (name: string, args: any) => { calls.push([name, args]); return 'ok'; } } as any);
  const quiet = console.log; console.log = () => {};
  try {
    shell.ingestInterruptEvent(ev({ kind: 'wait.opened', requestId: 7, interrupt: { ...base, kind: 'approval', payload: { tool: 'danger' } } }));
    assert.deepEqual(shell.buildContext().activeChoices?.map((c: any) => c.label), ['Approve once', 'Approve for this conversation', 'Deny']);
    shell.ingestSpeechActs('<choose prompt="x"><option value="a" label="A">a</option></choose>', { print: false });
    assert.equal(shell.buildContext().activeChoices?.length, 3, 'interrupt choices stay');
    await shell.handleLine('3');
    assert.deepEqual(calls, [['conversation_resume', { interruptId: '7.1', value: { approved: false } }]]);
    shell.ingestInterruptEvent(ev({ kind: 'wait.resumed', requestId: 7, interruptId: '7.1', waitKind: 'approval', outcome: 'denied' }));
    shell.ingestSpeechActs('<choose prompt="x"><option value="a" label="A">a</option></choose>', { print: false });
    assert.equal(shell.buildContext().activeChoices?.length, 1, 'speech-act choices show again once answered');
  } finally {
    console.log = quiet;
  }
});

test('CLI: a text prompt interrupt takes the next line; commands still work', async () => {
  const calls: any[] = [];
  const shell = createClientShell({ onToolCall: async (name: string, args: any) => { calls.push([name, args]); return 'ok'; } } as any);
  const quiet = console.log; console.log = () => {};
  try {
    shell.ingestInterruptEvent(ev({ kind: 'wait.opened', requestId: 7, interrupt: { ...base, kind: 'human_input', prompt: 'Name?', payload: { inputType: 'text', choices: [] } } }));
    await shell.handleLine('Ada Lovelace');
    assert.deepEqual(calls, [['conversation_resume', { interruptId: '7.1', value: 'Ada Lovelace' }]]);
  } finally {
    console.log = quiet;
  }
});
