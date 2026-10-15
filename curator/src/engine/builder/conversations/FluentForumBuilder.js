import { CuratorCoreBuilder } from '../CuratorCoreBuilder.js';
/**
 * Fluent builder for multi-agent forum rooms and deliberations.
 */
export class FluentForumBuilder {
    constructor(roomUri) {
        this.roomUri = roomUri;
        this.steps = [];
    }
    as_role(role) {
        this.activeRole = role;
        return this;
    }
    join(options = {}) {
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
    propose(options) {
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
    vote(ballotOrOptions, optionsOrRationale) {
        let ballot = 'approve';
        let rationale;
        let extra = {};
        if (typeof ballotOrOptions === 'string') {
            ballot = ballotOrOptions;
            if (typeof optionsOrRationale === 'string') {
                rationale = optionsOrRationale;
            }
            else if (typeof optionsOrRationale === 'object') {
                rationale = optionsOrRationale.rationale;
                extra = optionsOrRationale;
            }
        }
        else if (typeof ballotOrOptions === 'object') {
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
    await_quorum(options = {}) {
        this.steps.push(CuratorCoreBuilder.waitEvent('forum:quorum_reached', 'quorumResult'));
        return this;
    }
    synthesize(options = {}) {
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
    build() {
        return CuratorCoreBuilder.seq(`forum:${this.roomUri}`, ...this.steps);
    }
}
