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
  pokerGetChoicesTool,
  pokerJoinLobbyTool,
  pokerLeaveLobbyTool,
  pokerListTablesTool,
} from '../plugins/pokerPlugin.ts';

export { type ShellCommand, type ToolAction };

/**
 * Actual Curator tools permitted in the Texas Hold'em client shell.
 */
export const POKER_WHITELISTED_TOOLS: (string | CuratorToolDefinition)[] = [
  pokerApplyActionTool,
  pokerHumanSpeechTool,
  pokerGetStandingsTool,
  pokerGetChoicesTool,
  pokerJoinLobbyTool,
  pokerLeaveLobbyTool,
  pokerListTablesTool,
];

/**
 * Static view, control, wagering, and inspection commands for Texas Hold'em interactive play.
 */
export const POKER_COMMANDS: ReplCommand[] = [
  // --- Wagering / Action Commands ---
  {
    name: 'raise',
    usage: '<amount>',
    aliases: ['r'],
    description: 'Raise the current bet to a specified amount (e.g. raise 100 or r 100)',
    execute: async (rawArgs, tokens, ctx) => {
      const amount = parseInt(tokens[0] || rawArgs, 10);
      if (isNaN(amount) || amount <= 0) {
        console.log('\x1b[31mUsage: raise <amount> (e.g. raise 100 or r 100)\x1b[0m');
        return;
      }
      if (ctx.channel) {
        await ctx.channel.send('poker:human_action', { type: 'RAISE', amount });
      }
    },
  },
  {
    name: 'bet',
    usage: '<amount>',
    aliases: ['b'],
    description: 'Place a bet of a specified amount (e.g. bet 50 or b 50)',
    execute: async (rawArgs, tokens, ctx) => {
      const amount = parseInt(tokens[0] || rawArgs, 10);
      if (isNaN(amount) || amount <= 0) {
        console.log('\x1b[31mUsage: bet <amount> (e.g. bet 50 or b 50)\x1b[0m');
        return;
      }
      if (ctx.channel) {
        await ctx.channel.send('poker:human_action', { type: 'BET', amount });
      }
    },
  },
  {
    name: 'call',
    usage: '[amount]',
    aliases: ['c'],
    description: 'Call the current highest bet',
    execute: async (_rawArgs, _tokens, ctx) => {
      if (ctx.channel) {
        await ctx.channel.send('poker:human_action', { type: 'CALL' });
      }
    },
  },
  {
    name: 'check',
    aliases: ['k'],
    description: 'Check and pass action without wagering',
    execute: async (_rawArgs, _tokens, ctx) => {
      if (ctx.channel) {
        await ctx.channel.send('poker:human_action', { type: 'CHECK' });
      }
    },
  },
  {
    name: 'fold',
    aliases: ['f'],
    description: 'Fold your cards and forfeit the pot',
    execute: async (_rawArgs, _tokens, ctx) => {
      if (ctx.channel) {
        await ctx.channel.send('poker:human_action', { type: 'FOLD' });
      }
    },
  },
  {
    name: 'allin',
    aliases: ['all-in', 'shove'],
    description: 'Wager all remaining chips',
    execute: async (_rawArgs, _tokens, ctx) => {
      if (ctx.channel) {
        await ctx.channel.send('poker:human_action', { type: 'ALL_IN' });
      }
    },
  },

  // --- Speech & Discourse Commands ---
  {
    name: 'speak',
    usage: '<actor> <message...>',
    aliases: ['talk', 'say', 'tell'],
    description: 'Address an actor directly (e.g. speak lobby what tables are open? or speak viper nice hand)',
    execute: async (_rawArgs, tokens, ctx) => {
      if (tokens.length < 2) {
        console.log('\x1b[33mUsage: speak <actor> <message> (e.g. speak lobby what tables are open?)\x1b[0m');
        return;
      }
      const targetId = tokens[0];
      const text = tokens.slice(1).join(' ');
      if (ctx.channel) {
        await ctx.channel.send('poker:speech', {
          text,
          speakerName: ctx.actorName || 'You',
          speechAct: 'speak',
          targetId,
        });
      }
    },
  },
  {
    name: 'whisper',
    usage: '<actor> <message...>',
    aliases: ['w', 'pm'],
    description: 'Whisper privately to an actor (e.g. whisper dealer what are the blinds?)',
    execute: async (_rawArgs, tokens, ctx) => {
      if (tokens.length < 2) {
        console.log('\x1b[33mUsage: whisper <actor> <message> (e.g. whisper dealer what are the blinds?)\x1b[0m');
        return;
      }
      const targetId = tokens[0];
      const text = tokens.slice(1).join(' ');
      if (ctx.channel) {
        await ctx.channel.send('poker:speech', {
          text,
          speakerName: ctx.actorName || 'You',
          speechAct: 'whisper',
          targetId,
        });
      }
    },
  },
  {
    name: 'message',
    usage: '[actor] <message...>',
    aliases: ['msg'],
    description: 'Send speech to table or target actor',
    execute: async (rawArgs, tokens, ctx) => {
      if (tokens.length === 0) {
        console.log('\x1b[33mUsage: message [actor] <text>\x1b[0m');
        return;
      }
      let targetId: string | undefined;
      let text = rawArgs;
      if (tokens.length >= 2) {
        targetId = tokens[0];
        text = tokens.slice(1).join(' ');
      }
      if (ctx.channel) {
        await ctx.channel.send('poker:speech', {
          text,
          speakerName: ctx.actorName || 'You',
          speechAct: 'message',
          targetId,
        });
      }
    },
  },

  // --- Context & Actor Inspection ---
  {
    name: 'actors',
    aliases: ['who', 'agents', 'players'],
    description: 'List active actors in this conversation context (users, agents, dealer)',
    execute: async (_rawArgs, _tokens, ctx) => {
      if (ctx.channel) {
        await ctx.channel.send('poker:get_actors');
      }
    },
  },

  // --- Table & State Inspection ---
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
    aliases: ['continue'],
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
    onSpeech: async (text: string, speechAct?: string, targetId?: string) => {
      if (opts.channel) {
        return opts.channel.send('poker:speech', {
          text,
          speakerName: opts.actorName || 'You',
          speechAct: speechAct || 'TABLE_TALK',
          targetId,
        });
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
          return opts.channel.send('poker:speech', {
            text: args.text || args.content,
            speakerName: opts.actorName || 'You',
            speechAct: args.speechAct,
            targetId: args.targetId,
          });
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
