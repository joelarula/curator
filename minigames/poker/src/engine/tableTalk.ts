/**
 * The table-talk gate: the single deterministic place that decides whether anyone chats
 * (`reduce('poker_table_talk', ...)`). Flows feed it what happened at the table (a line of speech, an
 * action, a showdown, a new hand) and it answers with at most one `cue`: which seat speaks, how, and at
 * which depth. The LLM only fills in the words (or stays silent); it never decides whether talk goes on.
 *
 * Why chatter cannot snowball:
 * - one trigger yields at most one cue, and a cue yields at most one line, so talk is a chain, never a tree;
 * - every reply is one level deeper and nothing is cued past `MAX_DEPTH`; monologues are never answered;
 * - one cue is open per table at a time, every hand has a line budget, seats cool down, and human lines
 *   are rate-limited.
 * No clock, no randomness: "chance" is a hash of the table, the tick and the seat, so replays are stable.
 */
import type { PlayerAction, PokerGameState, PlayerState, SpeechAct } from '../types.ts';
import { PokerActionType, PokerSpeechAct, PokerSpeechOrigin, type PokerSpeechOriginType } from '../models/pokerContracts.ts';

/** Deepest reply cued: human line (0) → answer (1) → one comeback (2), then the thread ends. */
export const MAX_DEPTH = 2;
/** Lines per hand (turn speech and chatter) after which only directly addressed seats are cued. */
export const HAND_BUDGET = 4;
/** Ticks a seat stays quiet after speaking, unless it is addressed directly. */
export const SEAT_COOLDOWN = 3;
/** Ticks after which an open cue whose flow never reported back is considered dead. */
export const LOCK_TTL = 6;
/** Human lines answered per `HUMAN_WINDOW` ticks; spam beyond that gets no answers. */
export const HUMAN_REPLIES_PER_WINDOW = 3;
export const HUMAN_WINDOW = 12;

/** How readily each persona joins the talk (0..1). */
export const PERSONA_CHATTINESS: Record<string, number> = {
  shark: 0.25,
  rock: 0.2,
  maniac: 0.7,
  station: 0.6,
  caller: 0.5,
  fish: 0.5,
  bluffer: 0.6,
};
const DEFAULT_CHATTINESS = 0.4;

/** How a cued seat speaks: answering someone, needling the table, or muttering to itself. */
export const PokerChatterMode = {
  REPLY: 'reply',
  BANTER: 'banter',
  MONOLOGUE: 'monologue',
} as const;

export type PokerChatterModeType = (typeof PokerChatterMode)[keyof typeof PokerChatterMode];

/** A line of speech as the gate reads it (the `poker:speech` payload). */
export interface TableTalkSpeech {
  speakerId?: string;
  speakerName?: string;
  text?: string;
  speechAct?: SpeechAct;
  targetId?: string;
  depth?: number;
  origin?: PokerSpeechOriginType;
  threadId?: string;
  replyToId?: string;
  cueId?: string;
}

export const TableTalkCommand = {
  SPEECH: 'speech',
  ACTION: 'action',
  SETTLE: 'settle',
  NEW_HAND: 'new_hand',
  /** The flow of an open cue finished (spoke or stayed silent): release the table. */
  DONE: 'done',
} as const;

export type TableTalkCommandInput =
  | { type: typeof TableTalkCommand.SPEECH; speech: TableTalkSpeech }
  | { type: typeof TableTalkCommand.ACTION; player?: string; action?: PlayerAction; summary?: string }
  | { type: typeof TableTalkCommand.SETTLE; winnerSummary?: string }
  | { type: typeof TableTalkCommand.NEW_HAND; handNumber?: number }
  | { type: typeof TableTalkCommand.DONE; cueId?: string };

/** What a cued seat is asked to say; the `poker:chatter_cue` payload. */
export interface TableTalkCue {
  cueId: string;
  speakerId: string;
  speakerName: string;
  mode: PokerChatterModeType;
  speechAct: SpeechAct;
  /** Depth of the line this cue produces. */
  depth: number;
  threadId: string;
  replyToId?: string;
  replyToName?: string;
  replyText?: string;
  /** Whom a whispered answer goes back to. */
  targetId?: string;
  /** What happened, in a few words, for the prompt. */
  topic: string;
}

