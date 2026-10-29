import type { CuratorAstNode, CuratorSequentialNode } from '../../CuratorAst.js';
import { CuratorCoreBuilder } from '../CuratorCoreBuilder.js';
import { FluentDialogBuilder } from './FluentDialogBuilder.js';
import { FluentForumBuilder } from './FluentForumBuilder.js';
import { vocabularyRegistry } from '../VocabularyRegistry.js';
import type {
  AskOptions,
  ProposeOptions,
  InformOptions,
  VoteOptions,
  SynthesizeOptions,
  BroadcastOptions,
} from './types.js';

/**
 * Functional SpeechAct Composables.
 * Can be used directly or bound into CoffeeScript sandbox contexts.
 */

export function ask(options: AskOptions): CuratorSequentialNode {
  const alias = options.as || 'answer';
  const targetRole = options.targetRole || options.role || options.to_role;
  const target = options.to || (targetRole ? `@role:${targetRole}` : 'network');
  const senderRole = options.senderRole || options.as_role;

  return CuratorCoreBuilder.seq(
    `ask:${target}`,
    CuratorCoreBuilder.setState({ turn: '$context.turn + 1' }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'qa',
      speechAct: 'QUERY',
      target,
      targetRole,
      senderRole: senderRole || '$context.senderRole',
      payload: { query: options.query, timeout: options.timeout },
      turn: '$context.turn',
      conversationId: '$context.conversationId',
    }),
    CuratorCoreBuilder.waitEvent('agent:message', alias)
  );
}

export function propose(options: ProposeOptions): CuratorSequentialNode {
  const targetRole = options.targetRole || options.role || options.to_role;
  const target = options.to || (targetRole ? `@role:${targetRole}` : options.in_forum);
  const senderRole = options.senderRole || options.as_role;

  const steps: CuratorAstNode[] = [
    CuratorCoreBuilder.setState({
      turn: '$context.turn + 1',
      activeTopic: options.topic || options.in_forum,
      proposalStatus: 'PROPOSED',
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: options.in_forum ? 'forum' : 'dialog',
      speechAct: 'PROPOSE',
      target,
      targetRole,
      senderRole: senderRole || '$context.senderRole',
      payload: options,
      turn: '$context.turn',
      conversationId: options.in_forum || '$context.conversationId',
    }),
    CuratorCoreBuilder.waitEvent('agent:message', 'decision'),
  ];

  if (options.on_accept || options.on_reject) {
    const thenRes = options.on_accept ? options.on_accept('$context.decision') : undefined;
    const elseRes = options.on_reject ? options.on_reject('$context.decision') : undefined;
    const thenNode: CuratorAstNode | undefined = (thenRes && typeof thenRes === 'object' && (thenRes as any).type) ? (thenRes as CuratorAstNode) : undefined;
    const elseNode: CuratorAstNode | undefined = (elseRes && typeof elseRes === 'object' && (elseRes as any).type) ? (elseRes as CuratorAstNode) : undefined;
    if (thenNode || elseNode) {
      steps.push(CuratorCoreBuilder.ifElse(
        "context.decision && context.decision.speechAct === 'ACCEPT'",
        thenNode || CuratorCoreBuilder.setState({}),
        elseNode
      ));
    }
  }

  return CuratorCoreBuilder.seq(`propose:${options.topic || target || 'topic'}`, ...steps);
}

export function inform(options: InformOptions): CuratorSequentialNode {
  const targetRole = options.targetRole || options.role || options.to_role;
  const target = options.to || (targetRole ? `@role:${targetRole}` : (options.in_forum || options.topic));
  const senderRole = options.senderRole || options.as_role;

  return CuratorCoreBuilder.seq(
    `inform:${target || 'target'}`,
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: options.in_forum ? 'forum' : 'dialog',
      speechAct: 'INFORM',
      target,
      roomUri: options.in_forum,
      targetRole,
      senderRole: senderRole || '$context.senderRole',
      topic: options.topic,
      payload: options.payload,
      turn: '$context.turn',
      conversationId: options.in_forum || '$context.conversationId',
    })
  );
}

export function vote(options: VoteOptions): CuratorSequentialNode {
  const senderRole = options.senderRole || options.as_role;
  const { ballot, rationale, ...extra } = options;
  return CuratorCoreBuilder.seq(
    `vote:${options.in_forum}`,
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'VOTE',
      roomUri: options.in_forum,
      senderRole: senderRole || '$context.senderRole',
      payload: { ...extra, ballot, rationale },
      turn: '$context.turn',
      conversationId: options.in_forum,
    })
  );
}

