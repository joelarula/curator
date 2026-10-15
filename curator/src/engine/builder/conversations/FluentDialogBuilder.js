import { CuratorCoreBuilder } from '../CuratorCoreBuilder.js';
/**
 * Fluent builder for bilateral 1:1 agent dialog sessions.
 */
export class FluentDialogBuilder {
    constructor(targetUriOrOptions) {
        this.steps = [];
        if (typeof targetUriOrOptions === 'string') {
            if (targetUriOrOptions.startsWith('@role:') || targetUriOrOptions.startsWith('role:')) {
                this.targetRole = targetUriOrOptions.replace(/^@?role:/, '');
                this.targetUri = targetUriOrOptions;
            }
            else {
                this.targetUri = targetUriOrOptions;
            }
        }
        else if (typeof targetUriOrOptions === 'object') {
            this.targetRole = targetUriOrOptions.role || targetUriOrOptions.to_role;
            this.targetUri = targetUriOrOptions.target || (this.targetRole ? `@role:${this.targetRole}` : 'dialog_peer');
            this.senderRole = targetUriOrOptions.as_role;
        }
        else {
            this.targetUri = 'dialog_peer';
        }
    }
    as_role(role) {
        this.senderRole = role;
        return this;
    }
    to_role(role) {
        this.targetRole = role;
        this.targetUri = `@role:${role}`;
        return this;
    }
    say(message) {
        this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
            conversationType: 'dialog',
            speechAct: 'INFORM',
            target: this.targetUri,
            targetRole: this.targetRole,
            senderRole: this.senderRole || '$context.senderRole',
            payload: { message },
            turn: '$context.turn',
            conversationId: '$context.conversationId',
        }));
        return this;
    }
    propose(options = {}) {
        this.steps.push(CuratorCoreBuilder.setState({
            turn: '$context.turn + 1',
            proposalStatus: 'PROPOSED',
            activeTopic: options.topic,
        }));
        this.steps.push(CuratorCoreBuilder.emitEvent('agent:message', {
            conversationType: 'dialog',
            speechAct: 'PROPOSE',
            target: this.targetUri,
            targetRole: this.targetRole || options.role || options.to_role,
            senderRole: this.senderRole || options.as_role || '$context.senderRole',
            payload: options,
            turn: '$context.turn',
            conversationId: '$context.conversationId',
        }));
        return this;
    }
    lease_tool(toolName, options = {}) {
        this.steps.push(CuratorCoreBuilder.emitEvent('agent:lease:grant', {
            toolName,
            grantee: this.targetUri,
            targetRole: this.targetRole,
            duration: options.duration || '5m',
            maxInvocations: options.maxInvocations,
            conversationId: '$context.conversationId',
        }));
        return this;
    }
    wait_reply(alias = 'reply') {
        this.steps.push(CuratorCoreBuilder.waitEvent('agent:message', alias));
        return this;
    }
    then(handler) {
        const res = handler('$context.reply');
        if (res && typeof res === 'object' && res.type) {
            this.steps.push(res);
        }
        return this;
    }
    build() {
        return CuratorCoreBuilder.seq(`dialog:${this.targetUri}`, ...this.steps);
    }
}
