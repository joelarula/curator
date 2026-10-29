import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  reduceTableTalk,
  resolveTalkConfig,
  TableTalkCommand,
  DEFAULT_TALK_CONFIG,
  type PokerTalkConfig,
  type TableTalkState,
  type TableTalkCommandInput,
} from '../src/engine/tableTalk.ts';
import { fileURLToPath } from 'node:url';
import { resolvePokerTalkConfig, resolvePokerConfig, DEFAULT_TABLE_SETTINGS, DEFAULT_SEAT_MODEL } from '../src/pokerConfig.ts';
import { loadPokerConfigFile } from '../src/env.ts';

const { maxDepth: MAX_DEPTH, handBudget: HAND_BUDGET, humanRepliesPerWindow: HUMAN_REPLIES_PER_WINDOW, lockTtl: LOCK_TTL } = DEFAULT_TALK_CONFIG;

const gameState: any = {
  tableId: 'talk_table',
  players: [
    { id: 'hero', name: 'You (Hero)', isHuman: true },
    { id: 'viper', name: 'Viper (Shark)', persona: 'shark' },
    { id: 'maddog', name: 'MadDog (Maniac)', persona: 'maniac' },
    { id: 'barnaby', name: 'Barnaby (Station)', persona: 'station' },
  ],
};

const step = (talk: TableTalkState | undefined, command: TableTalkCommandInput, config?: PokerTalkConfig) =>
  reduceTableTalk(talk, gameState, command, config);
const human = (text: string, extra: Record<string, unknown> = {}): TableTalkCommandInput =>
  ({ type: TableTalkCommand.SPEECH, speech: { speakerId: 'hero', speakerName: 'You', text, speechAct: 'TABLE_TALK', ...extra } });
const done = (talk: TableTalkState) => step(talk, { type: TableTalkCommand.DONE, cueId: talk.open?.cueId });

/** Plays a cue out as the worst-case LLM would: it always says something, then reports back. */
function speak(talk: TableTalkState): TableTalkState {
  const cue = talk.cue!;
  const said = step(talk, {
    type: TableTalkCommand.SPEECH,
    speech: {
      speakerId: cue.speakerId, speakerName: cue.speakerName, text: 'something', speechAct: cue.speechAct,
      depth: cue.depth, origin: 'chatter', threadId: cue.threadId, replyToId: cue.replyToId, cueId: cue.cueId, targetId: cue.targetId,
    },
  });
  return said.open ? done(said) : said;
}

test('table talk: an addressed seat answers a human, and the reply is one level deeper', () => {
  const talk = step(undefined, human('MadDog, you are bluffing again'));
  assert.equal(talk.cue?.speakerId, 'maddog');
  assert.equal(talk.cue?.mode, 'reply');
  assert.equal(talk.cue?.depth, 1);
  assert.equal(talk.cue?.replyToId, 'hero');
  assert.equal(talk.open?.cueId, talk.cue?.cueId);
});

test('table talk: a cue never goes past MAX_DEPTH, and lines at MAX_DEPTH are not answered', () => {
  const talk = step(undefined, {
    type: TableTalkCommand.SPEECH,
    speech: { speakerId: 'viper', speakerName: 'Viper', text: 'Barnaby, fold already', depth: MAX_DEPTH, origin: 'chatter' },
  });
  assert.equal(talk.cue, null);
});

test('table talk: monologues are never answered', () => {
  const talk = step(undefined, {
    type: TableTalkCommand.SPEECH,
    speech: { speakerId: 'viper', speakerName: 'Viper', text: 'MadDog, variance...', speechAct: 'MONOLOGUE', depth: 0, origin: 'turn' },
  });
  assert.equal(talk.cue, null);
});