/** The gate's memory, kept in `$state.talk`. */
export interface TableTalkState {
  /** Triggers seen so far: the gate's clock. */
  tick: number;
  hand: number;
  handLines: number;
  lastSpokeAt: Record<string, number>;
  humanTicks: number[];
  open: { cueId: string; tick: number } | null;
  /** The cue this step produced, if any. */
  cue: TableTalkCue | null;
}

export const initialTableTalk = (): TableTalkState => ({
  tick: 0, hand: 0, handLines: 0, lastSpokeAt: {}, humanTicks: [], open: null, cue: null,
});

/** FNV-1a: a stable 0..1 roll for `key`. */
function roll(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0x100000000;
}

const chattiness = (seat: PlayerState) => PERSONA_CHATTINESS[String(seat.persona)] ?? DEFAULT_CHATTINESS;
const shortName = (seat: PlayerState) => String(seat.name || seat.id).split(/[\s(]/)[0];
const mentions = (text: string, seat: PlayerState) => new RegExp(`\\b${shortName(seat)}\\b`, 'i').test(text);

interface Pick {
  speaker: PlayerState;
  mode: PokerChatterModeType;
  depth: number;
  topic: string;
  speechAct?: SpeechAct;
  thread?: TableTalkSpeech;
  fromHuman?: boolean;
}

/** Applies one trigger to the talk state; the returned state's `cue` says who speaks, if anyone. */
export function reduceTableTalk(
  rawTalk: Partial<TableTalkState> | null | undefined,
  gameState: Partial<PokerGameState> | null | undefined,
  command: TableTalkCommandInput,
): TableTalkState {
  const talk: TableTalkState = { ...initialTableTalk(), ...(rawTalk || {}), cue: null };
  talk.lastSpokeAt = { ...talk.lastSpokeAt };
  talk.humanTicks = [...talk.humanTicks];
  const seats: PlayerState[] = (gameState?.players || []) as PlayerState[];
  const agents = seats.filter((s) => !s.isHuman);
  const tableId = String(gameState?.tableId || 'table');

  if (command.type === TableTalkCommand.DONE) {
    if (talk.open?.cueId === command.cueId) talk.open = null;
    return talk;
  }
  if (command.type === TableTalkCommand.NEW_HAND) {
    talk.hand = Number(command.handNumber ?? talk.hand + 1);
    talk.handLines = 0;
    return talk;
  }

  talk.tick += 1;
  const tick = talk.tick;
  if (talk.open && tick - talk.open.tick > LOCK_TTL) talk.open = null;
  const cooled = (seat: PlayerState) => tick - (talk.lastSpokeAt[seat.id] ?? -Infinity) > SEAT_COOLDOWN;
  const overBudget = talk.handLines >= HAND_BUDGET;
  /** First seat, in a stable per-tick order, whose roll beats salience × chattiness. */
  const draw = (candidates: PlayerState[], salience: number, key: string) =>
    [...candidates]
      .sort((a, b) => roll(`${tableId}:${tick}:${key}:order:${a.id}`) - roll(`${tableId}:${tick}:${key}:order:${b.id}`))
      .find((s) => roll(`${tableId}:${tick}:${key}:${s.id}`) < salience * chattiness(s));

  let pick: Pick | undefined;

  if (command.type === TableTalkCommand.SPEECH) {
    const speech = command.speech || {};
    const speaker = seats.find((s) => s.id === speech.speakerId);
    const fromHuman = !speaker || !!speaker.isHuman;
    const origin = fromHuman ? PokerSpeechOrigin.HUMAN : (speech.origin || PokerSpeechOrigin.TURN);
    // People always start a thread; only the gate's own lines carry depth
    const depth = fromHuman ? 0 : Number(speech.depth ?? 0);

    if (speech.cueId && talk.open?.cueId === speech.cueId) talk.open = null;
    if (!fromHuman) {
      talk.lastSpokeAt[speaker!.id] = tick;
      if (origin === PokerSpeechOrigin.TURN) talk.handLines += 1;
    }

    const text = String(speech.text || '');
    const others = agents.filter((s) => s.id !== speaker?.id);
    const isWhisper = speech.speechAct === PokerSpeechAct.WHISPER;
    if (fromHuman) talk.humanTicks = talk.humanTicks.filter((t) => tick - t < HUMAN_WINDOW);
    const humanThrottled = fromHuman && talk.humanTicks.length >= HUMAN_REPLIES_PER_WINDOW;

    if (depth + 1 <= MAX_DEPTH && speech.speechAct !== PokerSpeechAct.MONOLOGUE && !humanThrottled) {
      const addressed = others.find((s) => s.id === speech.targetId) || (isWhisper ? undefined : others.find((s) => mentions(text, s)));
      const base = { mode: PokerChatterMode.REPLY, depth: depth + 1, thread: speech, fromHuman };
      if (isWhisper) {
        // A whisper is answered by its target alone, privately
        if (addressed) pick = { ...base, speaker: addressed, speechAct: PokerSpeechAct.WHISPER, topic: 'a private whisper' };
      } else if (addressed && (fromHuman || cooled(addressed))) {
        pick = { ...base, speaker: addressed, topic: 'you were addressed directly' };
      } else if (!overBudget) {
        if (depth >= 1) {
          // A reply to a reply: the one it answered may have the last word, else a third seat chimes in
          const original = others.find((s) => s.id === speech.replyToId && cooled(s));
          const third = others.filter((s) => s.id !== speech.replyToId && cooled(s));
          const speakerPick = original && roll(`${tableId}:${tick}:last:${original.id}`) < 0.5 * chattiness(original) + 0.2
            ? original
            : draw(third, 0.4, 'chime');
          if (speakerPick) pick = { ...base, speaker: speakerPick, topic: 'the table talk going on' };
        } else {
          const salience = fromHuman ? 0.8 : 0.35;
          const chosen = draw(others.filter(cooled), salience, 'reply');
          if (chosen) pick = { ...base, speaker: chosen, topic: fromHuman ? 'a player talking to the table' : 'table talk' };
        }
      }
    }
  } else if (command.type === TableTalkCommand.ACTION && !overBudget) {
    const type = String((command.action as any)?.type || command.action || '').toUpperCase();
    const actor = seats.find((s) => s.name === command.player || s.id === command.player);
    const summary = command.summary || `${command.player} ${type.toLowerCase()}s`;
    if (type === PokerActionType.FOLD) {
      if (actor && !actor.isHuman && cooled(actor) && roll(`${tableId}:${tick}:fold:${actor.id}`) < 0.3 * chattiness(actor)) {
        pick = { speaker: actor, mode: PokerChatterMode.MONOLOGUE, depth: MAX_DEPTH, speechAct: PokerSpeechAct.MONOLOGUE, topic: `you just folded (${summary})` };
      }
    } else {
      const salience = type === PokerActionType.ALL_IN ? 0.6 : (type === PokerActionType.RAISE || type === 'BET') ? 0.3 : 0;
      const chosen = salience > 0 ? draw(agents.filter((s) => s.id !== actor?.id && cooled(s)), salience, 'action') : undefined;
      if (chosen) pick = { speaker: chosen, mode: PokerChatterMode.BANTER, depth: 1, topic: summary };
    }
  } else if (command.type === TableTalkCommand.SETTLE && !overBudget) {
    const chosen = draw(agents.filter(cooled), 0.6, 'settle');
    if (chosen) pick = { speaker: chosen, mode: PokerChatterMode.BANTER, depth: 1, topic: command.winnerSummary || 'the hand was settled' };
  }

  if (!pick || talk.open) return talk;

  const thread = pick.thread;
  const cueId = `${tableId}:${tick}:${pick.speaker.id}`;
  talk.open = { cueId, tick };
  talk.handLines += 1;
  talk.lastSpokeAt[pick.speaker.id] = tick;
  if (pick.fromHuman) talk.humanTicks.push(tick);
  talk.cue = {
    cueId,
    speakerId: pick.speaker.id,
    speakerName: pick.speaker.name,
    mode: pick.mode,
    speechAct: pick.speechAct
      ?? (pick.mode === PokerChatterMode.BANTER ? PokerSpeechAct.BANTER : PokerSpeechAct.TABLE_TALK),
    depth: pick.depth,
    threadId: thread?.threadId || cueId,
    ...(thread?.speakerId ? { replyToId: thread.speakerId } : {}),
    ...(thread?.speakerName ? { replyToName: thread.speakerName } : {}),
    ...(thread?.text ? { replyText: thread.text } : {}),
    ...(pick.speechAct === PokerSpeechAct.WHISPER && thread?.speakerId ? { targetId: thread.speakerId } : {}),
    topic: pick.topic,
  };
  return talk;
}
