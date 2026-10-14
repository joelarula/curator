/**
 * Universal Game Phase Matrix
 * Formalizes gameplay across all tabletop, card, and social deduction games
 * into a universal state machine of acts and communicative turns.
 */

export type UniversalGamePhase =
  | 'INITIALIZATION'
  | 'ALLOCATION'
  | 'INTERACTION'
  | 'VERIFICATION'
  | 'SETTLEMENT';

export type PlayerAgencyType =
  | 'contractual'          // Binary / Contractual: Commit stake, make bid
  | 'passive_reception'    // Passive reception: Receive private / public state
  | 'strategic_choice'     // High strategic choice: Bet, Fold, Hit, Stand, Swap, Lead
  | 'revealing_truth'      // Revealing truth: Show cards, challenge claim
  | 'passive_accounting';  // Passive accounting: Award pot, tally points, rotate roles

export interface UniversalPhaseDefinition {
  readonly phaseNumber: 1 | 2 | 3 | 4 | 5;
  readonly phase: UniversalGamePhase;
  readonly fundamentalQuestion: string;
  readonly playerAgency: PlayerAgencyType;
  readonly playerAgencyLabel: string;
  readonly typicalCommunicativeTurns: string[];
  readonly coreAct: string;
  readonly canonicalSpeechActs: ('REQUEST' | 'PROPOSE' | 'INFORM' | 'ACCEPT' | 'REJECT' | 'ASSERT' | 'VOTE' | 'SYNTHESIZE')[];
  readonly subActions: string[];
}

export const UNIVERSAL_GAME_PHASE_MATRIX: Record<UniversalGamePhase, UniversalPhaseDefinition> = {
  INITIALIZATION: {
    phaseNumber: 1,
    phase: 'INITIALIZATION',
    fundamentalQuestion: 'Who is in, and at what cost?',
    playerAgency: 'contractual',
    playerAgencyLabel: 'Binary / Contractual',
    typicalCommunicativeTurns: ['Commit stake', 'Make bid', 'Post blinds', 'Declare intent'],
    coreAct: 'Committing stakes and entering the arena (Contract Formation)',
    canonicalSpeechActs: ['REQUEST', 'PROPOSE'],
    subActions: ['ante', 'post_blinds', 'bid', 'contract'],
  },
  ALLOCATION: {
    phaseNumber: 2,
    phase: 'ALLOCATION',
    fundamentalQuestion: 'What hand did fate deal?',
    playerAgency: 'passive_reception',
    playerAgencyLabel: 'Passive reception',
    typicalCommunicativeTurns: ['Receive private entitlement', 'Observe public commons', 'Turn up starter/trump card'],
    coreAct: 'Distributing incomplete information & partitioning hidden vs public state (State Inception)',
    canonicalSpeechActs: ['INFORM'],
    subActions: ['deal_private', 'deal_public', 'deal'],
  },
  INTERACTION: {
    phaseNumber: 3,
    phase: 'INTERACTION',
    fundamentalQuestion: 'How do I leverage, bluff, or optimize?',
    playerAgency: 'strategic_choice',
    playerAgencyLabel: 'High strategic choice',
    typicalCommunicativeTurns: [
      'Resource Acquisition / Discard: Drawing, discarding, hitting, swapping',
      'Valuation & Posturing: Betting, raising, checking, asserting claim',
      'Contestation & Response: Calling, folding, standing, challenging',
      'Execution & Capture: Leading card, following suit, capturing trick',
    ],
    coreAct: 'The Play Cycle: Managing entropy, asserting value, testing claims, and capturing tricks',
    canonicalSpeechActs: ['REQUEST', 'PROPOSE', 'ACCEPT', 'REJECT', 'ASSERT', 'VOTE', 'INFORM'],
    subActions: [
      'hit', 'draw', 'discard', 'swap',
      'wager', 'bet', 'raise', 'check', 'claim',
      'call', 'fold', 'stand', 'double_down', 'challenge',
      'lead', 'play_card', 'capture',
    ],
  },
  VERIFICATION: {
    phaseNumber: 4,
    phase: 'VERIFICATION',
    fundamentalQuestion: 'Whose assertion was valid?',
    playerAgency: 'revealing_truth',
    playerAgencyLabel: 'Revealing truth',
    typicalCommunicativeTurns: ['Table hands', 'Expose cards to public domain', 'Arbitrate claims against rules'],
    coreAct: 'Collapsing hidden state into truth and reconciling posturing against empirical proof (Showdown)',
    canonicalSpeechActs: ['SYNTHESIZE', 'INFORM'],
    subActions: ['showdown', 'reveal', 'adjudicate'],
  },
  SETTLEMENT: {
    phaseNumber: 5,
    phase: 'SETTLEMENT',
    fundamentalQuestion: 'Who owns the consequences?',
    playerAgency: 'passive_accounting',
    playerAgencyLabel: 'Passive accounting',
    typicalCommunicativeTurns: ['Award pot', 'Tally points/penalties', 'Elimination check', 'Rotate dealer button'],
    coreAct: 'Transfer of capital, recalculation of standings, and rotation of positional advantage (State Reset)',
    canonicalSpeechActs: ['INFORM'],
    subActions: ['settlement', 'payout', 'rotate_dealer'],
  },
};

/**
 * Returns metadata for a given phase name.
 */
export function getPhaseDefinition(phase: UniversalGamePhase): UniversalPhaseDefinition {
  return UNIVERSAL_GAME_PHASE_MATRIX[phase];
}

/**
 * Validates whether a phase transition is structurally valid within the game cycle.
 */
export function isValidPhaseTransition(current: UniversalGamePhase, next: UniversalGamePhase): boolean {
  const currentNum = UNIVERSAL_GAME_PHASE_MATRIX[current]?.phaseNumber;
  const nextNum = UNIVERSAL_GAME_PHASE_MATRIX[next]?.phaseNumber;

  if (!currentNum || !nextNum) return false;

  // Linear progression forward, or restart from settlement to initialization
  if (nextNum === currentNum + 1) return true;
  if (currentNum === 5 && nextNum === 1) return true;

  // Multi-street / trick interaction loops (e.g., Flop -> Wager -> Turn -> Wager, or multiple tricks)
  if (current === 'INTERACTION' && next === 'INTERACTION') return true;
  if (current === 'INTERACTION' && next === 'ALLOCATION') return true; // Community street deal

  return false;
}