export function synthesize(options: SynthesizeOptions): CuratorSequentialNode {
  const senderRole = options.senderRole || options.as_role;
  return CuratorCoreBuilder.seq(
    `synthesize:${options.in_forum}`,
    CuratorCoreBuilder.setState({
      forumStatus: 'CONCLUDED',
      conclusion: options.conclusion || options.summary,
    }),
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'forum',
      speechAct: 'SYNTHESIZE',
      roomUri: options.in_forum,
      senderRole: senderRole || '$context.senderRole',
      payload: options,
      turn: '$context.turn',
      conversationId: options.in_forum,
    })
  );
}

export function broadcast(options: BroadcastOptions): CuratorSequentialNode {
  const targetRole = options.targetRole || options.to_role;
  const senderRole = options.senderRole || options.as_role;

  return CuratorCoreBuilder.seq(
    `broadcast:${options.topic}`,
    CuratorCoreBuilder.emitEvent('agent:message', {
      conversationType: 'monolog',
      speechAct: 'INFORM',
      recipients: '*',
      targetRole,
      senderRole: senderRole || '$context.senderRole',
      topic: options.topic,
      payload: options,
      turn: '$context.turn',
      conversationId: '$context.conversationId',
    })
  );
}

export function dialog(targetUriOrOptions: string | { target?: string; role?: string; to_role?: string; as_role?: string }): FluentDialogBuilder {
  return new FluentDialogBuilder(targetUriOrOptions);
}

export function dialogue(targetUriOrOptions: string | { target?: string; role?: string; to_role?: string; as_role?: string }): FluentDialogBuilder {
  return new FluentDialogBuilder(targetUriOrOptions);
}

export function forum(roomUri: string): FluentForumBuilder {
  return new FluentForumBuilder(roomUri);
}

export function polylogue(roomUri: string): FluentForumBuilder {
  return new FluentForumBuilder(roomUri);
}

export function enter_forum(roomUri: string, options: any = {}): FluentForumBuilder {
  const role = typeof options === 'string' ? options : (options.role || 'participant');
  const name = typeof options === 'object' ? options.name : undefined;
  const f = new FluentForumBuilder(roomUri);
  f.join({ role, name });
  return f;
}

/**
 * Scopes conversational actions within an abstract conversational / communicative role.
 * Sets $context.senderRole and executes subsequent turns under that role contract.
 * Decoupled from RBAC/permission roles.
 */
export function as_role(
  roleName: string,
  actionsOrFn?: CuratorAstNode | ((role: string) => CuratorAstNode | void)
): CuratorSequentialNode {
  const steps: CuratorAstNode[] = [
    CuratorCoreBuilder.setState({ senderRole: roleName }),
  ];

  if (typeof actionsOrFn === 'function') {
    const res = actionsOrFn(roleName);
    if (res && typeof res === 'object' && (res as any).type) {
      steps.push(res as CuratorAstNode);
    } else if (res && typeof res === 'object' && typeof (res as any).build === 'function') {
      steps.push((res as any).build());
    }
  } else if (actionsOrFn && typeof actionsOrFn === 'object') {
    if ((actionsOrFn as any).type) {
      steps.push(actionsOrFn as CuratorAstNode);
    } else if (typeof (actionsOrFn as any).build === 'function') {
      steps.push((actionsOrFn as any).build());
    }
  }

  return CuratorCoreBuilder.seq(`role:${roleName}`, ...steps);
}

export const with_role = as_role;

/**
 * Pre-binds conversational speech acts to a specific communicative role.
 */
