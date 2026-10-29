import type {
  AgentMessageEnvelope,
  AgentEndpoint,
  VoteChoice,
  ForumGovernanceMode,
} from './types.js';
import { createAgentMessageEnvelope } from './EnvelopeValidator.js';
import { BaseConversationSession } from './BaseConversationSession.js';
import { evaluateQuorum } from './ConversationTools.js';
import type { ConversationManager } from './ConversationManager.js';

export interface ActiveProposal {
  proposalId: string;
  proposer: AgentEndpoint;
  title: string;
  payload: any;
  ballots: Map<string, { choice: VoteChoice; rationale?: string; voter: AgentEndpoint }>;
  status: 'PROPOSED' | 'DELIBERATING' | 'QUORUM_REACHED' | 'ACCEPTED' | 'REJECTED';
}

export interface ForumRoomOptions {
  roomUri: string;
  topic?: string;
  governanceMode?: ForumGovernanceMode;
  requiredVotes?: number;
  initialParticipants?: AgentEndpoint[];
  manager?: ConversationManager;
}

/**
 * Manages an M:N structured deliberation forum or committee room.
 * Supports floor arbitration, role assignment, proposal lifecycle, and voting quorum.
 */
export class ForumRoom extends BaseConversationSession {
  public readonly roomUri: string;
  public readonly governanceMode: ForumGovernanceMode;
  public readonly requiredVotes: number;

  private participantsMap: Map<string, AgentEndpoint> = new Map();
  private currentActiveProposal: ActiveProposal | null = null;
  private proposalHistory: ActiveProposal[] = [];
  private currentActiveSpeaker?: AgentEndpoint;
  private isConcluded: boolean = false;

  constructor(options: ForumRoomOptions) {
    super({
      conversationId: options.roomUri,
      topic: options.topic,
      manager: options.manager,
    });
    this.roomUri = options.roomUri;
    this.governanceMode = options.governanceMode || 'moderated';
    this.requiredVotes = options.requiredVotes || 2;

    if (options.initialParticipants) {
      for (const p of options.initialParticipants) {
        this.join(p);
      }
    }
  }

  public get participants(): AgentEndpoint[] {
    return Array.from(this.participantsMap.values());
  }

  public get activeProposal(): ActiveProposal | null {
    return this.currentActiveProposal;
  }

  public get activeSpeaker(): AgentEndpoint | undefined {
    return this.currentActiveSpeaker;
  }

  public get turn(): number {
    return this.turnCounter;
  }

  public get concluded(): boolean {
    return this.isConcluded;
  }

  public join(participant: AgentEndpoint): void {
    this.participantsMap.set(this.endpointKey(participant), participant);
    this.emit('join', participant);
  }

  public leave(agentId: string, nodeId: string = 'local'): boolean {
    const key = `${nodeId}:${agentId}`;
    const deleted = this.participantsMap.delete(key);
    if (deleted) {
      this.emit('leave', { nodeId, agentId });
    }
    return deleted;
  }

  public assignRole(agentId: string, role: string, nodeId: string = 'local'): boolean {
    const p = this.participantsMap.get(`${nodeId}:${agentId}`);
    if (!p) return false;
    p.role = role;
    this.emit('role_assigned', { participant: p, role });
    return true;
  }

  public grantFloor(speaker: AgentEndpoint): void {
    this.currentActiveSpeaker = speaker;
    this.emit('floor_granted', speaker);
  }

