/**
 * Universal Interaction Order & Game Phase Matrix
 * Unifies games, speech acts, rituals, political theater, and everyday habits
 * across Linguistic Pragmatics, Goffman's Frame Analysis, Game Theory, and Ethnomethodology.
 */

// ============================================================================
// 1. Unified Interaction Primitives (6 Foundational Primitives)
// ============================================================================

export type UniversalInteractionPrimitive =
  | 'FRAME_BOUNDARY'          // 1. Frame & Boundary (The Container)
  | 'POSTURING_ASSERTION'     // 2. Posturing & Assertion (Claiming Reality)
  | 'YIELDING_CONTESTATION'   // 3. Yielding & Contestation (Managing Collision)
  | 'VERIFICATION_REVELATION' // 4. Verification & Revelation (Collapsing Entropy)
  | 'SETTLEMENT_ACCOUNTING'   // 5. Settlement & Accounting (State Rebalance)
  | 'META_ACTS';              // 6. Meta-Acts (Rules of the Rule-Set)

export interface InteractionAnalogRecord {
  cardGame: string;
  speechActConversation: string;
  ritualHabit: string;
  politicalTheaterCourtroom: string;
}

export interface UniversalInteractionDefinition {
  readonly primitiveNumber: 1 | 2 | 3 | 4 | 5 | 6;
  readonly primitive: UniversalInteractionPrimitive;
  readonly name: string;
  readonly theoreticalRoots: string[];
  readonly fundamentalQuestion: string;
  readonly playerAgency: string;
  readonly playerAgencyLabel: string;
  readonly coreAct: string;
  readonly canonicalSpeechActs: ('REQUEST' | 'PROPOSE' | 'INFORM' | 'ACCEPT' | 'REJECT' | 'ASSERT' | 'VOTE' | 'SYNTHESIZE')[];
  readonly subActions: string[];
  readonly analogs: Record<string, InteractionAnalogRecord>;
}

