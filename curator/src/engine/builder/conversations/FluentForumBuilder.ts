import type { CuratorAstNode, CuratorGraphNode, CuratorSequentialNode } from '../../CuratorAst.js';
import { CuratorCoreBuilder } from '../CuratorCoreBuilder.js';
import { ConversationToolName } from '../../../conversations/ConversationTools.js';
import { buildForumStateMachine } from '../../../conversations/ConversationWorkflows.js';

/**
 * Fluent builder for multi-agent forum rooms and deliberations.
 * Supports both event-driven temporal steps and deterministic DB/tool-backed state transitions.
 */
export class FluentForumBuilder {
  protected steps: CuratorAstNode[] = [];
  public activeRole?: string;

  constructor(public roomUri: string) {}

  as_role(role: string): this {
    this.activeRole = role;
    return this;
  }

  /**
   * Deterministic tool call to initialize the persistent forum room in the database.
   */
  start_room(options: { topic?: string; requiredVotes?: number; initialState?: Record<string, any> } = {}): this {
    this.steps.push(CuratorCoreBuilder.tool(ConversationToolName.START, {
      conversationId: this.roomUri,
      conversationType: 'forum',
      governanceMode: options.requiredVotes ? 'quorum' : 'moderated',
      topic: options.topic,
      requiredVotes: options.requiredVotes,
      initialState: options.initialState,
    }));
    return this;
  }

  join(options: { role?: string; name?: string } | string = {}): this {
    const role = typeof options === 'string' ? options : (options.role || 'participant');
    const name = typeof options === 'object' ? options.name : undefined;
    this.activeRole = role;
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'REQUEST',
      roomUri: this.roomUri,
      payload: { action: 'join', role, name },
      senderRole: role,
      conversationId: this.roomUri,
    }));
    return this;
  }

  /**
   * Deterministic tool call to join the forum with role binding, capability leases, and catchup snapshot.
   */
  join_room(options: { agentId: string; role?: string; capabilities?: string[]; leaseDurationMs?: number }, as = 'joinResult'): this {
    if (options.role) this.activeRole = options.role;
    this.steps.push(CuratorCoreBuilder.tool(ConversationToolName.JOIN, {
      conversationId: this.roomUri,
      agentId: options.agentId,
      conversationalRole: options.role || this.activeRole,
      capabilities: options.capabilities,
      leaseDurationMs: options.leaseDurationMs,
    }, as));
    return this;
  }

  propose(options: { title: string; body?: any; [k: string]: any }): this {
    this.steps.push(CuratorCoreBuilder.setState({
      turn: '$context.turn + 1',
      forumAction: 'PROPOSE',
      activeTitle: options.title,
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'PROPOSE',
      roomUri: this.roomUri,
      senderRole: this.activeRole || options.as_role || '$context.senderRole',
      payload: options,
      turn: '$context.turn',
      conversationId: this.roomUri,
    }));
    return this;
  }

  vote(
    ballotOrOptions: { ballot: 'approve' | 'reject' | 'abstain'; rationale?: string; [k: string]: any } | 'approve' | 'reject' | 'abstain',
    optionsOrRationale?: string | { rationale?: string; [k: string]: any }
  ): this {
    let ballot: 'approve' | 'reject' | 'abstain' = 'approve';
    let rationale: string | undefined;
    let extra: Record<string, any> = {};

    if (typeof ballotOrOptions === 'string') {
      ballot = ballotOrOptions;
      if (typeof optionsOrRationale === 'string') {
        rationale = optionsOrRationale;
      } else if (typeof optionsOrRationale === 'object') {
        rationale = optionsOrRationale.rationale;
        extra = optionsOrRationale;
      }
    } else if (typeof ballotOrOptions === 'object') {
      ballot = ballotOrOptions.ballot;
      rationale = ballotOrOptions.rationale;
      extra = ballotOrOptions;
    }

    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'VOTE',
      roomUri: this.roomUri,
      senderRole: this.activeRole || extra.as_role || '$context.senderRole',
      payload: { ballot, rationale, ...extra },
      turn: '$context.turn',
      conversationId: this.roomUri,
    }));
    return this;
  }

  /**
   * Deterministic tool call to record a ballot and evaluate quorum consensus.
   */
  cast_vote_tool(options: { agentId: string; ballot: 'approve' | 'reject' | 'abstain'; rationale?: string }, as = 'voteOutcome'): this {
    this.steps.push(CuratorCoreBuilder.tool(ConversationToolName.VOTE, {
      conversationId: this.roomUri,
      agentId: options.agentId,
      ballot: options.ballot,
      rationale: options.rationale,
    }, as));
    return this;
  }

  await_quorum(_options: { targetVotes?: number; timeout?: string } = {}): this {
    this.steps.push(CuratorCoreBuilder.waitEvent('forum:quorum_reached', 'quorumResult'));
    return this;
  }

  synthesize(options: { summary?: string; conclusion?: string; [k: string]: any } = {}): this {
    this.steps.push(CuratorCoreBuilder.setState({
      forumStatus: 'CONCLUDED',
      conclusion: options.conclusion || options.summary,
    }));
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'SYNTHESIZE',
      roomUri: this.roomUri,
      senderRole: this.activeRole || options.as_role || '$context.senderRole',
      payload: options,
      turn: '$context.turn',
      conversationId: this.roomUri,
    }));
    return this;
  }

  leave(options: { reason?: string; concede?: boolean; [k: string]: any } = {}): this {
    this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'LEAVE',
      roomUri: this.roomUri,
      senderRole: this.activeRole || options.as_role || '$context.senderRole',
      payload: { action: 'leave', ...options },
      turn: '$context.turn',
      conversationId: this.roomUri,
    }));
    return this;
  }

  /**
   * Deterministic tool call to leave the forum, release the floor, and recalibrate quorum.
   */
  leave_room(options: { agentId: string; reason?: string; concede?: boolean; graceful?: boolean }, as = 'leaveResult'): this {
    this.steps.push(CuratorCoreBuilder.tool(ConversationToolName.LEAVE, {
      conversationId: this.roomUri,
      agentId: options.agentId,
      reason: options.reason,
      concede: options.concede,
      graceful: options.graceful,
    }, as));
    return this;
  }

  /**
   * Embeds the formal DB-driven forum deliberation & quorum AST state machine.
   */
  state_machine(options: { requiredVotes?: number } = {}): CuratorGraphNode {
    return buildForumStateMachine(options);
  }

  build(): CuratorSequentialNode {
    return CuratorCoreBuilder.seq(`forum:${this.roomUri}`, ...this.steps);
  }
}
