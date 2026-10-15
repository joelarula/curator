import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import readline from 'node:readline';
import {
  promptGroupChatAction,
  promptGroupChatIntermission,
  printChatHelp,
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

test('GroupChatPrompt: Selects numerical choice directly', async () => {
  const rl = createMockReadline(['2']);
  const choices: ChatChoice[] = [
    { id: 'c1', label: 'Check', value: { type: 'CHECK' } },
    { id: 'c2', label: 'Call $20', value: { type: 'CALL', amount: 20 } },
    { id: 'c3', label: 'Fold', value: { type: 'FOLD' } },
  ];

  const ctx: GroupChatContext = {
    actorName: 'Hero',
    participants: [{ id: 'hero', name: 'Hero', isHuman: true }],
    onSpeech: async () => {},
  };

  const selected = await promptGroupChatAction(rl, choices, ctx);
  assert.deepEqual(selected, { type: 'CALL', amount: 20 });
  rl.close();
});

test('GroupChatPrompt: Selects choice by label name (e.g. "fold")', async () => {
  const rl = createMockReadline(['fold']);
  const choices: ChatChoice[] = [
    { id: 'c1', label: 'Check', value: { type: 'CHECK' } },
    { id: 'c2', label: 'Call $20', value: { type: 'CALL', amount: 20 } },
    { id: 'c3', label: 'Fold', value: { type: 'FOLD' } },
  ];

  const ctx: GroupChatContext = {
    actorName: 'Hero',
    participants: [{ id: 'hero', name: 'Hero', isHuman: true }],
    onSpeech: async () => {},
  };

  const selected = await promptGroupChatAction(rl, choices, ctx);
  assert.deepEqual(selected, { type: 'FOLD' });
  rl.close();
});

test('GroupChatPrompt: Dispatches free-form chat speech to room then accepts action (default TABLE_TALK)', async () => {
  const speechEvents: any[] = [];
  const rl = createMockReadline(['I see you staring, Viper', '1']);
  const choices: ChatChoice[] = [
    { id: 'c1', label: 'Check', value: { type: 'CHECK' } },
    { id: 'c2', label: 'Bet $40', value: { type: 'RAISE', amount: 40 } },
  ];

  const ctx: GroupChatContext = {
    actorName: 'Hero',
    participants: [
      { id: 'hero', name: 'Hero', isHuman: true },
      { id: 'viper', name: 'Viper' },
    ],
    onSpeech: async (text, speechAct) => {
      speechEvents.push({ text, speechAct });
      return { aiReply: 'Keep talking, Kid.' };
    },
  };

  const selected = await promptGroupChatAction(rl, choices, ctx);
  assert.deepEqual(selected, { type: 'CHECK' });
  assert.equal(speechEvents.length, 1);
  assert.equal(speechEvents[0].text, 'I see you staring, Viper');
  assert.equal(speechEvents[0].speechAct, 'TABLE_TALK');
  rl.close();
});

test('GroupChatPrompt: Uses conversation-mandated defaultSpeechAct (e.g. INFORM)', async () => {
  const speechEvents: any[] = [];
  const rl = createMockReadline(['Reporting status from reactor sector 4', '1']);
  const choices: ChatChoice[] = [
    { id: 'c1', label: 'Acknowledge', value: { type: 'ACK' } },
  ];

  const ctx: GroupChatContext = {
    actorName: 'Engineer',
    defaultSpeechAct: 'INFORM',
    participants: [
      { id: 'eng', name: 'Engineer', isHuman: true },
      { id: 'ctrl', name: 'Central Control' },
    ],
    onSpeech: async (text, speechAct) => {
      speechEvents.push({ text, speechAct });
    },
  };

  const selected = await promptGroupChatAction(rl, choices, ctx);
  assert.deepEqual(selected, { type: 'ACK' });
  assert.equal(speechEvents.length, 1);
  assert.equal(speechEvents[0].text, 'Reporting status from reactor sector 4');
  assert.equal(speechEvents[0].speechAct, 'INFORM');
  rl.close();
});

test('GroupChatPrompt: Dispatches conversation-provided available verbs and custom handlers', async () => {
  const speechEvents: any[] = [];
  let vetoHandled = false;
  const rl = createMockReadline([
    '/prop We should redeploy service mesh',
    '/veto consensus_override',
    '1',
  ]);
  const choices: ChatChoice[] = [
    { id: 'c1', label: 'Proceed', value: { type: 'PROCEED' } },
  ];

  const ctx: GroupChatContext = {
    actorName: 'Alice',
    participants: [{ id: 'alice', name: 'Alice', isHuman: true }],
    availableVerbs: [
      {
        name: 'propose',
        aliases: ['prop'],
        description: 'Propose an action to the council',
        speechAct: 'PROPOSE',
      },
      {
        name: 'veto',
        description: 'Exercise executive veto',
        handler: async (args) => {
          assert.equal(args, 'consensus_override');
          vetoHandled = true;
          return { aiReply: 'Veto recorded' };
        },
      },
    ],
    onSpeech: async (text, speechAct) => {
      speechEvents.push({ text, speechAct });
    },
  };

  const selected = await promptGroupChatAction(rl, choices, ctx);
  assert.deepEqual(selected, { type: 'PROCEED' });
  assert.equal(speechEvents.length, 1);
  assert.equal(speechEvents[0].speechAct, 'PROPOSE');
  assert.equal(speechEvents[0].text, 'We should redeploy service mesh');
  assert.equal(vetoHandled, true);
  rl.close();
});

test('GroupChatPrompt: Invokes conversation-provided tools via /tool', async () => {
  const executedTools: any[] = [];
  const rl = createMockReadline([
    '/tool transfer_credits {"target":"bob","amount":500}',
    '1',
  ]);
  const choices: ChatChoice[] = [{ id: 'c1', label: 'Done', value: 'DONE' }];

  const ctx: GroupChatContext = {
    actorName: 'Trader',
    participants: [{ id: 'trader', name: 'Trader', isHuman: true }],
    availableTools: [
      {
        name: 'transfer_credits',
        description: 'Transfer credits to a recipient',
        execute: async (args) => {
          executedTools.push(args);
          return { status: 'success', balance: 1500 };
        },
      },
    ],
    onSpeech: async () => {},
  };

  const res = await promptGroupChatAction(rl, choices, ctx);
  assert.equal(res, 'DONE');
  assert.equal(executedTools.length, 1);
  assert.deepEqual(executedTools[0], { target: 'bob', amount: 500 });
  rl.close();
});

test('GroupChatPrompt: Intermission continues on Enter and quits on /quit', async () => {
  const rl1 = createMockReadline(['']);
  const ctx: GroupChatContext = {
    actorName: 'Hero',
    participants: [{ id: 'hero', name: 'Hero', isHuman: true }],
    onSpeech: async () => {},
  };

  const res1 = await promptGroupChatIntermission(rl1, ctx);
  assert.equal(res1, 'CONTINUE');
  rl1.close();

  const rl2 = createMockReadline(['/quit']);
  const res2 = await promptGroupChatIntermission(rl2, ctx);
  assert.equal(res2, 'QUIT');
  rl2.close();
});