export const UNIVERSAL_INTERACTION_MATRIX: Record<UniversalInteractionPrimitive, UniversalInteractionDefinition> = {
  FRAME_BOUNDARY: {
    primitiveNumber: 1,
    primitive: 'FRAME_BOUNDARY',
    name: 'Frame & Boundary (The Container)',
    theoreticalRoots: [
      "Erving Goffman: Frame Analysis & The Interaction Order",
      "Johan Huizinga: Homo Ludens (The Magic Circle)",
      "J.L. Austin & John Searle: Felicity Conditions for Performatives",
      "Game Theory: Rules of the Arena & Information Partitioning",
    ],
    fundamentalQuestion: 'What reality is currently being enacted, under what rules, and what collateral legitimized entry?',
    playerAgency: 'framing_contractual',
    playerAgencyLabel: 'Framing & Collateral Buy-In',
    coreAct: 'Isolating the temporal and spatial boundary from "real life", establishing stance, and committing stakes.',
    canonicalSpeechActs: ['REQUEST', 'INFORM', 'PROPOSE'],
    subActions: ['bracket', 'magic_circle', 'stance', 'frame_alignment', 'stake', 'buy_in', 'ante'],
    analogs: {
      bracket: {
        cardGame: 'Shuffling & dealing',
        speechActConversation: 'Clearing throat, "Can we talk?"',
        ritualHabit: 'Crossing threshold, ringing a bell',
        politicalTheaterCourtroom: 'Gavel strike, "All rise for the court"',
      },
      stance: {
        cardGame: 'Casual vs tournament stance',
        speechActConversation: 'Playful banter vs solemn confession',
        ritualHabit: 'Adopting reverent posture, kneeling',
        politicalTheaterCourtroom: 'Entering formal plea, swearing oath',
      },
      stake: {
        cardGame: 'Posting blinds / ante',
        speechActConversation: 'Personal vulnerability, putting credibility on the line',
        ritualHabit: 'Personal submission, sacrifice, vow',
        politicalTheaterCourtroom: 'Posting bail, committing political capital',
      },
    },
  },

  POSTURING_ASSERTION: {
    primitiveNumber: 2,
    primitive: 'POSTURING_ASSERTION',
    name: 'Posturing & Assertion (Claiming Reality)',
    theoreticalRoots: [
      "Linguistic Pragmatics: Illocutionary Force & Assertives",
      "Michael Spence: Costly Signaling Theory",
      "Erving Goffman: Frontstage Performance & The Presentation of Self",
      "Game Theory: Bluffing, Strategic Revelation, and Strategic Moves",
    ],
    fundamentalQuestion: 'How does an actor project intent, modify state, and test boundaries?',
    playerAgency: 'strategic_assertion',
    playerAgencyLabel: 'Strategic Assertion & Signaling',
    coreAct: 'Projecting intent, claiming reality through costly signaling or bluffs, and escalating conversational friction.',
    canonicalSpeechActs: ['PROPOSE', 'ASSERT'],
    subActions: ['bid', 'gambit', 'posture', 'signal', 'raise', 'escalate', 'wager', 'claim', 'lead', 'play_card'],
    analogs: {
      bid: {
        cardGame: 'Placing a lead card, bidding trump',
        speechActConversation: 'Asking a leading question, proposing agenda',
        ritualHabit: 'Offering an opening prayer / greeting',
        politicalTheaterCourtroom: 'Filing opening motion, introducing legislation',
      },
      posture: {
        cardGame: 'Bluffing a big bet',
        speechActConversation: 'Tone of authority, flexing expertise',
        ritualHabit: 'Bowing head, adopting austere silence',
        politicalTheaterCourtroom: 'Press briefing, partisan filibuster, grandstanding',
      },
      raise: {
        cardGame: 'Raising the pot 3x',
        speechActConversation: 'Increasing tension, pressing an argument',
        ritualHabit: 'Accelerating liturgy, intensifying drumbeat',
        politicalTheaterCourtroom: 'Raising the stakes, issuing an ultimatum',
      },
    },
  },

  YIELDING_CONTESTATION: {
    primitiveNumber: 3,
    primitive: 'YIELDING_CONTESTATION',
    name: 'Yielding & Contestation (Managing Collision)',
    theoreticalRoots: [
      "Ethnomethodology: Turn-Taking & Adjacency Pairs (Sacks, Schegloff, Jefferson)",
      "Game Theory: Minimax, Zero-Sum Contestation, and Concession Thresholds",
      "Sociology of Law: Adversarial Cross-Examination & Objection Orders",
    ],
    fundamentalQuestion: 'When divergent trajectories meet, who yields, who checks, and who interrogates?',
    playerAgency: 'contestation_negotiation',
    playerAgencyLabel: 'Contestation & Precedence Negotiation',
    coreAct: 'Negotiating precedence when trajectories collide: deferring initiative, interrogating validity, or conceding.',
    canonicalSpeechActs: ['ACCEPT', 'REJECT', 'VOTE', 'INFORM'],
    subActions: ['check', 'defer', 'challenge', 'interrogate', 'yield', 'concede', 'fold', 'call', 'stand'],
    analogs: {
      check: {
        cardGame: 'Checking in poker',
        speechActConversation: 'Nodding, holding floor, pausing turn',
        ritualHabit: 'Silent pause in liturgy',
        politicalTheaterCourtroom: 'Yielding balance of time, passing initiative',
      },
      challenge: {
        cardGame: 'Calling a bluff ("Bullshit")',
        speechActConversation: 'Pointing out contradiction, calling foul',
        ritualHabit: 'Calling out heresy or taboo violation',
        politicalTheaterCourtroom: '"Objection your honor!", committee subpoena',
      },
      yield: {
        cardGame: 'Folding a hand',
        speechActConversation: 'Admitting error, conceding the point',
        ritualHabit: 'Prostrating before authority, submission',
        politicalTheaterCourtroom: 'Plea bargain, withdrawing candidacy, settlement',
      },
    },
  },

  VERIFICATION_REVELATION: {
    primitiveNumber: 4,
    primitive: 'VERIFICATION_REVELATION',
    name: 'Verification & Revelation (Collapsing Entropy)',
    theoreticalRoots: [
      "Information Economics: The Revelation Principle",
      "Sociology of Law & Ritual: Performative Ratification & Witnessing",
      "Speech Act Theory: Declarations & Juridical Illocutions",
    ],
    fundamentalQuestion: 'Whose assertion was valid, and who ratifies the truth into public fact?',
    playerAgency: 'revealing_truth',
    playerAgencyLabel: 'Entropy Collapse & Public Witnessing',
    coreAct: 'Compelling private assets/beliefs into auditable public fact and collectively ratifying the outcome.',
    canonicalSpeechActs: ['SYNTHESIZE', 'INFORM', 'ACCEPT'],
    subActions: ['expose', 'showdown', 'reveal', 'ratify', 'witness', 'adjudicate'],
    analogs: {
      expose: {
        cardGame: 'Showdown (cards tabled on felt)',
        speechActConversation: 'Producing proof, confessing secret',
        ritualHabit: 'Taking a solemn public vow',
        politicalTheaterCourtroom: 'Submitting Exhibit A, publishing inspector general report',
      },
      ratify: {
        cardGame: 'Pushing the pot to the winner',
        speechActConversation: '"I understand and agree", signing contract',
        ritualHabit: 'Pronouncing: "I now pronounce you...", Amen',
        politicalTheaterCourtroom: 'Foreman reading verdict, signing treaty into law',
      },
    },
  },

  SETTLEMENT_ACCOUNTING: {
    primitiveNumber: 5,
    primitive: 'SETTLEMENT_ACCOUNTING',
    name: 'Settlement & Accounting (State Rebalance)',
    theoreticalRoots: [
      "Pierre Bourdieu: Symbolic Capital, Face & Social Credit",
      "Mechanism Design: Wealth Transfer, Scoring & Positional Reallocation",
      "Ritual Studies: Cleansing Rites, Expiation & The Return to Mundane Time",
    ],
    fundamentalQuestion: 'How is symbolic, social, or physical capital redistributed, and how is the slate wiped clean?',
    playerAgency: 'state_rebalance',
    playerAgencyLabel: 'Capital Redistribution & Baseline Reset',
    coreAct: 'Exacting levies or penalties, transferring capital/points, and wiping the slate clean to baseline.',
    canonicalSpeechActs: ['INFORM', 'SYNTHESIZE'],
    subActions: ['levy', 'toll', 'clear', 'reset', 'settlement', 'payout', 'rotate_dealer'],
    analogs: {
      levy: {
        cardGame: 'Collecting rake, penalty for foul',
        speechActConversation: 'Losing face, social shame, retraction',
        ritualHabit: 'Penance, tithing, atonement toll',
        politicalTheaterCourtroom: 'Court sanction, punitive fine, prison sentence',
      },
      clear: {
        cardGame: 'Shuffling deck, rotating dealer button',
        speechActConversation: 'Exchanging parting handshakes, "water under the bridge"',
        ritualHabit: 'Parting blessing, saying "Amen", washing hands',
        politicalTheaterCourtroom: 'Adjourning court sine die, clearing the docket',
      },
    },
  },

  META_ACTS: {
    primitiveNumber: 6,
    primitive: 'META_ACTS',
    name: 'Meta-Acts (Rules of the Rule-Set)',
    theoreticalRoots: [
      "Harold Garfinkel: Breaching Experiments & Ethnomethodological Indifference",
      "Conversation Analysis: Repair Sequences & Preference Organization",
      "Johan Huizinga: The Spoilsport vs The Cheat (Breaching the Magic Circle)",
    ],
    fundamentalQuestion: 'Is the interaction going off-track, or is the frame itself being rejected?',
    playerAgency: 'meta_repair_or_rupture',
    playerAgencyLabel: 'Frame Preservation & Breaching',
    coreAct: 'Executing micro-adjustments to preserve the illusion (repair) or refusing to honor the social contract (rupture).',
    canonicalSpeechActs: ['REQUEST', 'REJECT', 'INFORM'],
    subActions: ['repair', 'rupture', 'rephrase', 'apologize', 'spoilsport', 'walkout'],
    analogs: {
      repair: {
        cardGame: 'Calling a misdeal, floor judge ruling',
        speechActConversation: '"Sorry, that came out wrong", "Let me rephrase"',
        ritualHabit: 'Apology, atonement gesture, cleansing rite',
        politicalTheaterCourtroom: 'Withdrawing improper remark, striking from record',
      },
      rupture: {
        cardGame: 'Table flip, refusing to pay, walking away',
        speechActConversation: 'Hanging up phone, storming out of room',
        ritualHabit: 'Desecration, public apostasy, taboo breach',
        politicalTheaterCourtroom: 'Contempt of court outburst, walking out of summit',
      },
    },
  },
};

