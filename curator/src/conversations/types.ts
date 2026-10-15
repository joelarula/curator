/**
 * Conversation & Agent Message Protocol Types
 * 
 * Defines standard speech acts, envelope structure, and room metadata
 * for peer-to-peer agent communication both within a single node and across the mesh.
 */

export type ConversationType = 'dialog' | 'monolog' | 'forum' | 'qa';

/**
 * The Classical Forms of Agentic Discourse
 * Structured across: Participant Count, Turn-Taking Dynamics, and Communicative Intent.
 */
export type CommunicationForm =
  | 'monologue'   // 1 -> Present audience: Deliver a narrative, speech, or lesson
  | 'soliloquy'   // 1 -> Self / unseen: Reveal internal thoughts, dilemmas, and scratchpad CoT
  | 'dialogue'    // 2 <-> Each other: Mutual exchange of ideas and reactions
  | 'trialogue'   // 3 <-> Each other: Triangulate perspectives or negotiate
  | 'polylogue'   // 4+ <-> Group members: Collaborative discourse, committee debate, or quorum
  | 'catechism'   // 2+ -> Asymmetric pair: Inquire, evaluate, or interrogate (Q&A)
  | 'dialectic'   // 2+ -> Collaborative: Resolve tension between opposing truths (Thesis/Antithesis/Synthesis)
  | 'apostrophe'; // 1 -> Inanimate / Absent: Evoke emotion, anchor conviction, assert to ledger/future session

export type TurnTakingDynamics =
  | 'broadcast'
  | 'private_reflection'
  | 'alternating'
  | 'triangulated'
  | 'moderated_floor'
  | 'interrogation_loop'
  | 'thesis_antithesis_synthesis'
  | 'one_way_invocation';

export type CommunicativeIntent =
  | 'narrative'
  | 'introspective'
  | 'deliberative'
  | 'evaluative'
  | 'synthetic'
  | 'assertive';

export type SpeechAct =
  | 'INFORM'          // Assert a fact, status update, answer, or telemetry
  | 'QUERY'           // Solicit specific information, perspective, or answers
  | 'REQUEST'         // Solicit tool invocation or task delegation
  | 'PROPOSE'         // Offer a plan, patch, or tender bid
  | 'ACCEPT'          // Accept a proposal, bid, or answer
  | 'REJECT'          // Reject a proposal with rationale
  | 'VOTE'            // Submit a ballot in a forum deliberation
  | 'SYNTHESIZE'      // Conclude a topic with consensus findings
  | 'ACK'             // Technical delivery acknowledgment
  | 'JOIN'            // Participant connects, requests role, initiates handshake
  | 'LEAVE'           // Participant disconnects, concedes, or yields floor
  | 'HEARTBEAT'       // Liveness check and presence refresh
  | 'SYNC';           // State catch-up: snapshot of context, active commitments, turn

export interface AgentEndpoint {
  nodeId: string;        // Node identifier (e.g. 'local' for intra-node, or remote 'host-alpha')
  projectId?: string;    // Scoped Project ID (enables intra-node cross-project agent communication)
  agentId: string;       // Agent identifier or name
  conversationalRole?: string; // Conversational / communicative role within session G (e.g. "chair", "proposer", "critic", "synthesizer") - decoupled from permission/RBAC roles
  role?: string;         // Alias for conversationalRole for backward compatibility
  name?: string;         // Human-readable agent name
}

export interface AgentMessageEnvelope<T = any> {
  // Identification & Correlation
  messageId: string;
  conversationId: string;  // Matches Curator Conversation.externalId
  threadId?: string;        // Sub-thread or branch ID
  correlationId?: string;   // Correlates request/response turns
  parentMessageId?: string; // Preceding turn message ID

  // Routing & Discourse Form
  sender: AgentEndpoint;
  recipients: AgentEndpoint[] | '*'; // '*' for monolog/broadcast
  conversationType: ConversationType;
  communicationForm?: CommunicationForm;
  turnDynamics?: TurnTakingDynamics;
  intent?: CommunicativeIntent;
  speechAct: SpeechAct;

  // Content & Payload
  topic?: string;
  summary?: string;
  payload: T;

  // Execution Context Guarantee (AGENTS.md Section 4.5)
  turn: number;
  contextState?: Record<string, unknown>; // $context snapshot

  // Transmission Metadata
  timestamp: string;
  expiresAt?: string;
  hops: number;
  maxHops?: number;
  signature?: string;
}

export type ForumGovernanceMode = 'round-robin' | 'free-floor' | 'moderated' | 'quorum';
export type VoteChoice = 'approve' | 'reject' | 'abstain';

export interface ConversationRoomMetadata {
  conversationType: ConversationType;
  roomUri: string;
  topic?: string;
  participants: AgentEndpoint[];
  participatingProjects?: string[]; // Tracks all involved project IDs (e.g. ['proj-a', 'proj-b'])
  governance?: {
    mode: ForumGovernanceMode;
    activeSpeaker?: string;
    maxTurns?: number;
    currentTurn: number;
  };
  quorum?: {
    requiredVotes: number;
    tally: Record<string, VoteChoice>;
    concluded: boolean;
  };
  customState?: Record<string, unknown>;
}

export interface CreateAgentEnvelopeOptions<T = any> {
  conversationId: string;
  conversationType: ConversationType;
  communicationForm?: CommunicationForm;
  turnDynamics?: TurnTakingDynamics;
  intent?: CommunicativeIntent;
  speechAct: SpeechAct;
  sender: AgentEndpoint;
  recipients?: AgentEndpoint[] | '*';
  payload: T;
  topic?: string;
  summary?: string;
  threadId?: string;
  correlationId?: string;
  parentMessageId?: string;
  turn?: number;
  contextState?: Record<string, unknown>;
  expiresInMs?: number;
  maxHops?: number;
}

// ============================================================================
// Session & Real-Time Connection Lifecycle Types
// ============================================================================

export type SessionStatus = 'connected' | 'reconnecting' | 'disconnected' | 'timed_out';

export interface ConversationSession {
  sessionId: string;
  conversationId: string;
  connectionId?: string;
  participant: AgentEndpoint;
  conversationalRole?: string;
  activeLeases?: string[];
  connectedAt: string;
  lastHeartbeat: string;
  status: SessionStatus;
  metadata?: Record<string, unknown>;
}

export interface StartConversationOptions {
  conversationId: string;
  conversationType: ConversationType;
  roomUri?: string;
  topic?: string;
  governanceMode?: ForumGovernanceMode;
  requiredVotes?: number;
  ruleset?: string;
  initialState?: Record<string, unknown>;
  initialParticipants?: AgentEndpoint[];
  projectId?: string;
  userId?: string;
}

export interface ConversationJoinOptions {
  token?: string;
  as_role?: string;
  conversationalRole?: string;
  connectionId?: string;
  capabilities?: string[];
  leaseDurationMs?: number;
  metadata?: Record<string, unknown>;
}

export interface ConversationLeaveOptions {
  reason?: string;
  graceful?: boolean;
  concede?: boolean;
}

export interface ConversationStateCatchup {
  conversationId: string;
  conversationType: ConversationType;
  turn: number;
  contextState: Record<string, unknown>;
  participants: AgentEndpoint[];
  activeSpeaker?: string;
  recentTurns: AgentMessageEnvelope[];
  commitments?: Record<string, unknown>;
}

