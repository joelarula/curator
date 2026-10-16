import readline from 'node:readline';
import { WebSocket } from 'ws';
import {
  renderTable,
  renderCompactStatus,
  renderNarratives,
  renderStandings,
  formatCard,
} from '../ui/tableRenderer.js';
import { getPokerStandings } from '../engine/pokerEngine.js';
import {
  promptGroupChatAction,
  askUser,
  type ChatChoice,
  type GroupChatContext,
} from '../ui/groupChatPrompt.js';
import type { PlayerAction, PokerGameState } from '../types.js';

export interface PokerClientOptions {
  serverUrl?: string;
  playerName?: string;
}

export function normalizeWsUrl(inputUrl?: string): string {
  const base = (inputUrl || process.env.POKER_SERVER_URL || 'http://127.0.0.1:4000').replace(/\/+$/, '');
  let wsOrigin = base;
  if (wsOrigin.startsWith('http://')) {
    wsOrigin = wsOrigin.replace(/^http:\/\//, 'ws://');
  } else if (wsOrigin.startsWith('https://')) {
    wsOrigin = wsOrigin.replace(/^https:\/\//, 'wss://');
  } else if (!wsOrigin.startsWith('ws://') && !wsOrigin.startsWith('wss://')) {
    wsOrigin = `ws://${wsOrigin}`;
  }
  return wsOrigin.endsWith('/api/events') ? wsOrigin : `${wsOrigin}/api/events`;
}

/**
 * Pure Poker CLI Client.
 * Communicates exclusively with the Poker Server via WebSockets.
 * Zero direct database access or local game engine loops.
 */
export async function runPokerClient(options: PokerClientOptions = {}): Promise<void> {
  const wsUrl = normalizeWsUrl(options.serverUrl);
  const playerName = options.playerName || 'You';

  console.clear();
  console.log('\x1b[1m\x1b[36m=== Curator Texas Hold\'em Network Client ===\x1b[0m');
  console.log(`\x1b[90mConnecting to Curator Poker Server at ${wsUrl}...\x1b[0m\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch (err: any) {
      console.error(`\x1b[31mFailed to connect to ${wsUrl}: ${err.message}\x1b[0m`);
      rl.close();
      resolve();
      return;
    }

    let currentGameState: PokerGameState | null = null;
    let isWaitingForTurn = false;

    const cleanup = () => {
      rl.close();
      try {
        ws.close();
      } catch (_) {}
      resolve();
    };

    process.on('SIGINT', () => {
      console.log('\n\x1b[33m[Client] Disconnecting from table...\x1b[0m');
      cleanup();
    });

    ws.on('open', () => {
      console.log('\x1b[32m✔ Connected to table stream.\x1b[0m');
      console.log('\x1b[90mWaiting for dealer to start hand...\x1b[0m\n');
    });

    ws.on('error', (err: any) => {
      console.error(`\x1b[31m[WebSocket Error] ${err?.message || err}\x1b[0m`);
    });

    ws.on('close', () => {
      console.log('\n\x1b[33m[Client] Disconnected from server.\x1b[0m');
      cleanup();
    });

    ws.on('message', async (raw: any) => {
      let event: any;
      try {
        event = JSON.parse(raw.toString());
      } catch {
        return;
      }

      const { type, payload } = event;

      // Update cached state if payload carries gameState
      if (payload?.gameState) {
        currentGameState = payload.gameState;
      } else if (payload?.state) {
        currentGameState = payload.state;
      }

      switch (type) {
        case 'connected':
          break;

        case 'poker:lobby_ready':
          console.log(`\x1b[32m✔ Lobby ready: Table #${payload?.tableId}\x1b[0m`);
          break;

        case 'poker:new_round':
          console.log(`\n\x1b[1m\x1b[36m--- Hand #${payload?.handNumber} Starting ---\x1b[0m`);
          break;

        case 'poker:phase_deal':
        case 'poker:phase_street': {
          const street = payload?.street || 'FLOP';
          const boardStr = currentGameState?.board?.map((c) => formatCard(c)).join(' ') || '';
          const potStr = currentGameState ? ` (Pot: $${currentGameState.pot})` : '';
          console.log(`\n\x1b[1m\x1b[36m[DEALER] Dealing ${street}: ${boardStr}${potStr}\x1b[0m`);
          break;
        }

        case 'poker:action_taken': {
          const pName = payload?.player || 'Player';
          const act = payload?.action?.type || payload?.action || 'ACT';
          const amt = payload?.action?.amount ? ` $${payload.action.amount}` : '';
          console.log(`\x1b[33m▶ ${pName}: ${act}${amt}\x1b[0m`);
          break;
        }

        case 'poker:speech_response': {
          const spk = payload?.speaker || 'Player';
          const act = payload?.speechAct || 'TABLE_TALK';
          console.log(`\x1b[35m[${act}] ${spk}: "${payload?.text}"\x1b[0m`);
          if (payload?.aiReply) {
            console.log(`\x1b[36m[REPLY] "${payload.aiReply}"\x1b[0m`);
          }
          break;
        }

        case 'poker:phase_settle':
        case 'poker:showdown':
          console.log(`\n\x1b[1m\x1b[32m✔ [SHOWDOWN] ${payload?.winnerSummary || 'Hand completed.'}\x1b[0m`);
          if (currentGameState) {
            console.log(renderTable(currentGameState, true));
          }
          break;

        case 'poker:game_over':
          console.log(`\n\x1b[1m\x1b[32m✔ [GAME OVER] Conquered the table!\x1b[0m\n`);
          if (payload?.standings) {
            console.log(renderStandings(payload.standings));
          }
          cleanup();
          break;

        case 'poker:awaiting_human_action': {
          if (isWaitingForTurn) return;
          isWaitingForTurn = true;

          const legalChoices = payload?.choices || [];
          const choices: ChatChoice<PlayerAction>[] = legalChoices.map((c: any) => ({
            id: c.id,
            label: c.label,
            value: c.action,
            aliases: [c.action?.type, c.id],
          }));

          const chatCtx: GroupChatContext = {
            actorName: playerName,
            participants: currentGameState?.players || [],
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
                  if (currentGameState) {
                    const stdRes = getPokerStandings(currentGameState);
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
                  if (currentGameState) console.log(renderNarratives(currentGameState));
                  return true;
                },
              },
              {
                name: 'table',
                aliases: ['view'],
                description: 'Redraw the poker table view',
                handler: async () => {
                  if (currentGameState) console.log(renderTable(currentGameState, false));
                  return true;
                },
              },
            ],
            redrawView: () => {
              if (currentGameState) console.log('\n' + renderCompactStatus(currentGameState));
            },
            onSpeech: async (text: string, speechAct: string, targetParticipantId?: string) => {
              ws.send(
                JSON.stringify({
                  type: 'poker:speech',
                  payload: { text, speechAct, targetId: targetParticipantId },
                })
              );
            },
          };

          try {
            const chosenAction = await promptGroupChatAction(rl, choices, chatCtx);
            // Send selected action to server via WebSocket to resume AST workflow
            ws.send(
              JSON.stringify({
                type: 'poker:human_action',
                payload: chosenAction,
              })
            );
          } finally {
            isWaitingForTurn = false;
          }
          break;
        }
      }
    });
  });
}