/**
 * Returns metadata for a given interaction primitive.
 */
export function getInteractionPrimitiveDefinition(primitive: UniversalInteractionPrimitive): UniversalInteractionDefinition {
  return UNIVERSAL_INTERACTION_MATRIX[primitive];
}

/**
 * Validates whether an interaction primitive transition is structurally valid.
 */
export function isValidInteractionTransition(
  current: UniversalInteractionPrimitive,
  next: UniversalInteractionPrimitive
): boolean {
  // Meta-acts can be invoked at ANY time from any primitive (repair or rupture)
  if (next === 'META_ACTS') return true;
  if (current === 'META_ACTS') return true; // Recover from repair or transition to reset

  const currentNum = UNIVERSAL_INTERACTION_MATRIX[current]?.primitiveNumber;
  const nextNum = UNIVERSAL_INTERACTION_MATRIX[next]?.primitiveNumber;

  if (!currentNum || !nextNum) return false;

  // Linear progression forward, or cycle back from Settlement (5) to Frame/Boundary (1)
  if (nextNum === currentNum + 1) return true;
  if (current === 'SETTLEMENT_ACCOUNTING' && next === 'FRAME_BOUNDARY') return true;

  // Posturing & Contestation tight negotiation loops (Turn 3 <-> Turn 2)
  if (current === 'POSTURING_ASSERTION' && next === 'YIELDING_CONTESTATION') return true;
  if (current === 'YIELDING_CONTESTATION' && next === 'POSTURING_ASSERTION') return true;
  if (current === 'POSTURING_ASSERTION' && next === 'POSTURING_ASSERTION') return true;
  if (current === 'YIELDING_CONTESTATION' && next === 'YIELDING_CONTESTATION') return true;

  return false;
}