test('table talk: one cue at a time; the open cue blocks others until released or expired', () => {
  let talk = step(undefined, human('MadDog, call me'));
  const first = talk.cue!;
  talk = step(talk, human('Barnaby, and you?'));
  assert.equal(talk.cue, null, 'blocked while a cue is open');
  assert.equal(talk.open?.cueId, first.cueId);

  talk = step(talk, { type: TableTalkCommand.DONE, cueId: first.cueId });
  assert.equal(talk.open, null);
  talk = step(talk, human('Barnaby, and you?'));
  assert.equal(talk.cue?.speakerId, 'barnaby');

  // A cue whose flow never reports back stops blocking after LOCK_TTL ticks
  let stuck = step(undefined, human('MadDog?'));
  for (let i = 0; i < LOCK_TTL; i++) stuck = step(stuck, { type: TableTalkCommand.ACTION, player: 'Viper (Shark)', action: { type: 'CHECK' } as any });
  stuck = step(stuck, human('Viper?'));
  assert.equal(stuck.cue?.speakerId, 'viper');
});

test('table talk: a seat never answers itself, and whispers are answered privately by their target only', () => {
  const self = step(undefined, {
    type: TableTalkCommand.SPEECH,
    speech: { speakerId: 'maddog', speakerName: 'MadDog', text: 'MadDog never folds!', depth: 0, origin: 'turn' },
  });
  assert.notEqual(self.cue?.speakerId, 'maddog');

  const whisper = step(undefined, human('psst, want to team up?', { speechAct: 'WHISPER', targetId: 'barnaby' }));
  assert.equal(whisper.cue?.speakerId, 'barnaby');
  assert.equal(whisper.cue?.speechAct, 'WHISPER');
  assert.equal(whisper.cue?.targetId, 'hero');
  // The private answer is not picked up by anyone else
  assert.equal(speak(whisper).cue, null);
});

test('table talk: human spam is rate-limited', () => {
  let talk: TableTalkState | undefined;
  let answered = 0;
  for (let i = 0; i < 10; i++) {
    talk = step(talk, human('MadDog! MadDog!'));
    if (talk.cue) {
      answered++;
      talk = done(talk);
    }
  }
  assert.equal(answered, HUMAN_REPLIES_PER_WINDOW);
});

test('table talk: settle and new hand - banter after a showdown, budget resets per hand', () => {
  let talk: TableTalkState = { ...step(undefined, { type: TableTalkCommand.NEW_HAND, handNumber: 1 }), handLines: HAND_BUDGET };
  talk = step(talk, { type: TableTalkCommand.SETTLE, winnerSummary: 'MadDog wins $900!' });
  assert.equal(talk.cue, null, 'over budget: no banter');
  talk = step(talk, { type: TableTalkCommand.NEW_HAND, handNumber: 2 });
  assert.equal(talk.handLines, 0);
  assert.equal(talk.hand, 2);
});

test('table talk: an adversarial flood stays bounded (chains never branch or exceed MAX_DEPTH, hands stay on budget)', () => {
  let talk: TableTalkState | undefined;
  let maxDepth = 0;
  let chatterLines = 0;
  const triggers: TableTalkCommandInput[] = [];
  for (let i = 0; i < 40; i++) {
    triggers.push(
      { type: TableTalkCommand.ACTION, player: 'MadDog (Maniac)', action: { type: 'ALL_IN' } as any, summary: 'MadDog shoves' },
      { type: TableTalkCommand.SPEECH, speech: { speakerId: 'viper', speakerName: 'Viper', text: 'Pot odds, people.', depth: 0, origin: 'turn' } },
      { type: TableTalkCommand.SETTLE, winnerSummary: 'Barnaby wins $400!' },
    );
  }
  for (const trigger of triggers) {
    talk = step(talk, trigger);
    // Play every chain out with an LLM that always talks
    let chain = 0;
    while (talk.cue) {
      chain++;
      maxDepth = Math.max(maxDepth, talk.cue.depth);
      chatterLines++;
      assert.ok(chain <= MAX_DEPTH, 'a trigger produces a chain of at most MAX_DEPTH lines');
      talk = speak(talk);
    }
  }
  assert.ok(maxDepth <= MAX_DEPTH);
  // 120 triggers in one hand, nobody addressed: the chatter is the hand's budget at most, but not silence
  assert.ok(chatterLines > 0, 'the table does talk');
  assert.ok(chatterLines <= HAND_BUDGET, `chatter within a hand stays on budget (${chatterLines})`);
});