  public async postProposal(
    proposer: AgentEndpoint,
    title: string,
    payload: any,
    _options: { requiredVotes?: number } = {}
  ): Promise<AgentMessageEnvelope> {
    if (this.isConcluded) {
      throw new Error(`Forum '${this.roomUri}' is already concluded`);
    }

    this.join(proposer);
    this.turnCounter += 1;

    const proposalId = `prop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.currentActiveProposal = {
      proposalId,
      proposer,
      title,
      payload,
      ballots: new Map(),
      status: 'PROPOSED',
    };

    const envelope = createAgentMessageEnvelope({
      conversationId: this.roomUri,
      conversationType: 'forum',
      communicationForm: 'polylogue',
      turnDynamics: 'moderated_floor',
      intent: 'deliberative',
      speechAct: 'PROPOSE',
      sender: proposer,
      recipients: '*',
      topic: this.topic || title,
      payload: { proposalId, title, ...payload },
      turn: this.turnCounter,
      contextState: {
        activeProposalId: proposalId,
        forumStatus: 'DELIBERATING',
      },
    });

    await this.persistTurn(envelope, envelope.contextState);
    this.emit('proposal', this.currentActiveProposal);
    this.emit('message', envelope);
    return envelope;
  }

  public async castVote(
    voter: AgentEndpoint,
    choice: VoteChoice,
    rationale?: string
  ): Promise<{ envelope: AgentMessageEnvelope; quorumReached: boolean }> {
    if (!this.currentActiveProposal) {
      throw new Error(`Cannot vote: No active proposal in forum '${this.roomUri}'`);
    }
    if (this.isConcluded) {
      throw new Error(`Cannot vote: Forum '${this.roomUri}' is concluded`);
    }

    this.join(voter);
    this.turnCounter += 1;

    this.currentActiveProposal.ballots.set(this.endpointKey(voter), { choice, rationale, voter });
    const evalResult = evaluateQuorum(
      Array.from(this.currentActiveProposal.ballots.values()).map((b) => b.choice),
      this.requiredVotes
    );
    this.currentActiveProposal.status = evalResult.status;

    const envelope = createAgentMessageEnvelope({
      conversationId: this.roomUri,
      conversationType: 'forum',
      communicationForm: 'polylogue',
      turnDynamics: 'moderated_floor',
      intent: 'evaluative',
      speechAct: 'VOTE',
      sender: voter,
      recipients: '*',
      topic: this.topic,
      payload: {
        proposalId: this.currentActiveProposal.proposalId,
        ballot: choice,
        rationale,
        tally: {
          approvals: evalResult.approvals,
          rejections: evalResult.rejections,
          total: evalResult.totalVotes,
          required: this.requiredVotes,
        },
        quorumReached: evalResult.quorumReached,
      },
      turn: this.turnCounter,
      contextState: {
        activeProposalId: this.currentActiveProposal.proposalId,
        proposalStatus: this.currentActiveProposal.status,
        quorumReached: evalResult.quorumReached,
      },
    });

    await this.persistTurn(envelope, envelope.contextState);
    this.emit('vote', { voter, choice, proposal: this.currentActiveProposal });
    this.emit('message', envelope);

    if (evalResult.quorumReached) {
      this.emit('quorum', this.currentActiveProposal);
    }

    return { envelope, quorumReached: evalResult.quorumReached };
  }

  public async synthesizeConsensus(
    synthesizer: AgentEndpoint,
    conclusion: string,
    _options: { force?: boolean } = {}
  ): Promise<AgentMessageEnvelope> {
    this.join(synthesizer);
    this.turnCounter += 1;
    this.isConcluded = true;

    if (this.currentActiveProposal) {
      this.proposalHistory.push(this.currentActiveProposal);
    }

    const envelope = createAgentMessageEnvelope({
      conversationId: this.roomUri,
      conversationType: 'forum',
      communicationForm: 'polylogue',
      turnDynamics: 'moderated_floor',
      intent: 'synthetic',
      speechAct: 'SYNTHESIZE',
      sender: synthesizer,
      recipients: '*',
      topic: this.topic,
      payload: {
        conclusion,
        finalStatus: this.currentActiveProposal?.status || 'CONCLUDED',
        proposalsCount: this.proposalHistory.length,
      },
      turn: this.turnCounter,
      contextState: {
        forumStatus: 'CONCLUDED',
        conclusion,
      },
    });

    await this.persistTurn(envelope, envelope.contextState);
    this.emit('synthesize', { synthesizer, conclusion });
    this.emit('message', envelope);
    this.emit('concluded', conclusion);
    return envelope;
  }

  public async handleIncoming(envelope: AgentMessageEnvelope): Promise<void> {
    if (envelope.conversationId !== this.roomUri) return;

    this.join(envelope.sender);
    this.turnCounter = Math.max(this.turnCounter, envelope.turn);

    if (envelope.speechAct === 'PROPOSE' && envelope.payload?.proposalId) {
      this.currentActiveProposal = {
        proposalId: envelope.payload.proposalId,
        proposer: envelope.sender,
        title: envelope.payload.title || 'Untitled Proposal',
        payload: envelope.payload,
        ballots: new Map(),
        status: 'PROPOSED',
      };
      this.emit('proposal', this.currentActiveProposal);
    } else if (envelope.speechAct === 'VOTE' && this.currentActiveProposal) {
      const choice = envelope.payload.ballot as VoteChoice;
      this.currentActiveProposal.ballots.set(this.endpointKey(envelope.sender), {
        choice,
        rationale: envelope.payload.rationale,
        voter: envelope.sender,
      });
      this.emit('vote', { voter: envelope.sender, choice, proposal: this.currentActiveProposal });
    } else if (envelope.speechAct === 'SYNTHESIZE') {
      this.isConcluded = true;
      this.emit('synthesize', { synthesizer: envelope.sender, conclusion: envelope.payload?.conclusion });
      this.emit('concluded', envelope.payload?.conclusion);
    }

    await this.persistTurn(envelope, envelope.contextState);
    this.emit('message', envelope);
  }
}
