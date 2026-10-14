import { CuratorCoreBuilder } from './builder/CuratorCoreBuilder.js';
import * as conversations from './builder/conversations/index.js';

export * from './builder/index.js';

/**
 * CuratorBuilder provides unified access to AST core primitives and conversational composables.
 * Core AST construction primitives are housed in `CuratorCoreBuilder`, while speech acts and
 * multi-agent dialog/forum builders reside in `builder/conversations/`.
 */
export class CuratorBuilder extends CuratorCoreBuilder {
  static ask = conversations.ask;
  static propose = conversations.propose;
  static inform = conversations.inform;
  static vote = conversations.vote;
  static synthesize = conversations.synthesize;
  static broadcast = conversations.broadcast;
  static dialog = conversations.dialog;
  static dialogue = conversations.dialogue;
  static forum = conversations.forum;
  static polylogue = conversations.polylogue;
  static enter_forum = conversations.enter_forum;
  static soliloquy = conversations.soliloquy;
  static monologue = conversations.monologue;
  static trialogue = conversations.trialogue;
  static catechism = conversations.catechism;
  static dialectic = conversations.dialectic;
  static apostrophe = conversations.apostrophe;
  static grant_lease = conversations.grant_lease;
  static revoke_lease = conversations.revoke_lease;
  static as_role = conversations.as_role;
  static with_role = conversations.with_role;
  static role = conversations.role;
}
