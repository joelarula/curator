import type {
  AgentMessageEnvelope,
  AgentEndpoint,
} from './types.js';
import { createAgentMessageEnvelope } from './EnvelopeValidator.js';
import { BaseConversationSession } from './BaseConversationSession.js';
import type { ConversationManager } from './ConversationManager.js';

export type TenderStatus = 'OPEN' | 'EVALUATING' | 'AWARDED' | 'EXPIRED';

export interface CandidateBid {
  bidId: string;
  bidder: AgentEndpoint;
  payload: any;
  score?: number;
  timestamp: string;
  envelope: AgentMessageEnvelope;
}

export interface QADispatcherOptions {
  conversationId: string;
  requester: AgentEndpoint;
  topic?: string;
  timeoutMs?: number;
  manager?: ConversationManager;
}

export interface SolicitOptions {
  query: string;
  recipients?: AgentEndpoint[] | '*';
  requiredTools?: string[];
  contextState?: Record<string, unknown>;
  timeoutMs?: number;
}

/**
 * Manages 1:1 and 1:N RFP (Request For Proposal) and Question-Answer auctions.
 * Solicits bids, manages bidding collection windows, and handles winner selection.
 */
export class QADispatcher extends BaseConversationSession {
  public readonly requester: AgentEndpoint;
  public readonly timeoutMs: number;

  private tenderStatus: TenderStatus = 'OPEN';
  private bidsList: CandidateBid[] = [];
  private winningBidId: string | null = null;

  constructor(options: QADispatcherOptions) {
    super({
      conversationId: options.conversationId,
      topic: options.topic,
      manager: options.manager,
    });
    this.requester = options.requester;
    this.timeoutMs = options.timeoutMs || 15000;
  }

  public get status(): TenderStatus {
    return this.tenderStatus;
  }

  public get bids(): ReadonlyArray<CandidateBid> {
    return this.bidsList;
  }

  public get winner(): CandidateBid | undefined {
    return this.bidsList.find((b) => b.bidId === this.winningBidId);
  }

  public async solicit(options: SolicitOptions): Promise<AgentMessageEnvelope> {
    this.turnCounter += 1;
    const timeout = options.timeoutMs || this.timeoutMs;

    const envelope = createAgentMessageEnvelope({
      conversationId: this.conversationId,
      conversationType: 'qa',
      communicationForm: 'catechism',
      turnDynamics: 'interrogation_loop',
      intent: 'evaluative',
      speechAct: 'QUERY',
      sender: this.requester,
      recipients: options.recipients || '*',
      topic: this.topic,
      payload: {
        query: options.query,
        requiredTools: options.requiredTools,
        timeoutMs: timeout,
      },
      turn: this.turnCounter,
      contextState: options.contextState,
      expiresInMs: timeout,
    });

    await this.persistTurn(envelope);

    this.startSessionTimer(timeout, () => {
      if (this.tenderStatus === 'OPEN') {
        this.tenderStatus = this.bidsList.length > 0 ? 'EVALUATING' : 'EXPIRED';
        this.emit('timeout', { tenderStatus: this.tenderStatus, bidsCount: this.bidsList.length });
      }
    });

    this.emit('solicit', envelope);
    this.emit('message', envelope);
    return envelope;
  }

  public async submitBid(
    bidder: AgentEndpoint,
    payload: any,
    options: { score?: number } = {}
  ): Promise<CandidateBid> {
    if (this.tenderStatus !== 'OPEN') {
      throw new Error(`Cannot submit bid: Tender '${this.conversationId}' is ${this.tenderStatus}`);
    }

    this.turnCounter += 1;
    const bidId = `bid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const envelope = createAgentMessageEnvelope({
      conversationId: this.conversationId,
      conversationType: 'qa',
      communicationForm: 'catechism',
      turnDynamics: 'interrogation_loop',
      intent: 'evaluative',
      speechAct: 'PROPOSE',
      sender: bidder,
      recipients: [this.requester],
      topic: this.topic,
      payload: { bidId, ...payload },
      turn: this.turnCounter,
    });

    const bid: CandidateBid = {
      bidId,
      bidder,
      payload,
      score: options.score,
      timestamp: new Date().toISOString(),
      envelope,
    };

    this.bidsList.push(bid);
    await this.persistTurn(envelope);

    this.emit('bid', bid);
    this.emit('message', envelope);
    return bid;
  }

  public async awardWinner(
    bidId: string,
    rationale?: string
  ): Promise<{ winnerEnvelope: AgentMessageEnvelope; rejectEnvelopes: AgentMessageEnvelope[] }> {
    const winnerBid = this.bidsList.find((b) => b.bidId === bidId);
    if (!winnerBid) {
      throw new Error(`Bid '${bidId}' not found in tender '${this.conversationId}'`);
    }

    this.clearSessionTimer();
    this.tenderStatus = 'AWARDED';
    this.winningBidId = bidId;

    const createDecisionEnvelope = (recipient: AgentEndpoint, targetBidId: string, awarded: boolean, reason: string) => {
      this.turnCounter += 1;
      return createAgentMessageEnvelope({
        conversationId: this.conversationId,
        conversationType: 'qa',
        communicationForm: 'catechism',
        turnDynamics: 'interrogation_loop',
        intent: 'assertive',
        speechAct: awarded ? 'ACCEPT' : 'REJECT',
        sender: this.requester,
        recipients: [recipient],
        topic: this.topic,
        payload: { bidId: targetBidId, awarded, rationale: reason },
        turn: this.turnCounter,
      });
    };

    const winnerEnvelope = createDecisionEnvelope(
      winnerBid.bidder,
      bidId,
      true,
      rationale || 'Bid selected as best fulfillment'
    );
    await this.persistTurn(winnerEnvelope);
    this.emit('message', winnerEnvelope);

    const rejectEnvelopes: AgentMessageEnvelope[] = [];
    const others = this.bidsList.filter((b) => b.bidId !== bidId);
    for (const other of others) {
      const rejectEnv = createDecisionEnvelope(other.bidder, other.bidId, false, 'Another candidate was selected');
      await this.persistTurn(rejectEnv);
      rejectEnvelopes.push(rejectEnv);
      this.emit('message', rejectEnv);
    }

    this.emit('awarded', { winner: winnerBid, rationale, rejectedCount: others.length });
    return { winnerEnvelope, rejectEnvelopes };
  }

  public async handleIncoming(envelope: AgentMessageEnvelope): Promise<void> {
    if (envelope.conversationId !== this.conversationId) return;

    if (envelope.speechAct === 'PROPOSE' && this.tenderStatus === 'OPEN') {
      const bidId = envelope.payload?.bidId || `bid_${Date.now()}`;
      const bid: CandidateBid = {
        bidId,
        bidder: envelope.sender,
        payload: envelope.payload,
        timestamp: envelope.timestamp,
        envelope,
      };
      this.bidsList.push(bid);
      this.turnCounter = Math.max(this.turnCounter, envelope.turn);
      await this.persistTurn(envelope);
      this.emit('bid', bid);
      this.emit('message', envelope);
    }
  }
}
