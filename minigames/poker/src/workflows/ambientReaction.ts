/**
 * ---
 * id: ambient_reaction
 * name: ambient_reaction
 * description: Table talk as systems - the gate decides who chats, the cued seat finds the words
 * ---
 */
/**
 * Table talk as systems: speech, salient actions and showdowns go through the table-talk gate
 * (`pokerTableTalkReducer`, engine/tableTalk.ts). When it cues a seat, `speak_chatter` lets that seat's persona
 * say one line (or nothing). The line is a `Speech` one level deeper, so it can feed the gate again until
 * `MAX_DEPTH`; the gate, not the LLM, decides whether talk goes on.
 */
import {
  defineModule,
  defineSubroutine,
  system,
  withFallback,
  createContextProxy,
  CuratorBuilder,
  type CuratorModuleNode,
  type TypedPathProxy,
} from '../curator.ts';
import { pokerComposables } from '../composables/pokerComposables.ts';
import { state, gameState, ifElse, setState } from '../models/pokerContext.ts';
import {
  PokerSpeechAct,
  PokerSpeechOrigin,
  PokerTablePhase,
  PokerActionType,
} from '../models/pokerContracts.ts';
import {
  Speech, ActionTaken, PhaseSettle, NewRound, ChatterCue, ChatterDone, TablePhase,
} from '../models/pokerEvents.ts';
import { DEFAULT_TALK_CONFIG, PokerChatterMode, TableTalkCommand, type TableTalkState } from '../engine/tableTalk.ts';
import { pokerTableTalkReducer } from '../plugins/pokerTools.ts';
import { SEAT_MODEL, SEAT_HISTORY_EVENTS, seatPersona, seatView } from './agentTurn.ts';

const MAX_DEPTH = DEFAULT_TALK_CONFIG.maxDepth;
const { modules } = pokerComposables;

/** This flow's own copies: the gate step it ran and the line its seat came up with. */
const local: TypedPathProxy<{ talk: TableTalkState; chatter: { say?: string } }> = createContextProxy('$context');

/**
 * One gate step: the talk state is updated in `$state.talk` (and this flow's `$context.talk`) via the
 * first-class `pokerTableTalkReducer` (Pillar 2); a cue it produced is announced.
 */
const talkStep = (command: Record<string, unknown>) => [
  pokerTableTalkReducer.reduce(
    { talk: state.talk, gameState, command: command as any },
    { as: 'talk', spread: false }
  ),
  ifElse(local.talk.cue.isTruthy(), [CuratorBuilder.emitEvent(ChatterCue, String(local.talk.cue))]),
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

/** How a seat talks between decisions; who it is, what it sees and remembers are the same as on its turn. */
export const POKER_CHATTER_PROTOCOL = [
  'This is table talk, not a decision: never reveal your hole cards and never announce an action.',
  'Let what you see and remember colour the line (a bad beat, a big pot, who has been pushing whom), in character.',
  'Say one short line (max ~20 words), or return an empty "say" when your persona would keep quiet.',
  'Modes:',
  `- ${PokerChatterMode.REPLY}: answer the line you were given, directly.`,
  `- ${PokerChatterMode.BANTER}: a quip, needle or reaction aimed at the table about what just happened.`,
  `- ${PokerChatterMode.MONOLOGUE}: mutter to yourself; address nobody.`,
].join('\n');

/**
 * The cued seat's voice (`$params.actor`: the seat, `$params.cue`: the cue): the same persona, view of the
 * table, memory of the hand and model as its turn decisions; only the task is a line instead of an action.
 */
export const chatter_line = () => CuratorBuilder.agent({
  agentName: 'PokerAgent',
  as: 'chatter',
  model: SEAT_MODEL,
  provider: 'gemini',
  instruction: [seatPersona(), POKER_CHATTER_PROTOCOL].join('\n\n'),
  prompt: [
    "Current Texas Hold'em Table State:",
    ...seatView(),
    `Mode: ${cue.mode.optional()}`,
    `What happened: ${cue.topic.optional()}`,
    `${cue.replyToName.optional()} said: "${cue.replyText.optional()}"`,
    'Your line:',
  ].join('\n'),
  history_from: 'conversation',
  history_events: SEAT_HISTORY_EVENTS,
  output_schema: CHATTER_OUTPUT_SCHEMA,
});

/**
 * The seat says its line for the cue, one level deeper in the thread, or stays silent.
 * Wrapped in `withFallback` (Pillar 4) so an LLM error never leaves `talk.open` locked.
 */
export const voiceSeat = defineSubroutine('voice_seat', {
  params: { actor: { type: 'object', required: true }, cue: { type: 'object', required: true } },
  body: [
    withFallback(chatter_line(), setState({ chatter: { say: '' } } as any)),
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
  ],
});

/** The cued seat, as it sits at the table now. */
const cuedSeat = `${gameState.players}.find((p) => p.id == ${cue.speakerId})`;
/** The cue still holds the table (no newer cue took it over) and its seat is still there. */
const holdsTable = `(!${state.talk}.open || ${state.talk}.open.cueId == ${cue.cueId}) && !!${cuedSeat}`;

/**
 * Speaks a cue through its seat, then releases the table. A cue that lost the table to a concurrent one,
 * or whose seat has left, stays silent.
 */
export const speakChatter = defineSubroutine('speak_chatter', [
  ifElse(holdsTable, [voiceSeat({ actor: cuedSeat, cue: String(cue) })]),
  ChatterDone.emit({ cueId: cue.cueId }),
], { params: { cue: { type: 'object' } } });

const tableLive = `!${TablePhase.in(PokerTablePhase.PAUSED, PokerTablePhase.EXITED, PokerTablePhase.GAME_OVER)}`;
const answerable = speech.depth.orDefault(0).lt(MAX_DEPTH).and(speech.speechAct.ne(PokerSpeechAct.MONOLOGUE));
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
