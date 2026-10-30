/**
 * Blueprint MiniApp Client Shell Specification & Configuration.
 * Pure declarative configuration for the interactive asynchronous SQLite REPL:
 * whitelisted tools (calculate_metric, blueprint_speech), which the shell turns into commands (usage from
 * their schemas, plus the aliases below), the status command, and ambient speech routing.
 */
import {
  createClientShell,
  type ClientShell,
  type CuratorChannel,
  type CuratorToolDefinition,
  type ReplCommand,
  type ShellContext,
  type ClientShellConfig,
} from '@curator/host';
import {
  calculateMetricTool,
  blueprintSpeechTool,
} from '../plugins/demo.js';

/** A tool as a shell command: name, description and schema from the tool, shortcuts added here. */
const asShellTool = (tool: any, aliases: string[] = []): CuratorToolDefinition => ({
  name: tool.name,
  description: tool.description,
  parameters: tool.parameters,
  aliases,
});

export const BLUEPRINT_WHITELISTED_TOOLS: (string | CuratorToolDefinition)[] = [
  asShellTool(calculateMetricTool, ['calc', 'calculate']),
  asShellTool(blueprintSpeechTool, ['say']),
];

export const BLUEPRINT_COMMANDS: ReplCommand[] = [
  {
    name: 'status',
    description: 'Display active Blueprint status and configuration',
    execute: (_rawArgs, _tokens, ctx) => {
      const state = ctx?.getState?.();
      if (state) {
        console.log('\x1b[36m[Blueprint State]\x1b[0m', JSON.stringify(state, null, 2));
      } else {
        console.log('\x1b[36m[Blueprint Status]\x1b[0m Ready and connected.');
      }
    },
  },
];

export interface CreateBlueprintClientShellOptions {
  channel?: CuratorChannel;
  actorName?: string;
  getState?: () => any;
  onMetricResult?: (result: any) => void;
  /** Google sign-in sessions: enables /auth (device flow) and automatic login on auth:required. */
  auth?: ClientShellConfig['auth'];
  /** Remote MCP tools (`mcp.<server>.*`), listed by `tools`. */
  remoteTools?: ClientShellConfig['remoteTools'];
  onAuthLogin?: ClientShellConfig['onAuthLogin'];
  /** Free text goes here (the assistant agent) instead of the blueprint_speech tool. */
  onChat?: (text: string) => Promise<unknown>;
  /** Commands added to BLUEPRINT_COMMANDS (e.g. the assistant's /history). */
  extraCommands?: ReplCommand[];
}

export function createBlueprintClientShell(
  opts: CreateBlueprintClientShellOptions = {}
): ClientShell {
  return createClientShell({
    actorName: opts.actorName || 'User',
    channel: opts.channel,
    defaultToolName: 'blueprint_speech',
    commands: [...BLUEPRINT_COMMANDS, ...(opts.extraCommands ?? [])],
    tools: BLUEPRINT_WHITELISTED_TOOLS,
    getState: opts.getState,
    auth: opts.auth,
    remoteTools: opts.remoteTools,
    autoLogin: Boolean(opts.auth),
    onAuthLogin: opts.onAuthLogin,
    onSpeech: async (text: string) => {
      if (opts.onChat) return opts.onChat(text);
      if (opts.channel) {
        return opts.channel.send('curator:tool_call', {
          tool: 'blueprint_speech',
          args: { text },
        });
      }
      console.log(`\x1b[90m[Speech Echo]\x1b[0m "${text}"`);
    },
    onToolCall: async (toolName: string, args: Record<string, any>, ctx?: ShellContext) => {
      // 1. Whitelist validation: the shell's tools plus the registered remote tools (the host still checks roles)
      const allowed = ctx?.tools || BLUEPRINT_WHITELISTED_TOOLS;
      const matched = allowed.find(
        (t) => (typeof t === 'string' ? t : t.name) === toolName
      );
      const remote = matched ? undefined : (await opts.remoteTools?.())?.find((t) => t.name === toolName);
      if (!matched && !remote) {
        console.log(`\x1b[31m[Security] Tool "${toolName}" is not whitelisted.\x1b[0m`);
        return;
      }

      // 2. Channel dispatch — the host executes the call as a Request (no direct local execution)
      if (opts.channel) {
        return opts.channel.send('curator:tool_call', {
          tool: toolName,
          args,
        });
      }
    },
  });
}
