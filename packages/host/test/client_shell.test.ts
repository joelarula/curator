import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import readline from 'node:readline';
import {
  promptGroupChatAction,
  createClientShell,
  type ChatChoice,
  type GroupChatContext,
} from '../dist/index.js';

function createMockReadline(inputs: string[]) {
  const queue = [...inputs];
  const stream = new PassThrough();
  const output = new Writable({
    write(chunk, encoding, callback) {
      callback();
    },
  });

  const rl = readline.createInterface({ input: stream, output });
  const origQuestion = rl.question.bind(rl);
  (rl as any).question = (query: any, cb: any) => {
    const nextLine = queue.shift();
    if (nextLine !== undefined) {
      setImmediate(() => cb(nextLine));
    } else {
      origQuestion(query, cb);
    }
  };

  return rl;
}

test('ClientShell: Parameterized action command (raise <amount>) resolves turn action', async () => {
  const rl = createMockReadline(['raise 150']);
  const shell = createClientShell();

  shell.registerAction({
    name: 'raise',
    aliases: ['r', 'bet'],
    usage: '<amount>',
    description: 'Raise the current bet',
    parse: (args, tokens) => {
      const amt = parseInt(tokens[0] || args, 10);
      if (isNaN(amt) || amt <= 0) return null;
      return { type: 'RAISE', amount: amt };
    },
  });

  const choices: ChatChoice[] = [
    { id: 'call', label: 'Call $20', value: { type: 'CALL', amount: 20 } },
    { id: 'fold', label: 'Fold', value: { type: 'FOLD' } },
  ];

  const result = await shell.promptAction(rl, choices);
  assert.deepEqual(result, { type: 'RAISE', amount: 150 });
  rl.close();
});

test('ClientShell: Choice with custom parameter parser resolves input (e.g. "bet 75")', async () => {
  const rl = createMockReadline(['bet 75']);

  const choices: ChatChoice[] = [
    { id: 'call', label: 'Call', value: { type: 'CALL' } },
    {
      id: 'raise',
      label: 'Raise',
      aliases: ['bet', 'r'],
      value: { type: 'RAISE', amount: 40 },
      parse: (args, tokens) => {
        const amt = parseInt(tokens[0] || args, 10);
        return { type: 'RAISE', amount: amt || 40 };
      },
    },
  ];

  const ctx: GroupChatContext = {
    actorName: 'Player1',
    participants: [{ id: 'p1', name: 'Player1', isHuman: true }],
    onSpeech: async () => {},
  };

  const result = await promptGroupChatAction(rl, choices, ctx);
  assert.deepEqual(result, { type: 'RAISE', amount: 75 });
  rl.close();
});

test('ClientShell: Non-consuming /state and /eval execute without wasting turn', async () => {
  const rl = createMockReadline(['/state', '/eval state.pot * 2', 'call']);

  let stateInspected = false;
  const mockState = { pot: 100, street: 'flop' };

  const shell = createClientShell({
    actorName: 'Tester',
    getState: () => {
      stateInspected = true;
      return mockState;
    },
  });

  const choices: ChatChoice[] = [
    { id: 'call', label: 'Call $20', value: { type: 'CALL', amount: 20 } },
    { id: 'fold', label: 'Fold', value: { type: 'FOLD' } },
  ];

  const result = await shell.promptAction(rl, choices);
  assert.equal(stateInspected, true);
  assert.deepEqual(result, { type: 'CALL', amount: 20 });
  rl.close();
});
