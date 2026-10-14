import type { CuratorAstNode, CuratorSequentialNode } from '../../CuratorAst.js';
import { CuratorCoreBuilder } from '../CuratorCoreBuilder.js';

/**
 * Fluent builder for multi-agent forum rooms and deliberations.
 */
export class FluentForumBuilder {
  private steps: CuratorAstNode[] = [];
  public activeRole?: string;

  constructor(public roomUri: string) {}

  as_role(role: string): this {
    this.activeRole = role;
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

  await_quorum(options: { targetVotes?: number; timeout?: string } = {}): this {
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

  build(): CuratorSequentialNode {
    return CuratorCoreBuilder.seq(`forum:${this.roomUri}`, ...this.steps);
  }
}
