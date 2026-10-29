import type { CuratorGraphNode, CuratorModuleNode } from '../engine/CuratorAst.js';
import type { CuratorPluginDefinition as CuratorPlugin } from '../engine/CuratorContracts.js';
import {
  defineEvent,
  defineModule,
  defineStates,
  defineSubroutine,
  ifElse,
  seq,
  setState,
  stateMachine,
  system,
  tool,
} from '../engine/builder/CuratorCoreBuilder.js';
import { createContextProxy } from '../engine/builder/CuratorProxy.js';
import { ConversationToolName, createConversationTools } from './ConversationTools.js';
import type { ConversationRouter } from './ConversationRouter.js';
import type { SpeechAct, VoteChoice } from './types.js';

// ============================================================================
// 1. FORMAL CONVERSATIONAL PHASES & TYPED EVENTS
// ============================================================================

export const DialogPhase = {
  BOOT: 'BOOT',
  INITIATOR_TURN: 'INITIATOR_TURN',
  RESPONDER_TURN: 'RESPONDER_TURN',
  COMPLETED: 'COMPLETED',
} as const;
export type DialogPhaseType = (typeof DialogPhase)[keyof typeof DialogPhase];

export const ForumPhase = {
  BOOT: 'BOOT',
  OPEN_FLOOR: 'OPEN_FLOOR',
  VOTING: 'VOTING',
  SYNTHESIS: 'SYNTHESIS',
  CONCLUDED: 'CONCLUDED',
} as const;
export type ForumPhaseType = (typeof ForumPhase)[keyof typeof ForumPhase];

export const QAPhase = {
  BOOT: 'BOOT',
  COLLECT_BIDS: 'COLLECT_BIDS',
  AWARD: 'AWARD',
  CLOSED: 'CLOSED',
} as const;
export type QAPhaseType = (typeof QAPhase)[keyof typeof QAPhase];

export const DialogPhaseState = defineStates<DialogPhaseType>('dialogPhase', DialogPhase);
export const ForumPhaseState = defineStates<ForumPhaseType>('forumPhase', ForumPhase);
export const QAPhaseState = defineStates<QAPhaseType>('qaPhase', QAPhase);

export const ConversationEvents = {
  ParticipantJoined: defineEvent<{
    conversationId?: string;
    agentId: string;
    nodeId?: string;
    conversationalRole?: string;
    capabilities?: string[];
    leaseDurationMs?: number;
  }>('conversation:joined'),

  ParticipantLeft: defineEvent<{
    conversationId?: string;
    agentId: string;
    reason?: string;
    concede?: boolean;
    graceful?: boolean;
  }>('conversation:left'),

  DialogTurnSubmitted: defineEvent<{
    conversationId?: string;
    senderId: string;
    speechAct: SpeechAct;
    text?: string;
    payload?: any;
  }>('conversation:dialog_turn'),

  ProposalPosted: defineEvent<{
    conversationId?: string;
    proposerId: string;
    title: string;
    payload?: any;
    requiredVotes?: number;
  }>('conversation:proposal_posted'),

  BallotCast: defineEvent<{
    conversationId?: string;
    agentId: string;
    ballot: VoteChoice;
    rationale?: string;
  }>('conversation:ballot_cast'),

  QuorumReached: defineEvent<{
    conversationId?: string;
    approved: boolean;
    status: string;
    tally: Record<string, any>;
  }>('conversation:quorum_reached'),

  ConsensusSynthesized: defineEvent<{
    conversationId?: string;
    synthesizerId: string;
    conclusion: string;
  }>('conversation:consensus_synthesized'),

  TenderSolicited: defineEvent<{
    conversationId?: string;
    requesterId: string;
    query: string;
    requiredTools?: string[];
  }>('conversation:tender_solicited'),

  BidSubmitted: defineEvent<{
    conversationId?: string;
    bidderId: string;
    bidId: string;
    payload: any;
    score?: number;
  }>('conversation:bid_submitted'),

  TenderAwarded: defineEvent<{
    conversationId?: string;
    winningBidId: string;
    winnerId: string;
    rationale?: string;
  }>('conversation:tender_awarded'),

  AmbientSpeech: defineEvent<{
    conversationId?: string;
    speakerId: string;
    speakerName?: string;
    speechAct?: string;
    targetId?: string;
    text: string;
  }>('conversation:ambient_speech'),

  AmbientSpoken: defineEvent<{
    speaker: string;
    speechAct: string;
    text: string;
    targetId?: string;
  }>('conversation:ambient_spoken'),
} as const;

