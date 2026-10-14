import { EventEmitter } from 'events';
import type {
  AgentMessageEnvelope,
  AgentEndpoint,
} from './types.js';
import { createAgentMessageEnvelope } from './EnvelopeValidator.js';
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
 * Operates natively inside a single node as well as across the mesh.
 * Solicits bids, manages bidding collection windows, and handles winner selection with ACCEPT/REJECT performatives.
 */
export class QADispatcher extends EventEmitter {
  public readonly conversationId: string;
  public readonly requester: AgentEndpoint;
  public readonly topic?: string;
  public readonly timeoutMs: number;

  private tenderStatus: TenderStatus = 'OPEN';
  private bidsList: CandidateBid[] = [];
  private winningBidId: string | null = null;
  private manager?: ConversationManager;
  private turnCounter: number = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(options: QADispatcherOptions) {
    super();
    this.conversationId = options.conversationId;
    this.requester = options.requester;
    this.topic = options.topic;
    this.timeoutMs = options.timeoutMs || 15000;
    this.manager = options.manager;
  }

  public get status(): TenderStatus {
    return this.tenderStatus;
  }

  public get bids(): ReadonlyArray<CandidateBid> {
    return this.bidsList;
  }

  public get winner(): CandidateBid | undefined {
    return this.bidsList.find(b => b.bidId === this.winningBidId);
  }

  /**
   * Broadcasts or directs the initial RFP solicitation query.
   */
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

    this.timer = setTimeout(() => {
      if (this.tenderStatus === 'OPEN') {
        this.tenderStatus = this.bidsList.length > 0 ? 'EVALUATING' : 'EXPIRED';
        this.emit('timeout', { tenderStatus: this.tenderStatus, bidsCount: this.bidsList.length });
      }
    }, timeout);

    this.emit('solicit', envelope);
    this.emit('message', envelope);
    return envelope;
  }

  /**
   * Submits a candidate bid or answer from an agent.
   */
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

  /**
   * Awards the contract to a winning bid, sending ACCEPT to winner and REJECT to other bidders.
   */
  public async awardWinner(
    bidId: string,
    rationale?: string
  ): Promise<{ winnerEnvelope: AgentMessageEnvelope; rejectEnvelopes: AgentMessageEnvelope[] }> {
    const winnerBid = this.bidsList.find(b => b.bidId === bidId);
    if (!winnerBid) {
      throw new Error(`Bid '${bidId}' not found in tender '${this.conversationId}'`);
    }

    this.clearTimer();
    this.tenderStatus = 'AWARDED';
    this.winningBidId = bidId;

    // 1. Send ACCEPT to winning agent
    this.turnCounter += 1;
    const winnerEnvelope = createAgentMessageEnvelope({
      conversationId: this.conversationId,
      conversationType: 'qa',
      communicationForm: 'catechism',
      turnDynamics: 'interrogation_loop',
      intent: 'assertive',
      speechAct: 'ACCEPT',
      sender: this.requester,
      recipients: [winnerBid.bidder],
      topic: this.topic,
      payload: {
        bidId,
        awarded: true,
        rationale: rationale || 'Bid selected as best fulfillment',
      },
      turn: this.turnCounter,
    });
    await this.persistTurn(winnerEnvelope);
    this.emit('message', winnerEnvelope);

    // 2. Send REJECT to other bidders
    const rejectEnvelopes: AgentMessageEnvelope[] = [];
    const others = this.bidsList.filter(b => b.bidId !== bidId);
    for (const other of others) {
      this.turnCounter += 1;
      const rejectEnv = createAgentMessageEnvelope({
        conversationId: this.conversationId,
        conversationType: 'qa',
        communicationForm: 'catechism',
        turnDynamics: 'interrogation_loop',
        intent: 'assertive',
        speechAct: 'REJECT',
        sender: this.requester,
        recipients: [other.bidder],
        topic: this.topic,
        payload: {
          bidId: other.bidId,
          awarded: false,
          rationale: 'Another candidate was selected',
        },
        turn: this.turnCounter,
      });
      await this.persistTurn(rejectEnv);
      rejectEnvelopes.push(rejectEnv);
      this.emit('message', rejectEnv);
    }

    this.emit('awarded', { winner: winnerBid, rationale, rejectedCount: others.length });
    return { winnerEnvelope, rejectEnvelopes };
  }

  /**
   * Ingests incoming envelope.
   */
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

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async persistTurn(envelope: AgentMessageEnvelope): Promise<void> {
    if (!this.manager) return;
    try {
      const room = await this.manager.findOrCreateRoom(envelope);
      await this.manager.recordTurn(room, envelope);
    } catch (err) {
      this.emit('warn', `Failed to persist QA turn: ${err}`);
    }
  }
}
