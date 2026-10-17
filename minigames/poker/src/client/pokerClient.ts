import readline from 'node:readline';
import { WebSocket } from 'ws';
import {
  createPokerGameSession,
  type PokerGameSession,
  type PokerSessionOptions,
} from '../session/pokerSession.ts';
import { renderPokerEvent } from '../ui/pokerUiEvents.ts';
import { renderTable } from '../ui/tableRenderer.ts';
import {
  createClientShell,
  createPokerChatContext,
  askUser,
  type ChatChoice,
} from './pokerChatContext.ts';
import type { PlayerAction, PokerGameState } from '../types.ts';
import { getLegalChoices } from '../engine/pokerEngine.ts';

export interface PokerClientOptions extends PokerSessionOptions {
  direct?: boolean;
  serverUrl?: string;
  playerName?: string;
  tableId?: string | number;
}

/**
 * Universal interface for poker game communication.
 * Allows identical terminal UI execution over a remote WebSocket
 * or via lightweight in-process direct Curator AST execution.
 */
export interface PokerGameChannel {
  sessionId?: string;
  tableId?: string;
  onEvent(handler: (event: any) => void): () => void;
  submitAction(action: PlayerAction): Promise<void>;
  submitSpeech(speech: { text: string; speechAct?: string; targetId?: string }): Promise<any>;
  pause?(): Promise<void>;
  resume?(): Promise<void>;
  start?(): Promise<void>;
  close(): Promise<void>;
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
 * Creates a network-backed channel communicating with an external Poker Server over WebSockets.
 */
export async function createWebSocketChannel(options: PokerClientOptions = {}): Promise<PokerGameChannel> {
  const rawWsUrl = normalizeWsUrl(options.serverUrl);
  const targetTableId = options.tableId !== undefined ? String(options.tableId) : undefined;
  const wsUrl = targetTableId
    ? `${rawWsUrl}${rawWsUrl.includes('?') ? '&' : '?'}table=${encodeURIComponent(targetTableId)}`
    : rawWsUrl;

  console.log(`\x1b[90mConnecting to Curator Poker Server at ${wsUrl}...\x1b[0m\n`);

  const ws = new WebSocket(wsUrl);
  const listeners: Set<(event: any) => void> = new Set();
  let clientSessionId: string | undefined = undefined;

  await new Promise<void>((resolve, reject) => {
    (ws as any).once('open', () => {
      if (targetTableId) {
        ws.send(JSON.stringify({ type: 'subscribe', tableId: targetTableId }));
      }
      resolve();
    });
    (ws as any).once('error', (err: any) => reject(err));
  });

  ws.on('message', (raw: any) => {
    try {
      const event = JSON.parse(raw.toString());
      if (event.type === 'connected' && event.sessionId) {
        clientSessionId = event.sessionId;
      }
      for (const listener of listeners) {
        listener(event);
      }
    } catch (_) {}
  });

  return {
    sessionId: clientSessionId,
    tableId: targetTableId,
    onEvent(handler: (event: any) => void) {
      listeners.add(handler);
      return () => listeners.delete(handler);
    },
    async submitAction(action: PlayerAction) {
      ws.send(
        JSON.stringify({
          type: 'poker:human_action',
          tableId: targetTableId,
          sessionId: clientSessionId,
          payload: action,
        })
      );
    },
    async submitSpeech(speech: { text: string; speechAct?: string; targetId?: string }) {
      ws.send(
        JSON.stringify({
          type: 'poker:speech',
          tableId: targetTableId,
          sessionId: clientSessionId,
          payload: speech,
        })
      );
    },
    async pause() {
      ws.send(
        JSON.stringify({
          type: 'poker:pause',
          tableId: targetTableId,
          sessionId: clientSessionId,
        })
      );
    },
    async resume() {
      ws.send(
        JSON.stringify({
          type: 'poker:resume',
          tableId: targetTableId,
          sessionId: clientSessionId,
        })
      );
    },
    async close() {
      try {
        ws.close();
      } catch (_) {}
    },
  };
}

/**
 * Creates a lightweight in-process direct Curator channel.
 * Zero outer APIs, zero network/TCP ports, pure direct AST execution from human action A to B.
 */
export async function createDirectSessionChannel(
  options: PokerClientOptions = {},
  existingSession?: PokerGameSession
): Promise<PokerGameChannel & { session: PokerGameSession }> {
  let session = existingSession;
  if (!session) {
    console.log('\x1b[90m[Curator] Initializing direct in-process game session...\x1b[0m');
    session = await createPokerGameSession(options);
    console.log(`\x1b[32m✔ [Curator] Game session active on Table #${session.tableId}.\x1b[0m`);
  }

  let activeTableId = String(options.tableId !== undefined ? options.tableId : session.tableId);

  return {
    session,
    get tableId() {
      return activeTableId;
    },
    set tableId(id: string | undefined) {
      if (id !== undefined) {
        activeTableId = String(id);
      }
    },
    onEvent(handler: (event: any) => void) {
      return session!.host.events.onEvent(handler);
    },
    async submitAction(action: PlayerAction) {
      console.log(`\x1b[90m[Curator] Submitting action ${action.type} and stepping AST to next turn...\x1b[0m`);
      await session!.submitHumanAction(action, activeTableId);
      await session!.stepUntilHumanTurn(activeTableId);
    },
    async submitSpeech(speech: { text: string; speechAct?: string; targetId?: string }) {
      return session!.submitHumanSpeech({ ...speech, tableId: activeTableId });
    },
    async start() {
      console.log('\x1b[90m[Curator] Stepping AST workflow to first human turn...\x1b[0m');
      await session!.stepUntilHumanTurn(activeTableId);
    },
    async pause() {
      await session!.pauseTable(activeTableId);
    },
    async resume() {
      await session!.resumeTable(activeTableId);
    },
    async close() {
      await session!.close();
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
          const reply = await channel.submitSpeech({ text, speechAct, targetId: targetParticipantId });
          if (reply?.aiResponse?.text) {
            console.log(`\x1b[36m[REPLY] "${reply.aiResponse.text}"\x1b[0m`);
          }
        },
      })
    );

    const unsubscribe = channel.onEvent(async (event: any) => {
      const { type, payload } = event;

      if (payload?.gameState) {
        currentGameState = payload.gameState;
      } else if (payload?.state) {
        currentGameState = payload.state;
      }

      renderPokerEvent(event, currentGameState);

      if (type === 'poker:game_over') {
        await cleanup();
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
            await channel.submitAction(chosenAction);
            await cleanup();
            return;
          }

          if (chosenAction.type === 'PAUSE') {
            await channel.submitAction(chosenAction);
            const inter = await shell.promptIntermission(
              rl,
              { participants: currentGameState?.players || [] },
              'Table is PAUSED. Type resume (or press ENTER) to continue, or /exit to quit:'
            );
            if (inter === 'QUIT') {
              await channel.submitAction({ type: 'EXIT' });
              await cleanup();
              return;
            } else {
              await channel.submitAction({ type: 'RESUME' });
            }
            return;
          }

          console.log(`\x1b[33m▶ ${playerName}: ${chosenAction.type}${chosenAction.amount ? ` $${chosenAction.amount}` : ''}\x1b[0m`);
          await channel.submitAction(chosenAction);
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
 * Interactive Lobby Flow (New Game, Resume Game, Exit)
 * Runs when starting without explicit bypass flags (--table or --reset).
 */
export async function runPokerLobbyFlow(
  options: PokerClientOptions,
  rl: readline.Interface,
  directSession?: PokerGameSession
): Promise<{ tableId?: string | number; forceReset?: boolean; exit?: boolean }> {
  if (options.tableId !== undefined || options.forceReset) {
    return { tableId: options.tableId, forceReset: options.forceReset };
  }

  console.log("\n\x1b[1m\x1b[36m╔══════════════════════════════════════════════════════════════════════╗\x1b[0m");
  console.log("\x1b[1m\x1b[36m║                    Curator Texas Hold'em Lounge                      ║\x1b[0m");
  console.log("\x1b[1m\x1b[36m╚══════════════════════════════════════════════════════════════════════╝\x1b[0m\n");
  console.log("  \x1b[1m[1]\x1b[0m \x1b[32mNew Game\x1b[0m    - Start a fresh table");
  console.log("  \x1b[1m[2]\x1b[0m \x1b[33mResume Game\x1b[0m - Reconnect to an existing or paused table");
  console.log("  \x1b[1m[3]\x1b[0m \x1b[31mExit\x1b[0m        - Exit to terminal\n");

  const choice = (await askUser(rl, "Select an option [1-3] (or type new / resume / exit): ")).trim().toLowerCase();

  if (choice === '3' || choice === 'exit' || choice === 'q' || choice === 'quit') {
    console.log("\x1b[33mGoodbye!\x1b[0m");
    return { exit: true };
  }

  if (choice === '2' || choice === 'resume' || choice === 'r') {
    if (options.direct) {
      const activeSession = directSession || (await createPokerGameSession({ ...options, quiet: true }));
      const tables = await activeSession.listTables();
      if (!directSession) {
        await activeSession.close();
      }

      if (tables.length === 0) {
        console.log("\x1b[33mNo existing tables found. Starting a New Game instead...\x1b[0m\n");
        return { forceReset: false };
      }

      console.log("\n\x1b[1m=== Available Tables ===\x1b[0m");
      tables.forEach((t, idx) => {
        const pot = t.gameState?.pot ? ` | Pot: $${t.gameState.pot}` : '';
        const hand = t.gameState?.handNumber ? ` | Hand: #${t.gameState.handNumber}` : '';
        const status = t.status || (t.waitingForHuman ? 'WAITING' : 'ACTIVE');
        console.log(`  [${idx + 1}] Table #${t.tableId} (${t.title}) - Status: \x1b[35m${status}\x1b[0m${pot}${hand}`);
      });

      const sel = (await askUser(rl, `\nSelect table [1-${tables.length}] or press ENTER for latest: `)).trim();
      const num = parseInt(sel, 10);
      if (!isNaN(num) && num >= 1 && num <= tables.length) {
        return { tableId: tables[num - 1].tableId, forceReset: false };
      }
      return { tableId: tables[tables.length - 1].tableId, forceReset: false };
    } else {
      try {
        const base = (options.serverUrl || process.env.POKER_SERVER_URL || 'http://127.0.0.1:4000').replace(/\/+$/, '');
        const res = await fetch(`${base}/api/status`);
        if (res.ok) {
          const statusJson: any = await res.json();
          const tables: any[] = statusJson.tables || [];
          if (tables.length > 0) {
            console.log("\n\x1b[1m=== Server Tables ===\x1b[0m");
            tables.forEach((t, idx) => {
              console.log(`  [${idx + 1}] Table #${t.tableId} (${t.title}) - Status: \x1b[35m${t.status || 'ACTIVE'}\x1b[0m`);
            });
            const sel = (await askUser(rl, `\nSelect table [1-${tables.length}] or press ENTER for latest: `)).trim();
            const num = parseInt(sel, 10);
            if (!isNaN(num) && num >= 1 && num <= tables.length) {
              return { tableId: tables[num - 1].tableId, forceReset: false };
            }
            return { tableId: tables[tables.length - 1].tableId, forceReset: false };
          }
        }
      } catch (_) {}
      return { forceReset: false };
    }
  }

  // [1] New Game: create a new table or reuse fresh initial table without wiping sqlite database
  if (options.direct && directSession) {
    const tables = await directSession.listTables();
    if (tables.length === 1 && (!tables[0].gameState || tables[0].gameState.handNumber <= 1)) {
      return { tableId: tables[0].tableId, forceReset: false };
    }
    const newTable = await directSession.createTable({
      title: `Table #${tables.length + 1}`,
    });
    console.log(`\x1b[32m✔ Created new table #${newTable.tableId} (${newTable.title})\x1b[0m\n`);
    return { tableId: newTable.tableId, forceReset: false };
  }

  return { forceReset: false };
}

/**
 * Primary entry point for playing Poker in the terminal.
 * Supports both network client mode (via WebSocket) and direct lightweight in-process mode.
 */
export async function runPokerClient(options: PokerClientOptions = {}): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let directChannel: (PokerGameChannel & { session: PokerGameSession }) | undefined;

  // In direct mode, boot channel once upfront to avoid duplicate session probe overhead
  if (options.direct) {
    directChannel = await createDirectSessionChannel(options);
  }

  const lobbyResult = await runPokerLobbyFlow(options, rl, directChannel?.session);

  if (lobbyResult.exit) {
    if (directChannel) {
      await directChannel.close();
    }
    rl.close();
    process.exit(0);
  }

  const effectiveOptions: PokerClientOptions = {
    ...options,
    ...(lobbyResult.tableId !== undefined ? { tableId: lobbyResult.tableId } : {}),
    ...(lobbyResult.forceReset !== undefined ? { forceReset: lobbyResult.forceReset } : {}),
  };

  const playerName = effectiveOptions.playerName || 'You';

  if (effectiveOptions.direct) {
    if (directChannel) {
      if (effectiveOptions.tableId !== undefined) {
        directChannel.tableId = String(effectiveOptions.tableId);
      }
      await runPokerClientUi(directChannel, playerName, rl);
    } else {
      const ch = await createDirectSessionChannel(effectiveOptions);
      await runPokerClientUi(ch, playerName, rl);
    }
  } else {
    try {
      const wsChannel = await createWebSocketChannel(effectiveOptions);
      await runPokerClientUi(wsChannel, playerName, rl);
    } catch (err: any) {
      console.error(`\x1b[31mFailed to connect to server: ${err.message}\x1b[0m`);
      console.log('\x1b[33mTip: Use "poker play --direct" for lightweight in-process play without a server.\x1b[0m');
      rl.close();
    }
  }
}