const state = createContextProxy<Record<string, any>>('$state');
const ctx = createContextProxy<Record<string, any>>('$context');

// ============================================================================
// 2. REUSABLE DETERMINISTIC SUBROUTINES & REACTIVE SYSTEMS
// ============================================================================

const joinEvt = ConversationEvents.ParticipantJoined.payload('joinEvt');
const leaveEvt = ConversationEvents.ParticipantLeft.payload('leaveEvt');
const ballotEvt = ConversationEvents.BallotCast.payload('ballotEvt');
const ambientEvt = ConversationEvents.AmbientSpeech.payload('ambientEvt');

/**
 * Deterministic subroutine handling participant join via the `conversation_join` tool.
 */
export const onParticipantJoinSub = defineSubroutine(
  'on_participant_join',
  [
    tool(
      ConversationToolName.JOIN,
      {
        conversationId: `${joinEvt.conversationId} || $context.conversationId`,
        agentId: String(joinEvt.agentId),
        nodeId: String(joinEvt.nodeId),
        conversationalRole: String(joinEvt.conversationalRole),
        capabilities: joinEvt.capabilities,
        leaseDurationMs: joinEvt.leaseDurationMs,
      },
      'joinResult'
    ),
  ],
  { params: { joinEvt: { type: 'object' } } }
);

/**
 * Deterministic subroutine handling participant leave, floor release, and quorum recalibration.
 */
export const onParticipantLeaveSub = defineSubroutine(
  'on_participant_leave',
  [
    tool(
      ConversationToolName.LEAVE,
      {
        conversationId: `${leaveEvt.conversationId} || $context.conversationId`,
        agentId: String(leaveEvt.agentId),
        reason: String(leaveEvt.reason),
        concede: leaveEvt.concede,
        graceful: leaveEvt.graceful,
      },
      'leaveResult'
    ),
  ],
  { params: { leaveEvt: { type: 'object' } } }
);

/**
 * Deterministic subroutine tallying a forum vote and emitting `QuorumReached` when threshold is met.
 */
export const onBallotCastSub = defineSubroutine(
  'on_ballot_cast',
  [
    tool(
      ConversationToolName.VOTE,
      {
        conversationId: `${ballotEvt.conversationId} || $context.conversationId`,
        agentId: String(ballotEvt.agentId),
        ballot: String(ballotEvt.ballot),
        rationale: String(ballotEvt.rationale),
      },
      'voteOutcome'
    ),
    setState({
      quorumReached: ctx.voteOutcome.evaluation.quorumReached,
      proposalApproved: ctx.voteOutcome.evaluation.approved,
      proposalStatus: ctx.voteOutcome.evaluation.status,
    }),
    ifElse(
      '$context.voteOutcome?.evaluation?.quorumReached == true',
      ConversationEvents.QuorumReached.emit({
        conversationId: `${ballotEvt.conversationId} || $context.conversationId`,
        approved: ctx.voteOutcome.evaluation.approved,
        status: ctx.voteOutcome.evaluation.status,
        tally: ctx.voteOutcome.quorum,
      })
    ),
  ],
  { params: { ballotEvt: { type: 'object' } } }
);

/**
 * Turn-invariant ambient speech system (table talk, whispers, side-channel banter).
 * Runs in parallel with any formal turn state machine without advancing the turn counter.
 */
export const onAmbientSpeechSub = defineSubroutine(
  'on_ambient_speech',
  [
    ConversationEvents.AmbientSpoken.emit(
      {
        speaker: `${ambientEvt.speakerName} || ${ambientEvt.speakerId} || 'Observer'`,
        speechAct: `${ambientEvt.speechAct} || 'TABLE_TALK'`,
        text: `${ambientEvt.text} || ''`,
        targetId: String(ambientEvt.targetId),
      },
      `${ambientEvt.targetId} || undefined`
    ),
  ],
  { params: { ambientEvt: { type: 'object' } } }
);

/**
 * Reusable reactive systems module for conversation presence, quorum evaluation, and ambient speech.
 */