// ============================================================================
// 2. Legacy Tabletop Game Phase Matrix (Backward Compatibility Layer)
// ============================================================================

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
  if (current === 'SETTLEMENT' && next === 'INITIALIZATION') return true;

  // Multi-street / trick interaction loops (e.g., Flop -> Wager -> Turn -> Wager, or multiple tricks)
  if (current === 'INTERACTION' && next === 'INTERACTION') return true;
  if (current === 'INTERACTION' && next === 'ALLOCATION') return true; // Community street deal

  return false;
}

// ============================================================================
// 3. Deviant Archetype Typology (Cheater, Spoilsport, Trickster)
// ============================================================================

export type DeviantArchetype = 'CHEATER' | 'SPOILSPORT' | 'TRICKSTER';

export interface DeviantArchetypeDefinition {
  readonly archetype: DeviantArchetype;
  readonly name: string;
  readonly relationToFrame: string;
  readonly stance: string;
  readonly targetOfAttack: string;
  readonly showdownOutcome: string;
  readonly systemicResult: string;
  readonly coreOperations: string[];
}

export const DEVIANT_ARCHETYPE_MATRIX: Record<DeviantArchetype, DeviantArchetypeDefinition> = {
  CHEATER: {
    archetype: 'CHEATER',
    name: 'The Cheater',
    relationToFrame: 'Respects it secretly; needs it to profit',
    stance: 'Compliant outwardly',
    targetOfAttack: 'The score / resource bank',
    showdownOutcome: 'Shame, disqualification, or illicit win',
    systemicResult: 'Corrupts the ledger',
    coreOperations: ['covert_infraction', 'concealed_hand', 'falsify_score'],
  },
  SPOILSPORT: {
    archetype: 'SPOILSPORT',
    name: 'The Spoilsport / Vandal',
    relationToFrame: 'Despises it; breaks it down out of spite',
    stance: 'Hostile / Refusal',
    targetOfAttack: "The game's existence",
    showdownOutcome: 'Halts the game completely',
    systemicResult: 'Destroys the ledger',
    coreOperations: ['table_flip', 'refuse_turn', 'vandalize_rules'],
  },
  TRICKSTER: {
    archetype: 'TRICKSTER',
    name: 'The Trickster',
    relationToFrame: 'Dances on its boundary; bends it into a mirror',
    stance: 'Hyper-playful / Feigned innocence',
    targetOfAttack: "The players' unexamined assumptions",
    showdownOutcome: 'Humiliates the authority, rewrites the game',
    systemicResult: 'Forces the system to evolve',
    coreOperations: [
      'hijack_frame',
      'feign_stance',
      'asymmetric_buy_in',
      'hyper_comply',
      'literal_gambit',
      'counterfeit_signal',
      'bait_escalation',
      'deflect_challenge',
      'parody_yield',
      'ungraspable_check',
      'staged_expose',
      'refuse_ratification',
      'evade_toll',
      'invert_value',
      'creative_rupture',
      'forced_repair',
    ],
  },
};

