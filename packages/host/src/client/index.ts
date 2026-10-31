export {
  type CuratorChannel,
  type WebSocketChannelOptions,
  type DirectChannelTarget,
  normalizeWsUrl,
  createWebSocketChannel,
  createDirectChannel,
  ChannelAuthError,
  WS_CLOSE_AUTH_EXPIRED,
} from './curatorChannel.js';

export {
  ClientShell,
  createClientShell,
  promptAction,
  type ClientShellConfig,
  type ShellCommand,
  type ShellContext,
  type CommandOutcome,
  type ToolAction,
  type ChatToolDefinition,
  type CuratorToolDefinition,
  type ReplCommand,
  type ActiveChoice,
} from '../cli/clientShell.js';

export {
  ShellAuthController,
  openInBrowser,
  isAuthRequiredError,
  type ShellAuthOptions,
} from '../cli/shellAuth.js';

export {
  FileIdentityStore,
  defaultIdentityDir,
  deriveLocalUserId,
  validateDisplayName,
  promptDisplayName,
  resolveClientIdentity,
  type ClientIdentity,
  type DisplayNamePromptOptions,
  type ResolveClientIdentityOptions,
} from '../cli/clientIdentity.js';