test('table talk config: profiles, the config file and host options layer over the defaults', () => {
  const base = resolvePokerTalkConfig();
  assert.equal(base.seatChattiness.viper, 0.25, 'agent profiles bring their chattiness');
  assert.equal(base.maxDepth, DEFAULT_TALK_CONFIG.maxDepth);

  const resolved = resolvePokerTalkConfig(
    { talk: { handBudget: 8, personaChattiness: { shark: 0.9 } }, agents: { viper: { chattiness: 0.1 } } },
    { talk: { handBudget: 2 } },
  );
  assert.equal(resolved.handBudget, 2, 'later layers win');
  assert.equal(resolved.seatChattiness.viper, 0.1);
  assert.equal(resolved.seatChattiness.maddog, 0.7, 'untouched seats keep their profile value');
  assert.equal(resolved.personaChattiness.shark, 0.9);
  assert.equal(resolved.personaChattiness.maniac, DEFAULT_TALK_CONFIG.personaChattiness.maniac, 'maps merge key by key');
});

test('table talk config: maxDepth, enabled and seat chattiness change what the gate does', () => {
  // maxDepth 1: a human line is answered, the answer is not
  const shallow = resolveTalkConfig({ maxDepth: 1 });
  const answered = step(undefined, human('MadDog, you are bluffing'), shallow);
  assert.equal(answered.cue?.depth, 1);
  const said = step(answered, {
    type: TableTalkCommand.SPEECH,
    speech: { speakerId: 'maddog', speakerName: 'MadDog', text: 'Viper, back me up', depth: 1, origin: 'chatter', cueId: answered.cue!.cueId },
  }, shallow);
  assert.equal(said.cue, null);
  assert.equal(said.open, null, 'the spoken line still releases the table');

  assert.equal(step(undefined, human('MadDog?'), resolveTalkConfig({ enabled: false })).cue, null, 'disabled: nobody is cued');

  // A seat with chattiness 0 never joins unprompted, but still answers when addressed
  const mute = resolveTalkConfig({ seatChattiness: { viper: 0, maddog: 0, barnaby: 0 } });
  let talk: TableTalkState | undefined;
  for (let i = 0; i < 30; i++) {
    talk = step(talk, { type: TableTalkCommand.SETTLE, winnerSummary: 'someone wins' }, mute);
    assert.equal(talk.cue, null);
  }
  assert.equal(step(undefined, human('Viper, talk to me'), mute).cue?.speakerId, 'viper');
});

test('table talk config: poker.config.json is read from an explicit path', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-config-'));
  const file = path.join(dir, 'poker.config.json');
  fs.writeFileSync(file, JSON.stringify({ talk: { handBudget: 6 }, agents: { barnaby: { chattiness: 0.95 } } }));
  try {
    const talk = resolvePokerTalkConfig(loadPokerConfigFile(file));
    assert.equal(talk.handBudget, 6);
    assert.equal(talk.seatChattiness.barnaby, 0.95);
    fs.writeFileSync(file, '{ not json');
    assert.throws(() => loadPokerConfigFile(file), /Invalid config file/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('poker config: poker.config.yaml is read, and the shipped one equals the built-in defaults', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-config-'));
  const file = path.join(dir, 'poker.config.yaml');
  fs.writeFileSync(file, ['table:', '  startingChips: 500', 'rules:', '  maxTurnRejections: 0', 'models:', '  chatter: small-model', ''].join('\n'));
  try {
    const resolved = resolvePokerConfig(loadPokerConfigFile(file));
    assert.deepEqual(resolved.table, { ...DEFAULT_TABLE_SETTINGS, startingChips: 500 });
    assert.equal(resolved.rules.maxTurnRejections, 0, '0 is a value, not a missing one');
    assert.deepEqual(resolved.models, { seat: DEFAULT_SEAT_MODEL, chatter: 'small-model' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  const shipped = fileURLToPath(new URL('../poker.config.yaml', import.meta.url));
  assert.deepEqual(resolvePokerConfig(loadPokerConfigFile(shipped)), resolvePokerConfig(), 'poker.config.yaml documents the defaults');
});
