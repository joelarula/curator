import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import readline from 'node:readline';
import {
  createClientShell,
  promptAction,
  type ShellCommand,
  type ToolAction,
} from '../dist/index.js';

function createMockReadline(inputs: string[]) {
  const queue = [...inputs];
  const stream = new PassThrough();
  const output = new Writable({
    write(_chunk, _encoding, callback) {
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

  shell.registerCommand({
    name: 'raise',
    aliases: ['r', 'bet'],
    usage: '<amount>',
    description: 'Raise the current bet',
    parse: (args, tokens) => {
      const amt = parseInt(tokens[0] || args, 10);
      if (isNaN(amt) || amt <= 0) return null;
      return { tool: 'poker_apply_action', type: 'RAISE', amount: amt };
    },
  });

  const choices: ShellCommand<ToolAction>[] = [
    { id: 'call', label: 'Call $20', value: { tool: 'poker_apply_action', type: 'CALL', amount: 20 } },
    { id: 'fold', label: 'Fold', value: { tool: 'poker_apply_action', type: 'FOLD' } },
  ];

  const result = await shell.promptAction(rl, choices);
  assert.deepEqual(result, { tool: 'poker_apply_action', type: 'RAISE', amount: 150 });
  rl.close();
});

test('ClientShell: Choice with custom parameter parser resolves input (e.g. "bet 75")', async () => {
  const rl = createMockReadline(['bet 75']);

  const choices: ShellCommand<ToolAction>[] = [
    { id: 'call', label: 'Call', value: { tool: 'poker_apply_action', type: 'CALL' } },
    {
      id: 'raise',
      label: 'Raise',
      aliases: ['bet', 'r'],
      value: { tool: 'poker_apply_action', type: 'RAISE', amount: 40 },
      parse: (args, tokens) => {
        const amt = parseInt(tokens[0] || args, 10);
        return { tool: 'poker_apply_action', type: 'RAISE', amount: amt || 40 };
      },
    },
  ];

  const result = await promptAction(rl, choices);
  assert.deepEqual(result, { tool: 'poker_apply_action', type: 'RAISE', amount: 75 });
  rl.close();
});

test('ClientShell: Non-consuming /state executes without wasting turn', async () => {
  const rl = createMockReadline(['/state', 'call']);

  let stateInspected = false;
  const mockState = { pot: 100, street: 'flop' };

  const shell = createClientShell({
    actorName: 'Tester',
    getState: () => {
      stateInspected = true;
      return mockState;
    },
  });

  const choices: ShellCommand<ToolAction>[] = [
    { id: 'call', label: 'Call $20', value: { tool: 'poker_apply_action', type: 'CALL', amount: 20 } },
    { id: 'fold', label: 'Fold', value: { tool: 'poker_apply_action', type: 'FOLD' } },
  ];

  const result = await shell.promptAction(rl, choices);
  assert.equal(stateInspected, true);
  assert.deepEqual(result, { tool: 'poker_apply_action', type: 'CALL', amount: 20 });
  rl.close();
});
