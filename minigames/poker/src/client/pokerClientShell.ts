/**
 * Poker Client Shell Specification & Configuration.
 * Pure declarative configuration for Texas Hold'em interactive shell:
 * unified commands (table, standings, call, fold, raise, allin, pause, resume, exit).
 */
import {
  createClientShell,
  type ClientShell,
  type CuratorChannel,
  type ShellCommand,
  type ToolAction,
  type ShellContext,
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
export const POKER_WHITELISTED_TOOLS = [
  pokerApplyActionTool,
  pokerHumanSpeechTool,
  pokerGetStandingsTool,
];

/**
 * Pure static view and inspection utilities for Texas Hold'em interactive play.
 * (All dynamic turn actions like call, fold, raise are driven by engine choices).
 */
export const POKER_COMMANDS: ShellCommand<ToolAction>[] = [
  {
    name: 'table',
    aliases: ['view'],
    description: 'Redraw the poker table view',
    execute: (_args, _tokens, ctx) => {
      const state = ctx?.getState?.() as PokerGameState | undefined;
      if (state) console.log(renderTable(state, false));
      return { type: 'HANDLED' };
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
      return { type: 'HANDLED' };
    },
  },
];

/**
 * Declarative configuration for Texas Hold'em ClientShell.
 */
export const POKER_SHELL_CONFIG = {
  commands: POKER_COMMANDS,
  availableTools: POKER_WHITELISTED_TOOLS,
};

export interface CreatePokerClientShellOptions {
  channel?: CuratorChannel;
  actorName?: string;
  getGameState: () => PokerGameState | null;
}

/**
 * Instantiates an interactive ClientShell bound to the declarative Poker Shell Configuration.
 */
export function createPokerClientShell(
  opts: CreatePokerClientShellOptions
): ClientShell<PokerGameState, ToolAction> {
  return createClientShell<PokerGameState, ToolAction>({
    ...POKER_SHELL_CONFIG,
    actorName: opts.actorName,
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
      // 1. Resolve against tools allowed in the CURRENT conversation context
      const conversationTools = ctx?.availableTools || POKER_SHELL_CONFIG.availableTools || [];
      const matched = conversationTools.find(
        (t) => (typeof t === 'string' ? t : t.name) === toolName
      );
      if (!matched) {
        console.log(`\x1b[31m[Context] Tool "${toolName}" is not allowed in the current conversation context.\x1b[0m`);
        return;
      }

      // 2. Execute locally if tool definition object exists in context
      if (typeof matched !== 'string') {
        const state = opts.getGameState();
        if ((matched as any).runAsync) {
          return await (matched as any).runAsync({
            args: { state, ...args },
            toolContext: { state, ...(ctx || {}) },
          });
        }
        if ((matched as any).execute) {
          return await (matched as any).execute({ state, ...args }, { state, ...(ctx || {}) });
        }
      }

      // 3. Remote / Channel tool call dispatch
      if (opts.channel) {
        return await opts.channel.send('curator:tool_call', {
          tool: toolName,
          args,
          tableId: opts.channel.tableId,
          conversationId: ctx?.conversationId,
        });
      }
    },
  });
}
