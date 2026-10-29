/**
 * ---
 * id: ambient_reaction
 * name: ambient_reaction
 * description: Table talk as systems - the gate decides who chats, the cued seat finds the words
 * ---
 */
/**
 * Table talk as systems: speech, salient actions and showdowns go through the table-talk gate
 * (`poker_table_talk`, engine/tableTalk.ts). When it cues a seat, `speak_chatter` lets that seat's persona
 * say one line (or nothing). The line is a `Speech` one level deeper, so it can feed the gate again until
 * `MAX_DEPTH`; the gate, not the LLM, decides whether talk goes on.
 */
import {
  defineModule,
  defineSubroutine,
  ifElse,
  reduce,
  system,
  createContextProxy,
  CuratorBuilder,
  type CuratorModuleNode,
  type TypedPathProxy,
} from '../curator.ts';
import { pokerComposables } from '../composables/pokerComposables.ts';
import { state, gameState } from '../models/pokerContext.ts';
import {
  PokerEvent,
  PokerReducer,
  PokerSpeechAct,
  PokerSpeechOrigin,
  PokerTablePhase,
  PokerActionType,
} from '../models/pokerContracts.ts';
import {
  Speech, ActionTaken, PhaseSettle, NewRound, ChatterCue, ChatterDone, TablePhase,
} from '../models/pokerEvents.ts';
import { MAX_DEPTH, PokerChatterMode, TableTalkCommand, type TableTalkState } from '../engine/tableTalk.ts';

const { modules } = pokerComposables;

/** This flow's own copies: the gate step it ran and the line its seat came up with. */
const local: TypedPathProxy<{ talk: TableTalkState; chatter: { say?: string } }> = createContextProxy('$context');

/**
 * One gate step: the talk state is updated in `$state.talk` (and this flow's `$context.talk`); a cue it
 * produced is announced. Reading the cue from the flow's own copy keeps concurrent triggers apart.
 */
const talkStep = (command: Record<string, unknown>) => [
  reduce(PokerReducer.TABLE_TALK, { talk: String(state.talk), gameState: String(gameState), command }, 'talk', { spread: false }),
  ifElse(`${local.talk}.cue`, [CuratorBuilder.emitEvent(ChatterCue, String(local.talk.cue))]),
];

const speech = Speech.payload('speechEvt');
const action = ActionTaken.payload('actionEvt');
const settle = PhaseSettle.payload('settleEvt');
const round = NewRound.payload('roundEvt');
const done = ChatterDone.payload('doneEvt');
const cue = ChatterCue.payload('cue');

export const onTableSpeech = defineSubroutine('on_table_speech', talkStep({
  type: TableTalkCommand.SPEECH,
  speech: String(speech),
}), { params: { speechEvt: { type: 'object' } } });

export const onTableAction = defineSubroutine('on_table_action', talkStep({
  type: TableTalkCommand.ACTION,
  player: String(action.player),
  action: String(action.action),
  summary: String(action.summary),
}), { params: { actionEvt: { type: 'object' } } });

export const onTableSettle = defineSubroutine('on_table_settle', talkStep({
  type: TableTalkCommand.SETTLE,
  winnerSummary: String(settle.winnerSummary),
}), { params: { settleEvt: { type: 'object' } } });

export const onTalkNewHand = defineSubroutine('on_talk_new_hand', talkStep({
  type: TableTalkCommand.NEW_HAND,
  handNumber: String(round.handNumber),
}), { params: { roundEvt: { type: 'object' } } });

export const onChatterDone = defineSubroutine('on_chatter_done', talkStep({
  type: TableTalkCommand.DONE,
  cueId: String(done.cueId),
}), { params: { doneEvt: { type: 'object' } } });

export const CHATTER_OUTPUT_SCHEMA: Record<string, any> = {
  type: 'object',
  properties: {
    say: {
      type: 'string',
      description: 'One short in-character line (max ~20 words), or an empty string to stay silent.',
    },
  },
};

