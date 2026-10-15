/**
 * Re-exports generalized GroupChatPrompt from @curator/host.
 * MiniApps inherit generalized prompt action & intermission handling with
 * dynamic speech acts, verbs, and tools configured per conversation/session.
 */
export {
  promptGroupChatAction,
  promptGroupChatIntermission,
  printChatHelp,
  askUser,
  DEFAULT_CHAT_VERBS,
  type ChatParticipant,
  type ChatChoice,
  type GroupChatContext,
  type ChatVerbDefinition,
  type ChatToolDefinition,
} from '@curator/host';