export function buildConversationSystemsModule(): CuratorModuleNode {
  return defineModule(
    'conversation_systems',
    {
      description: 'Reusable reactive systems for conversation presence, quorum tallying, and turn-invariant ambient speech',
    },
    () => {
      system({ on: ConversationEvents.ParticipantJoined, run: onParticipantJoinSub, as: 'joinEvt' });
      system({ on: ConversationEvents.ParticipantLeft, run: onParticipantLeaveSub, as: 'leaveEvt' });
      system({ on: ConversationEvents.BallotCast, run: onBallotCastSub, as: 'ballotEvt' });
      system({ on: ConversationEvents.AmbientSpeech, run: onAmbientSpeechSub, as: 'ambientEvt' });
      return undefined;
    }
  );
}

// ============================================================================
// 3. FORMALIZED CONVERSATION WORKFLOW AST STATE MACHINES
// ============================================================================

const dialogCompleteCond = `($context.lastDialogTurn?.speechAct == 'ACCEPT') or ($state.turn >= ($state.maxTurns || 20))`;

/**
 * Formal 1:1 bilateral dialog state machine driven by Curator DB state and AST events.
 */
export function buildDialogStateMachine(options: { maxTurns?: number } = {}): CuratorGraphNode {
  const maxTurns = options.maxTurns ?? 20;
  return stateMachine(
    DialogPhase.BOOT,
    {
      [DialogPhase.BOOT]: {
        run: [
          setState({ turn: 0, maxTurns, status: 'ACTIVE' }),
          tool(ConversationToolName.START, {
            conversationId: '$context.conversationId',
            conversationType: 'dialog',
            governanceMode: 'round-robin',
          }),
        ],
        next: DialogPhase.INITIATOR_TURN,
      },
      [DialogPhase.INITIATOR_TURN]: {
        run: [
          ConversationEvents.DialogTurnSubmitted.wait('lastDialogTurn'),
          setState({
            turn: '($state.turn || 0) + 1',
            activeSpeaker: '$state.responderId',
          }),
        ],
        next: [
          { to: DialogPhase.COMPLETED, when: dialogCompleteCond },
          { to: DialogPhase.RESPONDER_TURN },
        ],
      },
      [DialogPhase.RESPONDER_TURN]: {
        run: [
          ConversationEvents.DialogTurnSubmitted.wait('lastDialogTurn'),
          setState({
            turn: '($state.turn || 0) + 1',
            activeSpeaker: '$state.initiatorId',
          }),
        ],
        next: [
          { to: DialogPhase.COMPLETED, when: dialogCompleteCond },
          { to: DialogPhase.INITIATOR_TURN },
        ],
      },
      [DialogPhase.COMPLETED]: {
        run: setState({ status: 'COMPLETED' }),
      },
    },
    { name: 'dialog_state_machine', stateKey: DialogPhaseState }
  );
}

/**
 * Formal M:N forum deliberation, voting quorum, and consensus synthesis state machine.
 */
export function buildForumStateMachine(options: { requiredVotes?: number } = {}): CuratorGraphNode {
  const requiredVotes = options.requiredVotes ?? 2;
  return stateMachine(
    ForumPhase.BOOT,
    {
      [ForumPhase.BOOT]: {
        run: [
          setState({ turn: 1, requiredVotes, quorumReached: false, forumStatus: 'OPEN' }),
          tool(ConversationToolName.START, {
            conversationId: '$context.conversationId',
            conversationType: 'forum',
            governanceMode: 'quorum',
            requiredVotes,
          }),
        ],
        next: ForumPhase.OPEN_FLOOR,
      },
      [ForumPhase.OPEN_FLOOR]: {
        run: [
          ConversationEvents.ProposalPosted.wait('activeProposal'),
          setState({
            turn: '($state.turn || 1) + 1',
            forumStatus: 'DELIBERATING',
            activeProposalTitle: '$context.activeProposal.title',
          }),
        ],
        next: ForumPhase.VOTING,
      },
      [ForumPhase.VOTING]: {
        run: [
          ConversationEvents.BallotCast.wait('latestBallot'),
          onBallotCastSub({ ballotEvt: '$context.latestBallot' }, { mode: 'inline' }),
        ],
        next: [
          { to: ForumPhase.SYNTHESIS, when: `$state.quorumReached == true` },
          { to: ForumPhase.VOTING },
        ],
      },
      [ForumPhase.SYNTHESIS]: {
        run: [
          ConversationEvents.ConsensusSynthesized.wait('synthesisResult'),
          setState({
            forumStatus: 'CONCLUDED',
            conclusion: '$context.synthesisResult.conclusion',
          }),
        ],
        next: ForumPhase.CONCLUDED,
      },
      [ForumPhase.CONCLUDED]: {
        run: setState({ concluded: true }),
      },
    },
    { name: 'forum_state_machine', stateKey: ForumPhaseState }
  );
}

