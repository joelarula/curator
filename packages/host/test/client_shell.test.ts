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
  const dispatched: string[] = [];

  const shell = createClientShell({
    actorName: 'Tester',
    getState: () => {
      stateInspected = true;
      return mockState;
    },
    // A choice carrying a tool dispatches it (here without a host channel)
    onToolCall: async (toolName: string) => {
      dispatched.push(toolName);
      return { ok: true };
    },
  });

  const choices: ShellCommand<ToolAction>[] = [
    { id: 'call', label: 'Call $20', value: { tool: 'poker_apply_action', type: 'CALL', amount: 20 } },
    { id: 'fold', label: 'Fold', value: { tool: 'poker_apply_action', type: 'FOLD' } },
  ];

  const result = await shell.promptAction(rl, choices);
  assert.equal(stateInspected, true);
  assert.deepEqual(result, { tool: 'poker_apply_action', type: 'CALL', amount: 20 });
  assert.deepEqual(dispatched, ['poker_apply_action'], '/state did not consume the turn; the call did');
  rl.close();
});

test('ClientShell: Free text input routes to miniapp speech tool', async () => {
  let spokenText = '';
  const shell = createClientShell({
    actorName: 'Alice',
    defaultToolName: 'poker_human_speech',
    onSpeech: async (text) => {
      spokenText = text;
    },
  });

  await shell.handleLine('Nice hand, Bob! Good bluff.');
  assert.equal(spokenText, 'Nice hand, Bob! Good bluff.');
});

test('ClientShell: A bare number with no pending choices is not sent as speech', async () => {
  let spokenText: string | undefined;
  const shell = createClientShell({
    actorName: 'Alice',
    onSpeech: async (text) => {
      spokenText = text;
    },
  });

  await shell.handleLine('1');
  assert.equal(spokenText, undefined);
});

test('ClientShell: Asynchronous non-blocking turn choice execution via numeric or command input', async () => {
  let executedAction: any = null;
  const shell = createClientShell({
    actorName: 'Bob',
    onToolCall: async (tool, args) => {
      executedAction = { tool, ...args };
    },
  });

  shell.registerTool({
    name: 'poker_apply_action',
    description: 'Apply poker action',
    aliases: ['call', 'fold', 'raise'],
  });

  shell.setChoices([
    { id: 'call', label: 'Call $50', tool: 'poker_apply_action', args: { type: 'CALL', amount: 50 } },
    { id: 'fold', label: 'Fold', tool: 'poker_apply_action', args: { type: 'FOLD' } },
  ]);

  // Non-blocking numeric selection: '1'
  await shell.handleLine('1');
  assert.deepEqual(executedAction, { tool: 'poker_apply_action', type: 'CALL', amount: 50 });
});

test('ClientShell: Ingesting speech acts sets active choices from <choose> tags', async () => {
  const shell = createClientShell({ actorName: 'Alice' });
  const message = `
I reviewed your migration options.
<choose prompt="Choose target database">
  <option value="sqlite" label="SQLite Memory" />
  <option value="postgres" label="PostgreSQL Cluster" />
</choose>
`;

  const parsed = shell.ingestSpeechActs(message, { print: false });
  assert.equal(parsed.activeChoices.length, 2);
  const context = shell.buildContext();
  assert.equal(context.activeChoices?.length, 2);
  assert.equal(context.activeChoices?.[0].label, 'SQLite Memory');
  assert.equal(context.activeChoices?.[1].value, 'postgres');
});



test('ingestProgress returns the status line for progress events and ignores other payloads', () => {
  const shell = createClientShell({});
  const base = { v: 1, seq: 1, ts: 1, conversationId: 7 };
  assert.equal(
    shell.ingestProgress({ ...base, kind: 'step.finished', requestId: 3, nodeType: 'Curator_Tool', status: 'COMPLETED', durationMs: 1234 }, { print: false }),
    'Tool completed · 1.2 s'
  );
  assert.equal(shell.ingestProgress({ ...base, kind: 'state.changed', stateSeq: 1, scope: null, keys: [] }, { print: false }), null);
  assert.equal(shell.ingestProgress({ kind: 'step.started' }, { print: false }), null);
  assert.equal(shell.ingestProgress('not an event', { print: false }), null);
});
