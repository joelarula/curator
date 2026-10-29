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
 * the configured `maxDepth` (`$config.poker.talk`); the gate, not the LLM, decides whether talk goes on.
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
  PokerSpeechOrigin,
  PokerTablePhase,
  PokerActionType,
} from '../models/pokerContracts.ts';
import {
  Speech, ActionTaken, PhaseSettle, NewRound, ChatterCue, ChatterDone, TablePhase,
} from '../models/pokerEvents.ts';
import { PokerChatterMode, TableTalkCommand, type TableTalkState } from '../engine/tableTalk.ts';
import { pokerTableTalkReducer } from '../plugins/pokerTools.ts';
import { pokerConfig } from '../pokerConfig.ts';
import { CHATTER_MODEL, SEAT_HISTORY_EVENTS, seatPersona, seatView } from './agentTurn.ts';

const { modules } = pokerComposables;

/** This flow's own copies: the gate step it ran and the line its seat came up with. */
const local: TypedPathProxy<{ talk: TableTalkState; chatter: { say?: string } }> = createContextProxy('$context');

/**
 * One gate step: the talk state is updated in `$state.talk` (and this flow's `$context.talk`) via the
 * first-class `pokerTableTalkReducer` (Pillar 2); a cue it produced is announced.
 */
const talkStep = (command: Record<string, unknown>) => [
  pokerTableTalkReducer.reduce(
    // Null-safe `$config?.poker?.talk`: hosts and harnesses without poker config fall back to the gate's defaults
    { talk: state.talk, gameState, command: command as any, config: pokerConfig.talk },
    { as: 'talk', spread: false }
  ),
  ifElse(local.talk.cue.isTruthy(), [ChatterCue.emit(local.talk.cue)]),
];

const speech = Speech.payload('speechEvt');
const action = ActionTaken.payload('actionEvt');
const settle = PhaseSettle.payload('settleEvt');
const round = NewRound.payload('roundEvt');
const done = ChatterDone.payload('doneEvt');
const cue = ChatterCue.payload('cue');

export const onTableSpeech = defineSubroutine('on_table_speech', talkStep({
  type: TableTalkCommand.SPEECH,
  speech,
}), { params: { speechEvt: { type: 'object' } } });

export const onTableAction = defineSubroutine('on_table_action', talkStep({
  type: TableTalkCommand.ACTION,
  player: action.player,
  action: action.action,
  summary: action.summary,
}), { params: { actionEvt: { type: 'object' } } });

export const onTableSettle = defineSubroutine('on_table_settle', talkStep({
  type: TableTalkCommand.SETTLE,
  winnerSummary: settle.winnerSummary,
}), { params: { settleEvt: { type: 'object' } } });

export const onTalkNewHand = defineSubroutine('on_talk_new_hand', talkStep({
  type: TableTalkCommand.NEW_HAND,
  handNumber: round.handNumber,
}), { params: { roundEvt: { type: 'object' } } });

export const onChatterDone = defineSubroutine('on_chatter_done', talkStep({
  type: TableTalkCommand.DONE,
  cueId: done.cueId,
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
  model: CHATTER_MODEL,
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
    ifElse(local.chatter.say.nonEmpty(), [
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
const cuedSeat = gameState.players.find((p) => p.id.eq(cue.speakerId));
/** The cue still holds the table (no newer cue took it over) and its seat is still there. */
const holdsTable = state.talk.open.not().or(state.talk.open.cueId.eq(cue.cueId)).and(cuedSeat.isTruthy());

/**
 * Speaks a cue through its seat, then releases the table. A cue that lost the table to a concurrent one,
 * or whose seat has left, stays silent.
 */
export const speakChatter = defineSubroutine('speak_chatter', [
  ifElse(holdsTable, [voiceSeat({ actor: cuedSeat, cue })]),
  ChatterDone.emit({ cueId: cue.cueId }),
], { params: { cue: { type: 'object' } } });

const tableLive = TablePhase.notIn(PokerTablePhase.PAUSED, PokerTablePhase.EXITED, PokerTablePhase.GAME_OVER);
const salientAction = action.action.type
  .orDefault(action.action)
  .upper()
  .in(PokerActionType.FOLD, PokerActionType.ALL_IN, PokerActionType.RAISE, 'BET');

export const ambientReactionAst: CuratorModuleNode = defineModule(modules.AMBIENT_REACTION, {
  description: 'Table talk: the gate decides who chats, the cued seat finds the words',
}, () => {
  // Every line goes through the gate: it alone applies the configured depth, budget and locks
  system({ on: Speech, runIf: tableLive, run: onTableSpeech, as: 'speechEvt' });
  system({ on: ActionTaken, runIf: tableLive.and(salientAction), run: onTableAction, as: 'actionEvt' });
  system({ on: PhaseSettle, runIf: tableLive, run: onTableSettle, as: 'settleEvt' });
  system({ on: NewRound, run: onTalkNewHand, as: 'roundEvt' });
  system({ on: ChatterCue, runIf: tableLive, run: speakChatter, as: 'cue' });
  system({ on: ChatterDone, run: onChatterDone, as: 'doneEvt' });
  return undefined;
});
