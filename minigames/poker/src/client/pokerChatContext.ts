/**
 * Poker Chat Context & Client Shell Configuration.
 * Binds Texas Hold'em domain verbs (/whisper, /banter, /table, /standings, /narratives)
 * and action commands (call, fold, raise, allin, pause, resume, exit) to ClientShell.
 */
import {
  promptGroupChatAction,
  promptGroupChatIntermission,
  printChatHelp,
  askUser,
  ClientShell,
  createClientShell,
  DEFAULT_CHAT_VERBS,
  type ChatParticipant,
  type ChatChoice,
  type GroupChatContext,
  type ChatVerbDefinition,
  type ChatToolDefinition,
  type ChatActionCommand,
  type ClientShellConfig,
} from '../curatorHost.ts';
import type { PlayerAction, PokerGameState } from '../types.ts';
import { renderTable, renderCompactStatus, renderStandings, renderNarratives } from '../ui/tableRenderer.ts';
import { getPokerStandings } from '../plugins/pokerPlugin.ts';

export {
  promptGroupChatAction,
  promptGroupChatIntermission,
  printChatHelp,
  askUser,
  ClientShell,
  createClientShell,
  DEFAULT_CHAT_VERBS,
  type ChatParticipant,
  type ChatChoice,
  type GroupChatContext,
  type ChatVerbDefinition,
  type ChatToolDefinition,
  type ChatActionCommand,
  type ClientShellConfig,
};

export interface CreatePokerChatContextOptions {
  actorName: string;
  getGameState: () => PokerGameState | null;
  onSpeech: (text: string, speechAct: string, targetParticipantId?: string) => Promise<void>;
}

/**
 * Creates standardized GroupChatContext with poker table verbs:
 * - /whisper <player> <msg>
 * - /banter <msg>
 * - /standings (view leaderboard)
 * - /narratives (view subjective inner memory)
 * - /table (redraw current table)
 */
export function createPokerChatContext(opts: CreatePokerChatContextOptions): GroupChatContext {
  return {
    actorName: opts.actorName,
    participants: opts.getGameState()?.players || [],
    defaultSpeechAct: 'TABLE_TALK',
    helpHeader: '=== Poker Table Chat & Interaction Commands ===',
    availableVerbs: [
      {
        name: 'whisper',
        aliases: ['w'],
        description: 'Whisper privately to a player',
        usage: '<player> <msg>',
        speechAct: 'WHISPER',
        directed: true,
      },
      {
        name: 'banter',
        aliases: ['b'],
        description: 'Banter or trash talk to the table',
        usage: '<msg>',
        speechAct: 'BANTER',
      },
      {
        name: 'standings',
        aliases: ['score', 's'],
        description: 'View current chip standings and leaderboard',
        handler: async () => {
          const state = opts.getGameState();
          if (state) {
            const stdRes = getPokerStandings(state);
            console.log(renderStandings(stdRes.standings));
          }
          return true;
        },
      },
      {
        name: 'narratives',
        aliases: ['info', 'n'],
        description: 'View subjective inner narratives & memories',
        handler: async () => {
          const state = opts.getGameState();
          if (state) console.log(renderNarratives(state));
          return true;
        },
      },
      {
        name: 'table',
        aliases: ['view'],
        description: 'Redraw the poker table view',
        handler: async () => {
          const state = opts.getGameState();
          if (state) console.log(renderTable(state, false));
          return true;
        },
      },
    ],
    getState: opts.getGameState,
    actionCommands: [
      {
        name: 'call',
        aliases: ['check', 'c', 'chk'],
        description: 'Match current bet or check',
        parse: () => ({ type: 'CALL' }),
      },
      {
        name: 'fold',
        aliases: ['f'],
        description: 'Fold your hand and forfeit the pot',
        parse: () => ({ type: 'FOLD' }),
      },
      {
        name: 'raise',
        aliases: ['r', 'bet', 'b'],
        syntax: 'raise <amount>',
        usage: '<amount>',
        description: 'Raise the current bet to a specified amount',
        parse: (args, tokens) => {
          const rawAmt = tokens[0] || args;
          const state = opts.getGameState();
          if (!rawAmt) {
            // Default to min raise if no amount specified
            const currentBet = state?.currentBet || 0;
            const minRaise = (state?.minRaise || 20);
            return { type: 'RAISE', amount: currentBet + minRaise };
          }
          const amt = parseInt(rawAmt, 10);
          if (isNaN(amt) || amt <= 0) {
            console.log(`\x1b[31m[Error] Invalid raise amount: "${rawAmt}". Please specify a positive number.\x1b[0m`);
            return null;
          }
          return { type: 'RAISE', amount: amt };
        },
      },
      {
        name: 'allin',
        aliases: ['shove'],
        syntax: 'allin',
        description: 'Bet all remaining chips',
        parse: () => {
          const state = opts.getGameState();
          const activeIdx = state?.activePlayerIdx ?? 0;
          const player = state?.players?.[activeIdx];
          const chips = player?.chips || 0;
          return { type: 'ALL_IN', amount: chips };
        },
      },
      {
        name: 'pause',
        aliases: ['p', 'hold'],
        description: 'Pause the current game session',
        parse: () => ({ type: 'PAUSE' }),
      },
      {
        name: 'resume',
        aliases: ['unpause', 'cont'],
        description: 'Resume a paused game session',
        parse: () => ({ type: 'RESUME' }),
      },
      {
        name: 'exit',
        aliases: ['quit', 'q'],
        description: 'Exit table session safely to terminal',
        parse: () => ({ type: 'EXIT' }),
      },
    ],
    redrawView: () => {
      const state = opts.getGameState();
      if (state) console.log('\n' + renderCompactStatus(state));
    },
    onSpeech: opts.onSpeech,
  };
}
