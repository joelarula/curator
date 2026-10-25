/**
 * Conversational Speech Acts & Interaction Pragmatics.
 * Defines out-of-turn conversational speech acts: table talk, banter, whispers,
 * backchannels, interjections, and psychological posture.
 */

export const AmbientSpeechAct = {
  TABLE_TALK: 'TABLE_TALK',
  BANTER: 'BANTER',
  GOSSIP: 'GOSSIP',
  SMALL_TALK: 'SMALL_TALK',
  SIDE_ACTIVITY: 'SIDE_ACTIVITY',
  WHISPER: 'WHISPER',
  SIDE_CHANNEL: 'SIDE_CHANNEL',
  INTERJECT: 'INTERJECT',
  PROVOKE: 'PROVOKE',
  LEAK_TELL: 'LEAK_TELL',
} as const;

export const TabletopSpeechAct = AmbientSpeechAct;
export type TabletopSpeechActType = (typeof TabletopSpeechAct)[keyof typeof TabletopSpeechAct];

export type AmbientSpeechActType = (typeof AmbientSpeechAct)[keyof typeof AmbientSpeechAct];

export interface AmbientSpeechActOptions {
  utterance?: string;
  as_role?: string;
  target_role?: string | string[];
  subject?: string;
  topic?: string;
  tone?: 'playful' | 'provocative' | 'solemn' | 'conspiratorial' | 'panicked' | 'stoic' | 'sarcastic' | 'idle' | 'friendly';
  epistemicImpact?: Record<string, any>;
  affinityDelta?: number;
  tiltDelta?: number;
  suspicionDelta?: number;
  temperature?: number;
  prompt?: string;
  agentName?: string;
  outOfTurn?: boolean;
}
