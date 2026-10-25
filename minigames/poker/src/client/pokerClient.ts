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
import { resolvePlayerIdentity, type PlayerProfile } from './pokerProfile.ts';
import {
  PokerEvent,
  PokerClientConstant,
  CuratorCoreEvent,
} from '../models/pokerContracts.ts';

export { resolvePlayerIdentity, type PlayerProfile };

export interface PokerClientOptions extends PokerSessionOptions {
  direct?: boolean;
  serverUrl?: string;
  playerName?: string;
  tableId?: string | number;
}

export type PokerGameChannel = CuratorChannel & {
  runTool?(toolName: string, args?: Record<string, any>): Promise<any>;
};
export { normalizeWsUrl };

/**
 * Creates a network-backed channel communicating with an external Poker Server over WebSockets.
 */
export async function createWebSocketChannel(options: PokerClientOptions = {}): Promise<PokerGameChannel> {
  const queryParams = new URLSearchParams();
  if (options.playerName) queryParams.set('playerName', options.playerName);
  if (options.playerId) queryParams.set('playerId', options.playerId);
  const qs = queryParams.toString();
  const defaultPath = qs ? `${PokerClientConstant.DEFAULT_WS_PATH}?${qs}` : PokerClientConstant.DEFAULT_WS_PATH;

  return createHostWebSocketChannel({
    serverUrl: options.serverUrl,
    tableId: options.tableId,
    envUrlKey: PokerClientConstant.ENV_SERVER_URL,
    defaultPath,
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
    if (options.tableId !== undefined) {
      console.log(`\x1b[32m✔ [Curator] Game session active on Table #${session.tableId}.\x1b[0m`);
    } else {
      console.log(`\x1b[32m✔ [Curator] Entering Texas Hold'em Lounge Lobby.\x1b[0m`);
    }
  }

  const baseChannel = createDirectChannel(session, options.tableId);
  const origClose = baseChannel.close.bind(baseChannel);
  return Object.assign(baseChannel, {
    runTool: (toolName: string, args?: Record<string, any>) => session.runTool(toolName, args, baseChannel.tableId),
    close: async () => {
      await origClose();
      if (host) {
        await host.stop();
      }
    },
  });
}

/**
 * Standardized Poker Terminal UI runner.
 * Takes any PokerGameChannel (WebSocket or Direct in-process) and manages
 * the continuous asynchronous REPL, event streaming, and group chat prompts.
 */
export async function runPokerClientUi(
  channel: PokerGameChannel,
  playerName: string = PokerClientConstant.DEFAULT_PLAYER_NAME,
  existingRl?: readline.Interface,
  hasExplicitTable: boolean = false
): Promise<void> {
  console.log("\n\x1b[1m\x1b[36m=== Curator Texas Hold'em ===\x1b[0m");
  if (hasExplicitTable && channel.tableId) {
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

    const shell: any = createPokerClientShell({
      channel,
      actorName: playerName,
      getGameState: () => {
        if (!currentGameState) {
          return {
            phase: PokerClientConstant.LOBBY_PHASE,
            table: null,
            status: PokerClientConstant.LOBBY_WAITING_STATUS,
            choices: shell?.activeChoices?.map((c: any, i: number) => `[${i + 1}] ${c.label}`) || [],
          } as any;
        }
        return currentGameState;
      },
    });


    let lastChoiceRequestId: string | number | undefined;

    const unsubscribe = channel.on(async (event: any) => {
      const { type, payload } = event;

      if (payload?.gameState) {
        currentGameState = typeof payload.gameState === 'string'
          ? (payload.gameState.startsWith('{') ? JSON.parse(payload.gameState) : currentGameState)
          : payload.gameState;
      } else if (payload?.state) {
        currentGameState = typeof payload.state === 'string'
          ? (payload.state.startsWith('{') ? JSON.parse(payload.state) : currentGameState)
          : payload.state;
      }

      renderPokerEvent(event, currentGameState);

      if (type === PokerEvent.TABLE_SELECTED) {
        const targetTableId = payload?.tableId || payload?.id;
        if (targetTableId && targetTableId !== PokerClientConstant.BACK_CHOICE_ID && channel.tableId !== String(targetTableId)) {
          channel.tableId = String(targetTableId);
          // In direct execution mode, advance the newly selected table conversation so the game loop deals and begins
          if (typeof channel.start === 'function') {
            setImmediate(() => {
              channel.start?.().catch((err: any) => {
                console.error(`\x1b[31m[Table Start Error] ${err?.message || err}\x1b[0m`);
              });
            });
          }
        }
      }

      if (type === PokerEvent.GAME_OVER || type === PokerEvent.SESSION_EXITED) {
        await cleanup();
        return;
      }

      // Lobby choice presentation (non-blocking)
      if (type === PokerEvent.LOBBY_PROMPT) {
        console.log("\n\x1b[1m\x1b[36m╔══════════════════════════════════════════════════════════════════════╗\x1b[0m");
        console.log("\x1b[1m\x1b[36m║                    Curator Texas Hold'em Lounge                      ║\x1b[0m");
        console.log("\x1b[1m\x1b[36m╚══════════════════════════════════════════════════════════════════════╝\x1b[0m\n");

        const rawChoices = payload?.choices || payload?.options || [];
        shell.setChoices(rawChoices, { blocking: false });
        return;
      }

      // Table selection presentation (non-blocking)
      if (type === PokerEvent.REQUEST_TABLE_SELECTION) {
        const rawChoices: any[] = payload?.choices || payload?.tables || [];
        if (rawChoices.length === 0) {
          console.log("\x1b[33mNo existing tables found. Starting fresh table instead...\x1b[0m\n");
          await channel.send(PokerEvent.TABLE_SELECTED, { id: PokerClientConstant.DEFAULT_TABLE_ID });
          return;
        }

        console.log("\n\x1b[1m=== Available Tables ===\x1b[0m");
        shell.setChoices(rawChoices, { blocking: false });
        return;
      }

      // Universal Curator choices & human input presentation
      if (type === CuratorCoreEvent.CHOICES || type === CuratorCoreEvent.HUMAN_INPUT) {
        if (payload?.requestId && payload.requestId === lastChoiceRequestId) {
          return;
        }
        lastChoiceRequestId = payload?.requestId;
        const rawChoices: any[] = Array.isArray(payload?.choices)
          ? payload.choices
          : [];
        if (payload?.prompt) {
          console.log(`\n\x1b[1m${payload.prompt}\x1b[0m`);
        }
        shell.setChoices(rawChoices, {
          blocking: Boolean(payload?.blocking),
          as: payload?.as,
          requestId: payload?.requestId,
          conversationId: payload?.conversationId,
          prompt: payload?.prompt,
          event: payload?.event || payload?.waitEvent,
        });
        return;
      }

      // Awaiting human player action (non-blocking by default)
      if (type === PokerEvent.AWAITING_HUMAN_ACTION) {
        const rawChoices: any[] = Array.isArray(payload?.choices)
          ? payload.choices
          : Array.isArray(payload?.choices?.choices)
            ? payload.choices.choices
            : [];
        shell.setChoices(rawChoices, {
          blocking: Boolean(payload?.blocking),
          as: payload?.as || PokerClientConstant.ACTION_CONTEXT_KEY,
          requestId: payload?.requestId,
          conversationId: payload?.conversationId,
          prompt: payload?.prompt,
          event: payload?.event || PokerEvent.HUMAN_ACTION,
        });
      }
    });

    // Start the continuous asynchronous REPL immediately so event-driven choices can prompt
    shell.start(rl);

    // Initialize channel (e.g. direct in-process initial AST stepping)
    if (typeof channel.start === 'function') {
      channel.start().catch((err: any) => {
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
  // 1. Resolve player identity locally on client side before lobby entry
  const identity = await resolvePlayerIdentity({
    playerName: options.playerName,
    quiet: options.quiet,
  });

  const resolvedOptions: PokerClientOptions = {
    ...options,
    playerName: identity.playerName,
    playerId: identity.playerId,
  };

  let channel: PokerGameChannel;
  try {
    channel = await createPokerChannel(resolvedOptions);
  } catch (err: any) {
    console.error(`\x1b[31mFailed to connect to server: ${err.message}\x1b[0m`);
    console.log('\x1b[33mTip: Use "poker play --direct" for lightweight in-process play without a server.\x1b[0m');
    return;
  }

  await runPokerClientUi(channel, identity.playerName, undefined, options.tableId !== undefined);
}
