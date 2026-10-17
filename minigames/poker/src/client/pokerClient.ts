import readline from 'node:readline';
import {
  createPokerGameSession,
  type PokerGameSession,
  type PokerSessionOptions,
} from '../engine/pokerSession.ts';
import { renderPokerEvent } from '../ui/pokerUiEvents.ts';
import { renderTable } from '../ui/tableRenderer.ts';
import {
  createClientShell,
  createPokerChatContext,
  type ChatChoice,
} from './pokerChatContext.ts';
import {
  type CuratorChannel,
  type CuratorHost,
  createWebSocketChannel as createHostWebSocketChannel,
  createDirectChannel,
  normalizeWsUrl,
} from '../curatorHost.ts';
import { createPokerHost } from '../host.ts';
import type { PlayerAction, PokerGameState } from '../types.ts';
import { getLegalChoices } from '../engine/pokerEngine.ts';

export interface PokerClientOptions extends PokerSessionOptions {
  direct?: boolean;
  serverUrl?: string;
  playerName?: string;
  tableId?: string | number;
}

export type PokerGameChannel = CuratorChannel;
export { normalizeWsUrl };

/**
 * Creates a network-backed channel communicating with an external Poker Server over WebSockets.
 */
export async function createWebSocketChannel(options: PokerClientOptions = {}): Promise<PokerGameChannel> {
  return createHostWebSocketChannel({
    serverUrl: options.serverUrl,
    tableId: options.tableId,
    envUrlKey: 'POKER_SERVER_URL',
    defaultPath: '/api/events',
  });
}

/**
 * Creates a lightweight in-process direct Curator channel.
 * Zero outer APIs, zero network/TCP ports, pure direct AST execution from human action A to B.
 */
export async function createDirectSessionChannel(
  options: PokerClientOptions = {},
  existingSession?: PokerGameSession
): Promise<PokerGameChannel> {
  let session = existingSession;
  let host: CuratorHost | undefined;
  if (!session) {
    console.log('\x1b[90m[Curator] Initializing direct in-process game session...\x1b[0m');
    host = await createPokerHost({
      databasePath: options.databasePath,
      forceReset: options.forceReset,
      quiet: options.quiet,
    });
    session = await createPokerGameSession(host, options);
    console.log(`\x1b[32m✔ [Curator] Game session active on Table #${session.tableId}.\x1b[0m`);
  }

  const baseChannel = createDirectChannel(session, options.tableId);
  return {
    ...baseChannel,
    close: async () => {
      await baseChannel.close();
      if (host) {
        await host.stop();
      }
    },
  };
}

/**
 * Standardized Poker Terminal UI runner.
 * Takes any PokerGameChannel (WebSocket or Direct in-process) and manages
 * the user interaction loop, event streaming, and group chat prompts.
 */
