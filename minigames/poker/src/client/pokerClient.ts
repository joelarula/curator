import readline from 'node:readline';
import {
  createPokerGameSession,
  type PokerGameSession,
  type PokerSessionOptions,
} from '../engine/pokerSession.ts';
import { renderPokerEvent } from '../ui/pokerUiEvents.ts';
import {
  createPokerClientShell,
  type ToolAction,
} from './pokerClientShell.ts';
import {
  type CuratorChannel,
  type CuratorHost,
  createWebSocketChannel as createHostWebSocketChannel,
  createDirectChannel,
  normalizeWsUrl,
} from '../curatorHost.ts';
import { createPokerHost } from '../host.ts';
import type { PokerGameState } from '../types.ts';

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
 * the continuous asynchronous REPL, event streaming, and group chat prompts.
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

  const rl =
    existingRl ||
    readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

  return new Promise((resolve) => {
    let currentGameState: PokerGameState | null = null;

    const cleanup = async () => {
      shell.stop();
      unsubscribe();
      await channel.close();
      resolve();
    };

    process.on('SIGINT', async () => {
      console.log('\n\x1b[33m[Game] Exiting table...\x1b[0m');
      await cleanup();
      process.exit(0);
    });

    const shell = createPokerClientShell({
      channel,
      actorName: playerName,
      getGameState: () => currentGameState,
    });

    // Start the continuous asynchronous REPL
    shell.start(rl);

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

      // Lobby choice presentation (non-blocking)
      if (type === 'poker:lobby_prompt') {
        console.log("\n\x1b[1m\x1b[36m╔══════════════════════════════════════════════════════════════════════╗\x1b[0m");
        console.log("\x1b[1m\x1b[36m║                    Curator Texas Hold'em Lounge                      ║\x1b[0m");
        console.log("\x1b[1m\x1b[36m╚══════════════════════════════════════════════════════════════════════╝\x1b[0m\n");

        const rawOptions = Array.isArray(payload?.options) ? payload.options : [];
        const choices = rawOptions.map((opt: any) => ({
          id: opt.id,
          label: `${opt.label}${opt.description ? ` - ${opt.description}` : ''}`,
          execute: async () => {
            if (opt.id === 'exit' || opt.id === '3' || opt.id === 'q') {
              console.log("\x1b[33mGoodbye!\x1b[0m");
              await channel.send('poker:lobby_choice', { id: 'exit' });
              await cleanup();
              return;
            }
            await channel.send('poker:lobby_choice', { id: opt.id });
          },
        }));

        shell.setChoices(choices, { blocking: false });
        return;
      }

      // Table selection presentation (non-blocking)
      if (type === 'poker:request_table_selection') {
        const rawTables: any[] = payload?.tables || [];
        if (rawTables.length === 0) {
          console.log("\x1b[33mNo existing tables found. Starting fresh table instead...\x1b[0m\n");
          await channel.send('poker:table_selected', { id: 'poker:high_roller_lounge' });
          return;
        }

        console.log("\n\x1b[1m=== Available Tables ===\x1b[0m");
        const choices = rawTables.map((t: any, idx: number) => {
          const pot = t.gameState?.pot ? ` | Pot: $${t.gameState.pot}` : '';
          const hand = t.gameState?.handNumber ? ` | Hand: #${t.gameState.handNumber}` : '';
          const status = t.status || 'ACTIVE';
          const tableId = String(t.tableId || t.id || idx + 1);
          return {
            id: tableId,
            label: `Table #${tableId} (${t.title || 'Table'}) - Status: ${status}${pot}${hand}`,
            aliases: [String(idx + 1), tableId],
            execute: async () => {
              await channel.send('poker:table_selected', { id: tableId });
            },
          };
        });

        shell.setChoices(choices, { blocking: false });
        return;
      }

      // Awaiting human player action (non-blocking by default)
      if (type === 'poker:awaiting_human_action') {
        const rawChoices: any[] = Array.isArray(payload?.choices)
          ? payload.choices
          : Array.isArray(payload?.choices?.choices)
            ? payload.choices.choices
            : [];

        const choices = rawChoices.map((c: any) => {
          const act = c.action || c;
          const actType = act?.type || c.type || 'ACTION';
          const actAmount = act?.amount || c.amount;
          return {
            id: c.id || actType.toLowerCase(),
            label:
              c.label ||
              `${actType} ${actAmount ? '$' + actAmount : ''}`.trim(),
            aliases: [actType.toLowerCase(), c.type?.toLowerCase(), c.id?.toLowerCase()].filter(Boolean),
            execute: async () => {
              const actionPayload = {
                type: actType,
                amount: actAmount,
                ...(typeof act === 'object' ? act : {}),
              };
              if (actionPayload.type === 'EXIT') {
                console.log(`\n\x1b[33m[Game] Exiting table session...\x1b[0m`);
                await channel.send('poker:human_action', actionPayload);
                await cleanup();
                return;
              }
              await channel.send('poker:human_action', actionPayload);
            },
          };
        });

        const isBlocking = Boolean(payload?.blocking);
        shell.setChoices(choices, { blocking: isBlocking });
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
 * Fully event-driven via Curator AST workflow and asynchronous REPL.
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
