/**
 * The table-talk gate: the single deterministic place that decides whether anyone chats
 * (`reduce('poker_table_talk', ...)`). Flows feed it what happened at the table (a line of speech, an
 * action, a showdown, a new hand) and it answers with at most one `cue`: which seat speaks, how, and at
 * which depth. The LLM only fills in the words (or stays silent); it never decides whether talk goes on.
 *
 * Why chatter cannot snowball:
 * - one trigger yields at most one cue, and a cue yields at most one line, so talk is a chain, never a tree;
 * - every reply is one level deeper and nothing is cued past `maxDepth`; monologues are never answered;
 * - one cue is open per table at a time, every hand has a line budget, seats cool down, and human lines
 *   are rate-limited.
 * No clock, no randomness: "chance" is a hash of the table, the tick and the seat, so replays are stable.
 */
import type { PlayerAction, PokerGameState, PlayerState, SpeechAct } from '../types.ts';
import { PokerActionType, PokerSpeechAct, PokerSpeechOrigin, type PokerSpeechOriginType } from '../models/pokerContracts.ts';

/**
 * How lively the table is, set at host setup (`createPokerHost({ talk })` or `poker.config.json`).
 * Ticks count the triggers the gate has seen (lines, salient actions, showdowns), not time.
 */
export interface PokerTalkConfig {
  /** Off: the gate still keeps its books but never cues anyone. */
  enabled: boolean;
  /** Deepest reply cued: human line (0) → answer (1) → one comeback (2), then the thread ends. */
  maxDepth: number;
  /** Lines per hand (turn speech and chatter) after which only directly addressed seats are cued. */
  handBudget: number;
  /** Ticks a seat stays quiet after speaking, unless it is addressed directly. */
  seatCooldown: number;
  /** Ticks after which an open cue whose flow never reported back is considered dead. */
  lockTtl: number;
  /** Human lines answered per `humanWindow` ticks; spam beyond that gets no answers. */
  humanRepliesPerWindow: number;
  humanWindow: number;
  /** How readily a seat joins the talk (0..1), by seat id; agent profiles' `chattiness` lands here. */
  seatChattiness: Record<string, number>;
  /** Fallback by persona for seats without their own value. */
  personaChattiness: Record<string, number>;
  defaultChattiness: number;
}

export const DEFAULT_TALK_CONFIG: PokerTalkConfig = {
  enabled: true,
  maxDepth: 2,
  handBudget: 4,
  seatCooldown: 3,
  lockTtl: 6,
  humanRepliesPerWindow: 3,
  humanWindow: 12,
  seatChattiness: {},
  personaChattiness: {
    shark: 0.25,
    rock: 0.2,
    maniac: 0.7,
    station: 0.6,
    caller: 0.5,
    fish: 0.5,
    bluffer: 0.6,
  },
  defaultChattiness: 0.4,
};

/** Defaults overlaid with the given layers (later wins; chattiness maps merge key by key). */
export function resolveTalkConfig(...layers: Array<Partial<PokerTalkConfig> | undefined>): PokerTalkConfig {
  return layers.reduce<PokerTalkConfig>((acc, layer) => (layer ? {
    ...acc,
    ...layer,
    seatChattiness: { ...acc.seatChattiness, ...layer.seatChattiness },
    personaChattiness: { ...acc.personaChattiness, ...layer.personaChattiness },
  } : acc), DEFAULT_TALK_CONFIG);
}

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
  config: PokerTalkConfig = DEFAULT_TALK_CONFIG,
): TableTalkState {
  const talk: TableTalkState = { ...initialTableTalk(), ...(rawTalk || {}), cue: null };
  talk.lastSpokeAt = { ...talk.lastSpokeAt };
  talk.humanTicks = [...talk.humanTicks];
  const seats: PlayerState[] = (gameState?.players || []) as PlayerState[];
  // Busted seats (dealt in folded with no chips) have left the game and stay silent; all-in seats still talk
  const agents = seats.filter((s) => !s.isHuman && !(s.folded && Number(s.chips) <= 0));
  const tableId = String(gameState?.tableId || 'table');
  const chattiness = (seat: PlayerState) =>
    config.seatChattiness[seat.id] ?? config.personaChattiness[String(seat.persona)] ?? config.defaultChattiness;

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
  if (talk.open && tick - talk.open.tick > config.lockTtl) talk.open = null;
  const cooled = (seat: PlayerState) => tick - (talk.lastSpokeAt[seat.id] ?? -Infinity) > config.seatCooldown;
  const overBudget = talk.handLines >= config.handBudget;
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
    if (fromHuman) talk.humanTicks = talk.humanTicks.filter((t) => tick - t < config.humanWindow);
    const humanThrottled = fromHuman && talk.humanTicks.length >= config.humanRepliesPerWindow;

    if (depth + 1 <= config.maxDepth && speech.speechAct !== PokerSpeechAct.MONOLOGUE && !humanThrottled) {
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
        pick = { speaker: actor, mode: PokerChatterMode.MONOLOGUE, depth: config.maxDepth, speechAct: PokerSpeechAct.MONOLOGUE, topic: `you just folded (${summary})` };
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

  if (!pick || talk.open || !config.enabled || config.maxDepth < 1) return talk;

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