/** The cued seat's voice: a cheap model, one line, persona first. */
export const chatter_line = () => CuratorBuilder.agent({
  agentName: 'PokerTableTalk',
  as: 'chatter',
  model: 'gemini-2.5-flash-lite',
  provider: 'gemini',
  instruction: [
    `You are {${cue.speakerName}?} at a Texas Hold'em table. {${cue.instruction}?}`,
    'This is small talk between hands and bets, not a decision: never reveal your hole cards or announce an action.',
    'Say one short line in character (max ~20 words), or return an empty "say" when your persona would keep quiet.',
    'Modes:',
    `- ${PokerChatterMode.REPLY}: answer the line you were given, directly.`,
    `- ${PokerChatterMode.BANTER}: a quip, needle or reaction aimed at the table about what just happened.`,
    `- ${PokerChatterMode.MONOLOGUE}: mutter to yourself; address nobody.`,
  ].join('\n'),
  prompt: [
    `Mode: {${cue.mode}?}`,
    `What happened: {${cue.topic}?}`,
    `{${cue.replyToName}?} said: "{${cue.replyText}?}"`,
    'Your line:',
  ].join('\n'),
  history_from: 'conversation',
  history_events: [PokerEvent.ACTION_TAKEN, PokerEvent.SPEECH],
  output_schema: CHATTER_OUTPUT_SCHEMA,
});

/** The cue still holds the table (no newer cue took it over). */
const holdsTable = `!${state.talk}.open || ${state.talk}.open.cueId == ${cue.cueId}`;

/**
 * Speaks a cue: the seat says its line one level deeper in the thread (or stays silent), then releases
 * the table. A cue that lost the table to a concurrent one stays silent.
 */
export const speakChatter = defineSubroutine('speak_chatter', [
  ifElse(holdsTable, [
    chatter_line(),
    ifElse(`${local.chatter}.say && String(${local.chatter}.say).trim()`, [
      Speech.emit({
        speakerId: cue.speakerId,
        speakerName: cue.speakerName,
        text: local.chatter.say,
        speechAct: cue.speechAct,
        targetId: cue.targetId,
        depth: cue.depth,
        origin: PokerSpeechOrigin.CHATTER,
        threadId: cue.threadId,
        replyToId: cue.replyToId,
        cueId: cue.cueId,
      }),
    ]),
  ]),
  ChatterDone.emit({ cueId: cue.cueId }),
], { params: { cue: { type: 'object' } } });

const tableLive = `!${TablePhase.in(PokerTablePhase.PAUSED, PokerTablePhase.EXITED, PokerTablePhase.GAME_OVER)}`;
const answerable = `(${speech.depth} || 0) < ${MAX_DEPTH} && ${speech.speechAct} != '${PokerSpeechAct.MONOLOGUE}'`;
const salientAction = `['${PokerActionType.FOLD}', '${PokerActionType.ALL_IN}', '${PokerActionType.RAISE}', 'BET']`
  + `.includes(String((${action.action} && ${action.action}.type) || ${action.action}).toUpperCase())`;

export const ambientReactionAst: CuratorModuleNode = defineModule(modules.AMBIENT_REACTION, {
  description: 'Table talk: the gate decides who chats, the cued seat finds the words',
}, () => {
  system({ on: Speech, runIf: `${tableLive} && ${answerable}`, run: onTableSpeech, as: 'speechEvt' });
  system({ on: ActionTaken, runIf: `${tableLive} && ${salientAction}`, run: onTableAction, as: 'actionEvt' });
  system({ on: PhaseSettle, runIf: tableLive, run: onTableSettle, as: 'settleEvt' });
  system({ on: NewRound, run: onTalkNewHand, as: 'roundEvt' });
  system({ on: ChatterCue, runIf: tableLive, run: speakChatter, as: 'cue' });
  system({ on: ChatterDone, run: onChatterDone, as: 'doneEvt' });
  return undefined;
});