export function role(roleName: string) {
  return {
    roleName,
    ask: (options: AskOptions | string) => {
      const opts: AskOptions = typeof options === 'string' ? { query: options } : options;
      return ask({ ...opts, as_role: roleName });
    },
    propose: (options: ProposeOptions) => propose({ ...options, as_role: roleName }),
    inform: (options: InformOptions) => inform({ ...options, as_role: roleName }),
    vote: (options: VoteOptions) => vote({ ...options, as_role: roleName }),
    synthesize: (options: SynthesizeOptions) => synthesize({ ...options, as_role: roleName }),
    dialog: (targetUriOrOptions: string | any) => {
      const b = new FluentDialogBuilder(targetUriOrOptions);
      b.as_role(roleName);
      return b;
    },
    forum: (roomUri: string) => {
      const f = new FluentForumBuilder(roomUri);
      f.as_role(roleName);
      return f;
    },
    enter_forum: (roomUri: string, options: any = {}) => {
      const f = new FluentForumBuilder(roomUri);
      const name = typeof options === 'object' ? options.name : undefined;
      f.join({ role: roleName, name });
      return f;
    },
  };
}

/**
 * Soliloquy: 1 -> Self / unseen
 * Reveals internal reasoning, dilemmas, and scratchpad reflections.
 */
export function soliloquy(thought: string | Record<string, any>): CuratorSequentialNode {
  const payload = typeof thought === 'string' ? { internalThought: thought } : thought;
  return CuratorCoreBuilder.seq(
    'soliloquy',
    CuratorCoreBuilder.setState({
      turn: '$context.turn + 1',
      lastSoliloquy: payload,
    }),
    CuratorCoreBuilder.emitEvent('agent:soliloquy', {
      communicationForm: 'soliloquy',
      turnDynamics: 'private_reflection',
      intent: 'introspective',
      speechAct: 'INFORM',
      target: 'self',
      payload,
      turn: '$context.turn',
      conversationId: '$context.conversationId',
    })
  );
}

/**
 * Monologue: 1 -> Present audience
 * Delivers an assertive narrative, speech, or lesson to listening peers.
 */
export function monologue(topic: string, narrative: any): CuratorSequentialNode {
  return CuratorCoreBuilder.seq(
    `monologue:${topic}`,
    CuratorCoreBuilder.emitEvent('mesh:agent:message', {
      conversationType: 'monolog',
      communicationForm: 'monologue',
      turnDynamics: 'broadcast',
      intent: 'narrative',
      speechAct: 'INFORM',
      recipients: '*',
      topic,
      payload: typeof narrative === 'string' ? { narrative } : narrative,
      turn: '$context.turn',
      conversationId: '$context.conversationId',
    })
  );
}

/**
 * Trialogue: 3 <-> Each other
 * Triangulate perspectives, mediate disputes, or negotiate between three parties.
 */
export function trialogue(agentB: string, agentC: string, topic?: string): CuratorSequentialNode {
  return CuratorCoreBuilder.seq(
    `trialogue:${topic || 'triad'}`,
    CuratorCoreBuilder.setState({ turn: '$context.turn + 1', triadParticipants: [agentB, agentC] }),
    CuratorCoreBuilder.emitEvent('mesh:agent:message', {
      conversationType: 'forum',
      communicationForm: 'trialogue',
      turnDynamics: 'triangulated',
      intent: 'deliberative',
      speechAct: 'PROPOSE',
      recipients: [{ agentId: agentB }, { agentId: agentC }],
      topic,
      payload: { triadTopic: topic },
      turn: '$context.turn',
      conversationId: '$context.conversationId',
    })
  );
}

/**
 * Catechism / Q&A: 2+ -> Asymmetric pair
 * Inquire, evaluate, or interrogate via question-and-answer pairs.
 */
export function catechism(targetUri: string, queryOrOptions: string | AskOptions): CuratorSequentialNode {
  const opts: AskOptions = typeof queryOrOptions === 'string'
    ? { to: targetUri, query: queryOrOptions }
    : { ...queryOrOptions, to: targetUri };
  return ask(opts);
}

/**
 * Dialectic: 2+ -> Collaborative
 * Resolves tension between opposing truths via Thesis -> Antithesis -> Synthesis.
 */
