import type { CuratorAstNode, CuratorSequentialNode } from '../../CuratorAst.js';
import { CuratorCoreBuilder } from '../CuratorCoreBuilder.js';

/**
 * Fluent builder for bilateral 1:1 agent dialog sessions.
 */
export class FluentDialogBuilder {
  private steps: CuratorAstNode[] = [];
  public targetUri: string;
  public targetRole?: string;
  public senderRole?: string;

  constructor(targetUriOrOptions: string | { target?: string; role?: string; to_role?: string; as_role?: string }) {
    if (typeof targetUriOrOptions === 'string') {
      if (targetUriOrOptions.startsWith('@role:') || targetUriOrOptions.startsWith('role:')) {
        this.targetRole = targetUriOrOptions.replace(/^@?role:/, '');
        this.targetUri = targetUriOrOptions;
      } else {
        this.targetUri = targetUriOrOptions;
      }
    } else if (typeof targetUriOrOptions === 'object') {
      this.targetRole = targetUriOrOptions.role || targetUriOrOptions.to_role;
      this.targetUri = targetUriOrOptions.target || (this.targetRole ? `@role:${this.targetRole}` : 'dialog_peer');
      this.senderRole = targetUriOrOptions.as_role;
    } else {
      this.targetUri = 'dialog_peer';
    }
  }

  as_role(role: string): this {
    this.senderRole = role;
    return this;
  }

  to_role(role: string): this {
    this.targetRole = role;
    this.targetUri = `@role:${role}`;
    return this;
  }

  say(message: string): this {
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

  propose(options: { topic?: string; patch?: any; [k: string]: any } = {}): this {
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

  lease_tool(toolName: string, options: { duration?: string | number; maxInvocations?: number } = {}): this {
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

  wait_reply(alias = 'reply'): this {
    this.steps.push(CuratorCoreBuilder.waitEvent('agent:message', alias));
    return this;
  }

  then(handler: (replyVar: any) => CuratorAstNode | void): this {
    const res = handler('$context.reply');
    if (res && typeof res === 'object' && (res as any).type) {
      this.steps.push(res as CuratorAstNode);
    }
    return this;
  }

  build(): CuratorSequentialNode {
    return CuratorCoreBuilder.seq(`dialog:${this.targetUri}`, ...this.steps);
  }
}
