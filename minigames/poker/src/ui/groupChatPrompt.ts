/**
 * Re-exports generalized GroupChatPrompt from @curator/host and provides
 * reusable chat context builder for poker game sessions.
 */
import {
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
} from '../curatorHost.ts';
import type { PokerGameState } from '../types.ts';
import { renderTable, renderCompactStatus, renderStandings, renderNarratives } from './tableRenderer.ts';
import { getPokerStandings } from '../plugins/pokerPlugin.ts';

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
    redrawView: () => {
      const state = opts.getGameState();
      if (state) console.log('\n' + renderCompactStatus(state));
    },
    onSpeech: opts.onSpeech,
  };
}
