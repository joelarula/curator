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
import {
  type PokerGameState,
  PokerActionType,
  PokerSpeechAct,
  PokerEvent,
  PokerTool,
} from '../types.ts';
import { renderTable, renderCompactStatus, renderStandings } from '../ui/tableRenderer.ts';
import {
  pokerApplyActionTool,
  pokerHumanSpeechTool,
  pokerGetStandingsTool,
  pokerGetChoicesTool,
  pokerJoinLobbyTool,
  pokerLeaveLobbyTool,
  pokerListTablesTool,
  pokerCreateTableTool,
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
  pokerCreateTableTool,
];

/**
 * Static view, discourse, control, and inspection commands for Texas Hold'em interactive play.
 * Note: Turn-specific wagering actions (raise, bet, call, check, fold, all-in) are dynamically
 * mounted as first-class Commander subshell commands from the engine's legal choices.
 */
export const POKER_COMMANDS: ReplCommand[] = [

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
        await ctx.channel.send(PokerEvent.SPEECH, {
          text,
          speakerName: ctx.actorName || 'You',
          speechAct: PokerSpeechAct.TABLE_TALK,
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
        await ctx.channel.send(PokerEvent.SPEECH, {
          text,
          speakerName: ctx.actorName || 'You',
          speechAct: PokerSpeechAct.WHISPER,
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
        await ctx.channel.send(PokerEvent.SPEECH, {
          text,
          speakerName: ctx.actorName || 'You',
          speechAct: targetId ? PokerSpeechAct.WHISPER : PokerSpeechAct.TABLE_TALK,
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
        await ctx.channel.send(PokerEvent.GET_ACTORS);
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
    name: 'status',
    description: 'Display readable player, table, and connection overview',
    execute: (_args, _tokens, ctx) => {
      const state = ctx?.getState?.() as any;
      const isLobby = !state || state.phase === 'LOBBY' || !state.table;
      console.log('\n\x1b[1m\x1b[36m=== Poker Lounge Status ===\x1b[0m');
      console.log(`  \x1b[33mPlayer:\x1b[0m     ${ctx?.actorName || 'You'}`);
      console.log(`  \x1b[33mTable:\x1b[0m      #${ctx?.channel?.tableId || state?.tableId || '1'}`);
      console.log(`  \x1b[33mPhase:\x1b[0m      ${state?.phase || (isLobby ? 'LOBBY' : 'GAME')}`);
      console.log(`  \x1b[33mConnection:\x1b[0m \x1b[32mOnline\x1b[0m`);
      if (!isLobby && state?.currentStreet) {
        console.log(`  \x1b[33mStreet:\x1b[0m     ${state.currentStreet} (Hand #${state.handNumber || 1})`);
        console.log(`  \x1b[33mPot:\x1b[0m        $${state.pot || 0}`);
      }
      console.log('');
    },
  },
  {
    name: 'pause',
    description: 'Pause the current poker table game loop',
    execute: async (_args, _tokens, ctx) => {
      if (ctx.channel) {
        await ctx.channel.send(PokerEvent.HUMAN_ACTION, { type: PokerActionType.PAUSE });
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
        await ctx.channel.send(PokerEvent.RESUME_ACTION, { type: PokerActionType.RESUME });
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
    defaultToolName: PokerTool.HUMAN_SPEECH,
    commands: POKER_COMMANDS,
    tools: POKER_WHITELISTED_TOOLS,
    getState: opts.getGameState,
    redrawView: () => {
      const state = opts.getGameState();
      if (state) console.log('\n' + renderCompactStatus(state));
    },
    onSpeech: async (text: string, speechAct?: string, targetId?: string) => {
      if (opts.channel) {
        return opts.channel.send(PokerEvent.SPEECH, {
          text,
          speakerName: opts.actorName || 'You',
          speechAct: speechAct || (targetId ? PokerSpeechAct.WHISPER : PokerSpeechAct.TABLE_TALK),
          targetId,
        });
      }
    },
    onAction: async (action: any) => {
      if (opts.channel) {
        if (action?.type === PokerActionType.EXIT) {
          console.log('\n\x1b[33m[Game] Exiting table session...\x1b[0m');
          await opts.channel.send(PokerEvent.HUMAN_ACTION, action);
          await opts.channel.close();
          return;
        }
        return opts.channel.send(PokerEvent.HUMAN_ACTION, action);
      }
    },
    onChoice: async (choice: any) => {
      if (opts.channel) {
        if (choice?.event) {
          return opts.channel.send(choice.event, choice.payload || choice.value || choice);
        }
        const cId = choice?.id || choice?.tableId;
        if (cId === 'new' || cId === 'resume' || cId === 'exit') {
          return opts.channel.send(PokerEvent.LOBBY_CHOICE, { id: cId });
        }
        if (cId) {
          return opts.channel.send(PokerEvent.TABLE_SELECTED, { id: cId });
        }
        return opts.channel.send('curator:choice', { choice });
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
        if (toolName === PokerTool.APPLY_ACTION) {
          return opts.channel.send(PokerEvent.HUMAN_ACTION, args.action || args);
        }
        if (toolName === PokerTool.HUMAN_SPEECH) {
          return opts.channel.send(PokerEvent.SPEECH, {
            text: args.text || args.content,
            speakerName: opts.actorName || 'You',
            speechAct: args.speechAct,
            targetId: args.targetId,
          });
        }
        if ((opts.channel as any)?.runTool) {
          return await (opts.channel as any).runTool(toolName, args);
        }
        return opts.channel.send(PokerEvent.TOOL_CALL, {
          tool: toolName,
          args,
          tableId: opts.channel.tableId,
          conversationId: ctx?.conversationId,
        });
      }
    },
  });
}
