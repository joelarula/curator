import test from 'node:test';
import assert from 'node:assert/strict';
import { useChoices } from '../src/composables/useChoices.ts';
import { useInterrupts } from '../src/composables/useInterrupts.ts';

const ev = (e: any) => ({ v: 1, seq: 1, ts: 1, conversationId: 3, ...e });
const interrupt = (id: string, extra: any = {}) => ({ v: 1, id, requestId: Number(id.split('.')[0]), conversationId: 3, projectId: null, kind: 'human_input', ...extra });

test('useChoices: an interrupt wins; speech and workflow choices show only without one', () => {
  const c = useChoices();
  assert.equal(c.setChoices('speech', [{ label: 'A', value: 'a' }], { prompt: 'speech' }), true);
  assert.equal(c.source.value, 'speech');
  assert.equal(c.setChoices('interrupt', [{ label: 'Yes', value: 'option_0' }], { interruptId: '7.1', resumeValues: new Map([['option_0', { ok: true }]]) }), true);
  assert.equal(c.setChoices('speech', [{ label: 'B', value: 'b' }]), false);
  assert.equal(c.setChoices('workflow', [{ label: 'W', value: 'w' }]), false);
  assert.deepEqual(c.availableChoices.value.map((i) => i.label), ['Yes']);
  assert.equal(c.selectedRadioChoice.value, 'option_0');
  assert.deepEqual(c.resumeValueFor('option_0'), { ok: true });
  c.clearChoices('speech');
  assert.equal(c.source.value, 'interrupt', 'clearing another source leaves the interrupt');
  c.clearChoices('interrupt');
  assert.equal(c.source.value, null);
  assert.equal(c.setChoices('speech', [{ label: 'B', value: 'b' }]), true);
});

test('useInterrupts: follows wait events, hydrates, resumes through conversation_resume', async () => {
  let emit: (type: string, payload: any) => void = () => {};
  const calls: any[] = [];
  const runTool = async (name: string, args: any) => {
    calls.push([name, args]);
    if (name === 'conversation_interrupts') return { interrupts: [interrupt('5.1', { kind: 'approval', payload: { tool: 'x' } })] };
    if (args.interruptId === 'bad.1') throw new Error('Invalid resume value');
    return { resumed: true };
  };
  const i = useInterrupts((cb) => { emit = cb; return () => {}; }, runTool);

  await i.hydrate(3);
  assert.deepEqual(calls[0], ['conversation_interrupts', { conversationId: 3 }]);
  assert.deepEqual(i.cardInterrupts.value.map((x) => x.id), ['5.1']);

  emit('curator:progress', ev({ kind: 'wait.opened', requestId: 7, interrupt: interrupt('7.1', { payload: { choices: ['a', 'b'] } }) }));
  assert.equal(i.choiceInterrupt.value?.id, '7.1');
  emit('curator:progress', ev({ kind: 'wait.resumed', requestId: 7, interruptId: '7.1', waitKind: 'human_input', outcome: 'resumed' }));
  assert.equal(i.choiceInterrupt.value, null);

  assert.equal(await i.resume('5.1', { approved: true }), true);
  assert.deepEqual(calls.at(-1), ['conversation_resume', { interruptId: '5.1', value: { approved: true } }]);
  assert.deepEqual(i.open.value, []);

  assert.equal(await i.resume('bad.1', 'x'), false);
  assert.equal(i.failedId.value, 'bad.1');
  assert.match(String(i.error.value), /Invalid resume value/);
});
