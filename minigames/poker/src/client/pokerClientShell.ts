/**
 * Poker Client Shell Specification & Configuration.
 * Pure declarative configuration for Texas Hold'em interactive shell:
 * whitelisted tools (poker_apply_action, poker_human_speech, poker_get_standings),
 * inspection commands (table, standings, pause, resume), and free-text speech routing.
 */
import {
  createClientShell,
  type ClientShell,
  type CuratorChannel,
  type ShellCommand,
  type ToolAction,
  type ShellContext,
  type CuratorToolDefinition,
  type ReplCommand,
} from '../curatorHost.ts';
import type { PokerGameState } from '../types.ts';
import { renderTable, renderCompactStatus, renderStandings } from '../ui/tableRenderer.ts';
import {
  pokerApplyActionTool,
  pokerHumanSpeechTool,
  pokerGetStandingsTool,
} from '../plugins/pokerPlugin.ts';

export { type ShellCommand, type ToolAction };

/**
 * Actual Curator tools permitted in the Texas Hold'em client shell.
 */
export const POKER_WHITELISTED_TOOLS: (string | CuratorToolDefinition)[] = [
  pokerApplyActionTool,
  pokerHumanSpeechTool,
  pokerGetStandingsTool,
];

/**
 * Static view, control, and inspection commands for Texas Hold'em interactive play.
 */
export const POKER_COMMANDS: ReplCommand[] = [
  {
    name: 'table',
    aliases: ['view', 't'],
    description: 'Redraw the poker table view',
    execute: (_args, _tokens, ctx) => {
      const state = ctx?.getState?.() as PokerGameState | undefined;
      if (state) console.log(renderTable(state, false));
    },
  },
  {
    name: 'standings',
    aliases: ['score', 's'],
    description: 'View current chip standings and leaderboard',
    execute: async (_args, _tokens, ctx) => {
      const state = ctx?.getState?.() as PokerGameState | undefined;
      const res = (await pokerGetStandingsTool.runAsync({
        args: { state },
        toolContext: ctx as any,
      })) as any;
      if (res?.standings) {
        console.log(renderStandings(res.standings));
      }
    },
  },
  {
    name: 'pause',
    description: 'Pause the current poker table game loop',
    execute: async (_args, _tokens, ctx) => {
      if (ctx.channel) {
        await ctx.channel.send('poker:pause');
        console.log('\x1b[33m[Table] Pause requested...\x1b[0m');
      }
    },
  },
  {
    name: 'resume',
    aliases: ['continue', 'c', 'r'],
    description: 'Resume a paused poker table game loop',
    execute: async (_args, _tokens, ctx) => {
      if (ctx.channel) {
        await ctx.channel.send('poker:resume');
        console.log('\x1b[32m[Table] Resuming game loop...\x1b[0m');
      }
    },
  },
];

export interface CreatePokerClientShellOptions {
  channel?: CuratorChannel;
  actorName?: string;
  getGameState: () => PokerGameState | null;
}

/**
 * Instantiates an asynchronous, non-blocking ClientShell bound to the Texas Hold'em configuration.
 */
export function createPokerClientShell(
  opts: CreatePokerClientShellOptions
): ClientShell<PokerGameState, ToolAction> {
  return createClientShell<PokerGameState, ToolAction>({
    actorName: opts.actorName || 'You',
    channel: opts.channel,
    defaultToolName: 'poker_human_speech',
    commands: POKER_COMMANDS,
    tools: POKER_WHITELISTED_TOOLS,
    getState: opts.getGameState,
    redrawView: () => {
      const state = opts.getGameState();
      if (state) console.log('\n' + renderCompactStatus(state));
    },
    onSpeech: async (text: string) => {
      if (opts.channel) {
        return opts.channel.send('poker:speech', { text });
      }
    },
    onToolCall: async (toolName: string, args: Record<string, any>, ctx?: ShellContext) => {
      // 1. Whitelist validation
      const conversationTools = ctx?.tools || ctx?.availableTools || POKER_WHITELISTED_TOOLS;
      const matched = conversationTools.find(
        (t) => (typeof t === 'string' ? t : t.name) === toolName
      );
      if (!matched) {
        console.log(`\x1b[31m[Context] Tool "${toolName}" is not allowed in the current conversation context.\x1b[0m`);
        return;
      }

      // 2. Direct channel / WebSocket dispatch
      if (opts.channel) {
        if (toolName === 'poker_apply_action') {
          return opts.channel.send('poker:human_action', args.action || args);
        }
        if (toolName === 'poker_human_speech') {
          return opts.channel.send('poker:speech', { text: args.text || args.content });
        }
        return opts.channel.send('curator:tool_call', {
          tool: toolName,
          args,
          tableId: opts.channel.tableId,
          conversationId: ctx?.conversationId,
        });
      }
    },
  });
}