export async function runPokerClientUi(
  channel: PokerGameChannel,
  playerName: string = 'You',
  existingRl?: readline.Interface
): Promise<void> {
  console.log("\n\x1b[1m\x1b[36m=== Curator Texas Hold'em ===\x1b[0m");
  if (channel.tableId) {
    console.log(`\x1b[35mTable: #${channel.tableId}\x1b[0m`);
  }
  console.log('\x1b[90mPowered by Curator AST and RequestProcessor...\x1b[0m\n');

  const rl = existingRl || readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    let currentGameState: PokerGameState | null = null;
    let isWaitingForTurn = false;

    const cleanup = async () => {
      rl.close();
      unsubscribe();
      await channel.close();
      resolve();
    };

    process.on('SIGINT', async () => {
      console.log('\n\x1b[33m[Game] Exiting table...\x1b[0m');
      await cleanup();
      process.exit(0);
    });

    const shell = createClientShell<PokerGameState, PlayerAction>(
      createPokerChatContext({
        actorName: playerName,
        getGameState: () => currentGameState,
        onSpeech: async (text: string, speechAct: string, targetParticipantId?: string) => {
          await channel.send('poker:speech', { text, speechAct, targetId: targetParticipantId });
        },
      })
    );

    const unsubscribe = channel.on(async (event: any) => {
      const { type, payload } = event;

      if (payload?.gameState) {
        currentGameState = payload.gameState;
      } else if (payload?.state) {
        currentGameState = payload.state;
      }

      renderPokerEvent(event, currentGameState);

      if (type === 'poker:game_over' || type === 'poker:session_exited') {
        await cleanup();
        return;
      }

      if (type === 'poker:lobby_prompt') {
        console.log("\n\x1b[1m\x1b[36m╔══════════════════════════════════════════════════════════════════════╗\x1b[0m");
        console.log("\x1b[1m\x1b[36m║                    Curator Texas Hold'em Lounge                      ║\x1b[0m");
        console.log("\x1b[1m\x1b[36m╚══════════════════════════════════════════════════════════════════════╝\x1b[0m\n");

        const rawOptions = Array.isArray(payload?.options) ? payload.options : [];
        const choices: ChatChoice<any>[] = rawOptions.map((opt: any) => ({
          id: opt.id,
          label: `${opt.label}${opt.description ? ` - ${opt.description}` : ''}`,
          value: opt.id,
          aliases: [opt.id, opt.label?.toLowerCase()],
        }));

        try {
          const chosen: any = await (shell as any).promptAction(rl, choices);
          const choiceId = typeof chosen === 'string' ? chosen : (chosen?.id || chosen?.value || 'new');
          if (choiceId === 'exit' || choiceId === '3' || choiceId === 'q') {
            console.log("\x1b[33mGoodbye!\x1b[0m");
            await channel.send('poker:lobby_choice', { id: 'exit' });
            await cleanup();
            return;
          }
          await channel.send('poker:lobby_choice', { id: choiceId });
        } catch (_) {}
        return;
      }

      if (type === 'poker:request_table_selection') {
        const rawTables: any[] = payload?.tables || [];
        if (rawTables.length === 0) {
          console.log("\x1b[33mNo existing tables found. Starting fresh table instead...\x1b[0m\n");
          await channel.send('poker:table_selected', { id: 'poker:high_roller_lounge' });
          return;
        }

        console.log("\n\x1b[1m=== Available Tables ===\x1b[0m");
        const choices: ChatChoice<any>[] = rawTables.map((t: any, idx: number) => {
          const pot = t.gameState?.pot ? ` | Pot: $${t.gameState.pot}` : '';
          const hand = t.gameState?.handNumber ? ` | Hand: #${t.gameState.handNumber}` : '';
          const status = t.status || 'ACTIVE';
          return {
            id: String(t.tableId || t.id || idx + 1),
            label: `Table #${t.tableId || t.id} (${t.title || 'Table'}) - Status: ${status}${pot}${hand}`,
            value: String(t.tableId || t.id),
            aliases: [String(idx + 1), String(t.tableId || t.id)],
          };
        });

        try {
          const chosen: any = await (shell as any).promptAction(rl, choices);
          const selectedId = typeof chosen === 'string' ? chosen : (chosen?.id || chosen?.value || rawTables[rawTables.length - 1].tableId);
          await channel.send('poker:table_selected', { id: selectedId });
        } catch (_) {}
        return;
      }

      if (type === 'poker:awaiting_human_action') {
        if (isWaitingForTurn) return;
        isWaitingForTurn = true;

        if (currentGameState) {
          console.log('\n' + renderTable(currentGameState, false));
        }

        let rawChoices: any[] = [];
        if (Array.isArray(payload?.choices)) {
          rawChoices = payload.choices;
        } else if (Array.isArray(payload?.choices?.choices)) {
          rawChoices = payload.choices.choices;
        }
        if (rawChoices.length === 0 && currentGameState) {
          rawChoices = getLegalChoices(currentGameState);
        }

        const choices: ChatChoice<PlayerAction>[] = rawChoices.map((c: any) => ({
          id: c.id || c.action?.type?.toLowerCase() || 'action',
          label: c.label || `${c.action?.type || c.type || 'Action'} ${c.action?.amount || c.amount ? '$' + (c.action?.amount || c.amount) : ''}`.trim(),
          value: c.action || c,
          aliases: [c.action?.type, c.type, c.id].filter(Boolean),
        }));

        try {
          const chosenAction = await shell.promptAction(rl, choices, {
            participants: currentGameState?.players || [],
          });

          if (chosenAction.type === 'EXIT') {
            console.log(`\n\x1b[33m[Game] Exiting table session...\x1b[0m`);
            await channel.send('poker:human_action', chosenAction);
            await cleanup();
            return;
          }

          if (chosenAction.type === 'PAUSE') {
            await channel.send('poker:pause');
            const inter = await shell.promptIntermission(
              rl,
              { participants: currentGameState?.players || [] },
              'Table is PAUSED. Type resume (or press ENTER) to continue, or /exit to quit:'
            );
            if (inter === 'QUIT') {
              await channel.send('poker:human_action', { type: 'EXIT' });
              await cleanup();
              return;
            } else {
              await channel.send('poker:resume');
            }
            return;
          }

          console.log(`\x1b[33m▶ ${playerName}: ${chosenAction.type}${chosenAction.amount ? ` $${chosenAction.amount}` : ''}\x1b[0m`);
          await channel.send('poker:human_action', chosenAction);
        } finally {
          isWaitingForTurn = false;
        }
      }
    });

    // If channel has an initial start routine (e.g. direct in-process mode), run it
    if (typeof channel.start === 'function') {
      channel.start().catch((err) => {
        console.error(`\x1b[31m[Start Error] ${err?.message || err}\x1b[0m`);
      });
    }
  });
}

/**
 * Factory that creates a unified PokerGameChannel (WebSocket or Direct in-process).
 */
export async function createPokerChannel(
  options: PokerClientOptions = {}
): Promise<PokerGameChannel> {
  if (options.direct) {
    return createDirectSessionChannel(options);
  }
  return createWebSocketChannel(options);
}

/**
 * Primary entry point for playing Poker in the terminal.
 * Fully event-driven via Curator AST workflow.
 */
export async function runPokerClient(options: PokerClientOptions = {}): Promise<void> {
  let channel: PokerGameChannel;
  try {
    channel = await createPokerChannel(options);
  } catch (err: any) {
    console.error(`\x1b[31mFailed to connect to server: ${err.message}\x1b[0m`);
    console.log('\x1b[33mTip: Use "poker play --direct" for lightweight in-process play without a server.\x1b[0m');
    return;
  }

  await runPokerClientUi(channel, options.playerName);
}