export function getDeviantArchetypeDefinition(archetype: DeviantArchetype): DeviantArchetypeDefinition {
  return DEVIANT_ARCHETYPE_MATRIX[archetype];
}

// ============================================================================
// 4. Formal Dialogue Games & Public Commitment Store (Walton & Krabbe / MPST)
// ============================================================================

export type Performative =
  | 'PROPOSE'
  | 'ACCEPT'
  | 'REJECT'
  | 'ASSERT'
  | 'QUERY'
  | 'CHALLENGE'
  | 'EXECUTE_SYNC';

export type CommitmentStatus =
  | 'PENDING'
  | 'RATIFIED'
  | 'FULFILLED'
  | 'VIOLATED'
  | 'REJECTED';

export type DialoguePhase =
  | 'IDLE'
  | 'STRATEGY'
  | 'EXECUTION'
  | 'ARBITRATION';

/**
 * Public Commitment in store C_a: Commitment(a, action, phi, t_exp).
 * Formalizes Walton & Krabbe dialectical commitments and Deontic obligations.
 */
export interface Commitment {
  id: string;
  obligor: string;        // Who must act (ActorId / Role)
  beneficiary: string;    // Who benefits (ActorId / Role | "BROADCAST")
  actionPayload: any;     // Promised game action / move
  condition?: string;     // Precondition phi
  deadlineTick?: number;  // Turn / timestamp t_exp
  status: CommitmentStatus;
  createdAtTurn?: number;
  violatedReason?: string;
  meta?: Record<string, any>;
}

/**
 * Deontic Obligation O(target, REPLY) resulting from an open QUERY.
 */
export interface DeonticObligation {
  id: string;
  targetRole: string;
  demandedAct: string;    // e.g. "REPLY"
  query: string;
  issuedByRole: string;
  turn: number;
}

/**
 * Shared state for the Dialogue Game and Public Commitment Store.
 */
export interface GameDialogueState {
  currentPhase: DialoguePhase;
  activeCommitments: Record<string, Commitment>;
  openQuestions: DeonticObligation[];
  reputationMatrix: Record<string, number>;
}

// ============================================================================
// 5. Dual-Track Interaction Architecture: Spontaneous Ambient Speech Acts
// ============================================================================

/**
 * Ambient out-of-turn speech acts that occur between formal game turns:
 * table talk, banter, whispers, backchannels, interjections, and psychological warfare.
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
  advancesGameTurn?: boolean;
  table?: string;
  container?: string;
  [k: string]: any;
}