export function dialectic(options: {
  topic: string;
  thesis: any;
  antithesis: any;
  synthesizer?: (thesis: any, antithesis: any) => any;
}): CuratorSequentialNode {
  return CuratorCoreBuilder.seq(
    `dialectic:${options.topic}`,
    CuratorCoreBuilder.setState({
      dialecticTopic: options.topic,
      thesis: options.thesis,
      turn: '$context.turn + 1',
    }),
    CuratorCoreBuilder.emitEvent('mesh:agent:message', {
      communicationForm: 'dialectic',
      turnDynamics: 'thesis_antithesis_synthesis',
      intent: 'synthetic',
      speechAct: 'PROPOSE',
      topic: `${options.topic}:thesis`,
      payload: options.thesis,
      turn: '$context.turn',
    }),
    CuratorCoreBuilder.setState({
      antithesis: options.antithesis,
      turn: '$context.turn + 1',
    }),
    CuratorCoreBuilder.emitEvent('mesh:agent:message', {
      communicationForm: 'dialectic',
      turnDynamics: 'thesis_antithesis_synthesis',
      intent: 'synthetic',
      speechAct: 'PROPOSE',
      topic: `${options.topic}:antithesis`,
      payload: options.antithesis,
      turn: '$context.turn',
    }),
    CuratorCoreBuilder.emitEvent('mesh:agent:message', {
      communicationForm: 'dialectic',
      turnDynamics: 'thesis_antithesis_synthesis',
      intent: 'synthetic',
      speechAct: 'SYNTHESIZE',
      topic: `${options.topic}:synthesis`,
      payload: { resolution: 'Synthesizing dialectical tension' },
      turn: '$context.turn + 1',
    })
  );
}

/**
 * Apostrophe: 1 -> Inanimate / Absent
 * Directs an invocation, persistent declaration, or conviction to an absent entity or audit ledger.
 */
export function apostrophe(absentEntity: string, assertion: any): CuratorSequentialNode {
  const payload = typeof assertion === 'string' ? { assertion } : assertion;
  return CuratorCoreBuilder.seq(
    `apostrophe:${absentEntity}`,
    CuratorCoreBuilder.emitEvent('agent:apostrophe', {
      communicationForm: 'apostrophe',
      turnDynamics: 'one_way_invocation',
      intent: 'assertive',
      speechAct: 'INFORM',
      target: absentEntity,
      payload,
      turn: '$context.turn',
      conversationId: '$context.conversationId',
    })
  );
}

/**
 * Grant Lease: Grants an ephemeral tool capability lease to a specific peer or agent.
 */
export function grant_lease(options: {
  to: string;
  tool: string;
  duration?: string | number;
  maxInvocations?: number;
  conversationId?: string;
}): CuratorSequentialNode {
  return CuratorCoreBuilder.seq(
    `grant_lease:${options.tool}->${options.to}`,
    CuratorCoreBuilder.emitEvent('agent:lease:grant', {
      toolName: options.tool,
      grantee: options.to,
      duration: options.duration || '5m',
      maxInvocations: options.maxInvocations,
      conversationId: options.conversationId || '$context.conversationId',
    })
  );
}

/**
 * Revoke Lease: Immediately revokes an active tool capability lease.
 */
export function revoke_lease(options: {
  to?: string;
  tool?: string;
  leaseId?: string;
  conversationId?: string;
}): CuratorSequentialNode {
  return CuratorCoreBuilder.seq(
    `revoke_lease:${options.leaseId || options.tool || 'lease'}`,
    CuratorCoreBuilder.emitEvent('agent:lease:revoke', {
      leaseId: options.leaseId,
      toolName: options.tool,
      grantee: options.to,
      conversationId: options.conversationId || '$context.conversationId',
    })
  );
}

export const conversationalVerbs = {
  ask,
  propose,
  inform,
  vote,
  synthesize,
  broadcast,
  dialog,
  dialogue,
  forum,
  polylogue,
  enter_forum,
  soliloquy,
  monologue,
  trialogue,
  catechism,
  dialectic,
  apostrophe,
  grant_lease,
  revoke_lease,
  as_role,
  with_role,
  role,
};

export class CuratorConversationalBuilder {
  static ask = ask;
  static propose = propose;
  static inform = inform;
  static vote = vote;
  static synthesize = synthesize;
  static broadcast = broadcast;
  static dialog = dialog;
  static dialogue = dialogue;
  static forum = forum;
  static polylogue = polylogue;
  static enter_forum = enter_forum;
  static soliloquy = soliloquy;
  static monologue = monologue;
  static trialogue = trialogue;
  static catechism = catechism;
  static dialectic = dialectic;
  static apostrophe = apostrophe;
  static grant_lease = grant_lease;
  static revoke_lease = revoke_lease;
  static as_role = as_role;
  static with_role = with_role;
  static role = role;
}

// Automatically register standard conversational speech acts into vocabularyRegistry
vocabularyRegistry.registerMany(conversationalVerbs);
