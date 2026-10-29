import test from 'node:test';
import assert from 'node:assert/strict';

import {
  reduceTableTalk,
  TableTalkCommand,
  MAX_DEPTH,
  HAND_BUDGET,
  HUMAN_REPLIES_PER_WINDOW,
  LOCK_TTL,
  type TableTalkState,
  type TableTalkCommandInput,
} from '../src/engine/tableTalk.ts';

const gameState: any = {
  tableId: 'talk_table',
  players: [
    { id: 'hero', name: 'You (Hero)', isHuman: true },
    { id: 'viper', name: 'Viper (Shark)', persona: 'shark' },
    { id: 'maddog', name: 'MadDog (Maniac)', persona: 'maniac' },
    { id: 'barnaby', name: 'Barnaby (Station)', persona: 'station' },
  ],
};

const step = (talk: TableTalkState | undefined, command: TableTalkCommandInput) => reduceTableTalk(talk, gameState, command);
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
