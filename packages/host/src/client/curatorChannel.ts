import { WebSocket } from 'ws';

/**
 * Universal interface for Curator game and application communication.
 * Allows identical terminal UI and client execution over a remote WebSocket
 * or via lightweight in-process direct Curator AST execution.
 */
export interface CuratorChannel {
  sessionId?: string;
  targetId?: string;
  tableId?: string;

  /** Register an event listener for outbound events from the runtime/AST engine */
  on(handler: (event: any) => void): () => void;

  /** Send an inbound event to the runtime/AST engine */
  send(type: string, payload?: any): Promise<void>;

  /** Optional lifecycle hook to kick off initial execution */
  start?(): Promise<void>;

  /** Clean up and close connection or session resources */
  close(): Promise<void>;
}

export interface WebSocketChannelOptions {
  serverUrl?: string;
  targetId?: string | number;
  tableId?: string | number;
  channelFilterKey?: string;
  defaultPath?: string;
  envUrlKey?: string;
}

export interface DirectChannelTarget {
  tableId?: string | number;
  conversationId?: number;
  host?: { events: { onEvent(handler: (event: any) => void): () => void } };
  events?: { onEvent(handler: (event: any) => void): () => void };
  submitEvent(type: string, payload?: any, tableId?: string | number, sessionId?: string): Promise<any>;
  stepUntilHumanTurn?(tableId?: string | number, maxSteps?: number): Promise<any>;
  step?(tableId?: string | number, maxSteps?: number): Promise<any>;
  close(): Promise<void>;
}

/**
 * Normalizes HTTP/HTTPS or WS/WSS base URLs to an absolute WebSocket endpoint URL.
 */
export function normalizeWsUrl(
  inputUrl?: string,
  defaultPath: string = '/api/events',
  envUrlKey: string = 'CURATOR_SERVER_URL'
): string {
  const fallback = process.env[envUrlKey] || process.env.POKER_SERVER_URL || 'http://127.0.0.1:4000';
  const base = (inputUrl || fallback).replace(/\/+$/, '');
  let wsOrigin = base;
  if (wsOrigin.startsWith('http://')) {
    wsOrigin = wsOrigin.replace(/^http:\/\//, 'ws://');
  } else if (wsOrigin.startsWith('https://')) {
    wsOrigin = wsOrigin.replace(/^https:\/\//, 'wss://');
  } else if (!wsOrigin.startsWith('ws://') && !wsOrigin.startsWith('wss://')) {
    wsOrigin = `ws://${wsOrigin}`;
  }
  return wsOrigin.endsWith(defaultPath) ? wsOrigin : `${wsOrigin}${defaultPath}`;
}

/**
 * Creates a universal network-backed channel communicating with an external
 * Curator Server over WebSockets.
 */
export async function createWebSocketChannel(
  options: WebSocketChannelOptions = {}
): Promise<CuratorChannel> {
  const defaultPath = options.defaultPath || '/api/events';
  const envKey = options.envUrlKey || 'CURATOR_SERVER_URL';
  const rawWsUrl = normalizeWsUrl(options.serverUrl, defaultPath, envKey);
  const targetId = options.targetId ?? options.tableId;
  const targetIdStr = targetId !== undefined ? String(targetId) : undefined;
  const filterKey = options.channelFilterKey || 'table';

  const wsUrl = targetIdStr
    ? `${rawWsUrl}${rawWsUrl.includes('?') ? '&' : '?'}${filterKey}=${encodeURIComponent(targetIdStr)}`
    : rawWsUrl;

  const ws = new WebSocket(wsUrl);
  const listeners: Set<(event: any) => void> = new Set();
  let clientSessionId: string | undefined = undefined;

  await new Promise<void>((resolve, reject) => {
    (ws as any).once('open', () => {
      if (targetIdStr) {
        ws.send(JSON.stringify({ type: 'subscribe', [filterKey]: targetIdStr, tableId: targetIdStr }));
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
    targetId: targetIdStr,
    get tableId() {
      return targetIdStr;
    },
    on(handler: (event: any) => void) {
      listeners.add(handler);
      return () => listeners.delete(handler);
    },
    async send(type: string, payload?: any) {
      ws.send(
        JSON.stringify({
          type,
          tableId: targetIdStr,
          targetId: targetIdStr,
          sessionId: clientSessionId,
          payload,
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
 * Creates a universal direct in-process channel executing against an active
 * session target without network ports or HTTP/WS overhead.
 */
export function createDirectChannel(
  session: DirectChannelTarget,
  targetId?: string | number
): CuratorChannel {
  let activeTargetId = String(
    targetId !== undefined ? targetId : session.tableId ?? session.conversationId ?? '1'
  );

  const eventSource = session.host?.events ?? session.events;

  return {
    targetId: activeTargetId,
    get tableId() {
      return activeTargetId;
    },
    set tableId(id: string | undefined) {
      if (id !== undefined) activeTargetId = String(id);
    },
    on(handler: (event: any) => void) {
      if (eventSource && typeof (eventSource as any).onEvent === 'function') {
        return (eventSource as any).onEvent(handler);
      }
      return () => {};
    },
    async send(type: string, payload?: any) {
      await session.submitEvent(type, payload, activeTargetId);
      if (typeof session.stepUntilHumanTurn === 'function') {
        await session.stepUntilHumanTurn(activeTargetId);
      } else if (typeof session.step === 'function') {
        await session.step(activeTargetId);
      }
    },
    async start() {
      if (typeof session.stepUntilHumanTurn === 'function') {
        await session.stepUntilHumanTurn(activeTargetId);
      } else if (typeof session.step === 'function') {
        await session.step(activeTargetId);
      }
    },
    async close() {
      await session.close();
    },
  };
}
