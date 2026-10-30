/**
 * Blueprint MiniApp Client Shell Specification & Configuration.
 * Pure declarative configuration for the interactive asynchronous SQLite REPL:
 * whitelisted tools (calculate_metric, blueprint_speech), domain inspection commands (calc, status),
 * and ambient speech routing.
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

export const BLUEPRINT_WHITELISTED_TOOLS: (string | CuratorToolDefinition)[] = [
  calculateMetricTool as any,
  blueprintSpeechTool as any,
];

export const BLUEPRINT_COMMANDS: ReplCommand[] = [
  {
    name: 'calc',
    aliases: ['calculate'],
    usage: '<baseValue> [multiplier]',
    description: 'Calculate metrics using the blueprint calculator tool',
    execute: async (_rawArgs, tokens, ctx) => {
      const base = parseFloat(tokens[0] || '10');
      const mult = parseFloat(tokens[1] || '2');
      if (isNaN(base)) {
        console.log('\x1b[31mPlease specify a valid base value (e.g. "calc 10 3")\x1b[0m');
        return;
      }
      if (ctx.onToolCall) {
        const result = await ctx.onToolCall('calculate_metric', { baseValue: base, multiplier: mult }, ctx);
        console.log('\x1b[32m✔ [Metric Result]:\x1b[0m', JSON.stringify(result, null, 2));
      }
    },
  },
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
  onAuthLogin?: ClientShellConfig['onAuthLogin'];
  /** Free text goes here (the assistant agent) instead of the blueprint_speech tool. */
  onChat?: (text: string) => Promise<unknown>;
}

export function createBlueprintClientShell(
  opts: CreateBlueprintClientShellOptions = {}
): ClientShell {
  return createClientShell({
    actorName: opts.actorName || 'User',
    channel: opts.channel,
    defaultToolName: 'blueprint_speech',
    commands: BLUEPRINT_COMMANDS,
    tools: BLUEPRINT_WHITELISTED_TOOLS,
    getState: opts.getState,
    auth: opts.auth,
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
      // 1. Whitelist validation
      const allowed = ctx?.tools || BLUEPRINT_WHITELISTED_TOOLS;
      const matched = allowed.find(
        (t) => (typeof t === 'string' ? t : t.name) === toolName
      );
      if (!matched) {
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
