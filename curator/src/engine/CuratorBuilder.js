import { CuratorCoreBuilder } from './builder/CuratorCoreBuilder.js';
import * as conversations from './builder/conversations/index.js';
export * from './builder/index.js';
/**
 * CuratorBuilder provides unified access to AST core primitives and conversational composables.
 * Core AST construction primitives are housed in `CuratorCoreBuilder`, while speech acts and
 * multi-agent dialog/forum builders reside in `builder/conversations/`.
 */
export class CuratorBuilder extends CuratorCoreBuilder {
}
CuratorBuilder.ask = conversations.ask;
CuratorBuilder.propose = conversations.propose;
CuratorBuilder.inform = conversations.inform;
CuratorBuilder.vote = conversations.vote;
CuratorBuilder.synthesize = conversations.synthesize;
CuratorBuilder.broadcast = conversations.broadcast;
CuratorBuilder.dialog = conversations.dialog;
CuratorBuilder.dialogue = conversations.dialogue;
CuratorBuilder.forum = conversations.forum;
CuratorBuilder.polylogue = conversations.polylogue;
CuratorBuilder.enter_forum = conversations.enter_forum;
CuratorBuilder.soliloquy = conversations.soliloquy;
CuratorBuilder.monologue = conversations.monologue;
CuratorBuilder.trialogue = conversations.trialogue;
CuratorBuilder.catechism = conversations.catechism;
CuratorBuilder.dialectic = conversations.dialectic;
CuratorBuilder.apostrophe = conversations.apostrophe;
CuratorBuilder.grant_lease = conversations.grant_lease;
CuratorBuilder.revoke_lease = conversations.revoke_lease;
CuratorBuilder.as_role = conversations.as_role;
CuratorBuilder.with_role = conversations.with_role;
CuratorBuilder.role = conversations.role;
