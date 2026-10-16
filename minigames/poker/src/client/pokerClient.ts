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
  promptGroupChatAction,
  askUser,
  createPokerChatContext,
  type ChatChoice,
} from '../ui/groupChatPrompt.ts';
import type { PlayerAction, PokerGameState } from '../types.ts';

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
export async function createDirectSessionChannel(options: PokerSessionOptions = {}): Promise<PokerGameChannel & { session: PokerGameSession }> {
  console.log('\x1b[90m[Curator] Initializing direct in-process game session...\x1b[0m');
  const session = await createPokerGameSession(options);
  console.log(`\x1b[32m✔ [Curator] Game session active on Table #${session.tableId}.\x1b[0m`);

  return {
    session,
    tableId: session.tableId,
    onEvent(handler: (event: any) => void) {
      return session.host.events.onEvent(handler);
    },
    async submitAction(action: PlayerAction) {
      console.log(`\x1b[90m[Curator] Submitting action ${action.type} and stepping AST to next turn...\x1b[0m`);
      await session.submitHumanAction(action, session.tableId);
      await session.stepUntilHumanTurn(session.tableId);
    },
    async submitSpeech(speech: { text: string; speechAct?: string; targetId?: string }) {
      return session.submitHumanSpeech({ ...speech, tableId: session.tableId });
    },
    async start() {
      console.log('\x1b[90m[Curator] Stepping AST workflow to first human turn...\x1b[0m');
      await session.stepUntilHumanTurn(session.tableId);
    },
    async close() {
      await session.close();
    },
  };
}

/**
 * Standardized Poker Terminal UI runner.
 * Takes any PokerGameChannel (WebSocket or Direct in-process) and manages
 * the user interaction loop, event streaming, and group chat prompts.
 */
export async function runPokerClientUi(channel: PokerGameChannel, playerName: string = 'You'): Promise<void> {
  console.log("\n\x1b[1m\x1b[36m=== Curator Texas Hold'em ===\x1b[0m");
  if (channel.tableId) {
    console.log(`\x1b[35mTable: #${channel.tableId}\x1b[0m`);
  }
  console.log('\x1b[90mPowered by Curator AST and RequestProcessor...\x1b[0m\n');

  const rl = readline.createInterface({
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

        const legalChoices = payload?.choices || [];
        const choices: ChatChoice<PlayerAction>[] = legalChoices.map((c: any) => ({
          id: c.id,
          label: c.label,
          value: c.action,
          aliases: [c.action?.type, c.id],
        }));

        const chatCtx = createPokerChatContext({
          actorName: playerName,
          getGameState: () => currentGameState,
          onSpeech: async (text: string, speechAct: string, targetParticipantId?: string) => {
            const reply = await channel.submitSpeech({ text, speechAct, targetId: targetParticipantId });
            if (reply?.aiResponse?.text) {
              console.log(`\x1b[36m[REPLY] "${reply.aiResponse.text}"\x1b[0m`);
            }
          },
        });

        try {
          const chosenAction = await promptGroupChatAction(rl, choices, chatCtx);
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
 * Primary entry point for playing Poker in the terminal.
 * Supports both network client mode (via WebSocket) and direct lightweight in-process mode.
 */
export async function runPokerClient(options: PokerClientOptions = {}): Promise<void> {
  const playerName = options.playerName || 'You';

  if (options.direct) {
    const directChannel = await createDirectSessionChannel(options);
    await runPokerClientUi(directChannel, playerName);
  } else {
    try {
      const wsChannel = await createWebSocketChannel(options);
      await runPokerClientUi(wsChannel, playerName);
    } catch (err: any) {
      console.error(`\x1b[31mFailed to connect to server: ${err.message}\x1b[0m`);
      console.log('\x1b[33mTip: Use "poker play --direct" for lightweight in-process play without a server.\x1b[0m');
    }
  }
}