/**
 * Formal 1:N RFP / Catechism / Bid-Collection state machine.
 */
export function buildQAStateMachine(options: { minBids?: number } = {}): CuratorGraphNode {
  const minBids = options.minBids ?? 1;
  return stateMachine(
    QAPhase.BOOT,
    {
      [QAPhase.BOOT]: {
        run: [
          setState({ bidsCount: 0, minBids, tenderStatus: 'OPEN' }),
          tool(ConversationToolName.START, {
            conversationId: '$context.conversationId',
            conversationType: 'qa',
            governanceMode: 'free-floor',
          }),
        ],
        next: QAPhase.COLLECT_BIDS,
      },
      [QAPhase.COLLECT_BIDS]: {
        run: [
          ConversationEvents.BidSubmitted.wait('latestBid'),
          setState({
            bidsCount: '($state.bidsCount || 0) + 1',
            lastBidId: '$context.latestBid.bidId',
          }),
        ],
        next: [
          { to: QAPhase.AWARD, when: `($state.bidsCount || 0) >= (${state.minBids} || ${minBids})` },
          { to: QAPhase.COLLECT_BIDS },
        ],
      },
      [QAPhase.AWARD]: {
        run: [
          ConversationEvents.TenderAwarded.wait('awardResult'),
          setState({
            tenderStatus: 'AWARDED',
            winningBidId: '$context.awardResult.winningBidId',
          }),
        ],
        next: QAPhase.CLOSED,
      },
      [QAPhase.CLOSED]: {
        run: setState({ closed: true }),
      },
    },
    { name: 'qa_state_machine', stateKey: QAPhaseState }
  );
}

export const dialogWorkflowAst: CuratorModuleNode = defineModule(
  'conversation_dialog_workflow',
  { description: 'Formal DB-driven 1:1 bilateral dialog AST state machine' },
  () => seq('dialog_engine', [buildDialogStateMachine()])
);

export const forumWorkflowAst: CuratorModuleNode = defineModule(
  'conversation_forum_workflow',
  { description: 'Formal DB-driven M:N deliberation & quorum voting AST state machine' },
  () => seq('forum_engine', [buildForumStateMachine()])
);

export const qaWorkflowAst: CuratorModuleNode = defineModule(
  'conversation_qa_workflow',
  { description: 'Formal DB-driven RFP solicitation & bid evaluation AST state machine' },
  () => seq('qa_engine', [buildQAStateMachine()])
);

export const conversationSystemsAst: CuratorModuleNode = buildConversationSystemsModule();

export const CONVERSATION_WORKFLOW_ASTS: Record<string, CuratorModuleNode> = {
  conversation_dialog_workflow: dialogWorkflowAst,
  conversation_forum_workflow: forumWorkflowAst,
  conversation_qa_workflow: qaWorkflowAst,
  conversation_systems: conversationSystemsAst,
};

/**
 * Creates a reusable CuratorPlugin that registers both deterministic conversation tools
 * (`conversation_start`, `conversation_join`, `conversation_leave`, `conversation_vote`, etc.)
 * and formalized AST workflow state machines & reactive systems.
 */
export function createConversationPlugin(router: ConversationRouter): CuratorPlugin {
  return {
    name: 'curator-conversations',
    version: '1.0.0',
    description: 'DB-backed conversational state machines, reactive systems, and deterministic protocol tools',
    tools: createConversationTools(router),
    scripts: Object.fromEntries(
      Object.entries(CONVERSATION_WORKFLOW_ASTS).map(([name, ast]) => [
        name,
        {
          name,
          description: ast.description || `Conversation workflow module ${name}`,
          ast,
          run: async () => {},
        },
      ])
    ),
  };
}

