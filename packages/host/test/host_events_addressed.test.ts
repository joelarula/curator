import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import { CuratorHostEvents } from '../dist/events/CuratorHostEvents.js';

/** Collects the event types a socket receives (after the welcome handshake). */
function connect(port: number, query: string): Promise<{ ws: WebSocket; types: string[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws${query}`);
    const types: string[] = [];
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'connected') resolve({ ws, types });
      else types.push(msg.type);
    });
    ws.on('error', reject);
  });
}

const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

test('host events: addressed events reach only the identified participant; others reach everyone', async () => {
  const events = new CuratorHostEvents();
  const server = http.createServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as any).port;
  // The host's own sign-in decides the identity (here: a token -> user map)
  const tokens: Record<string, string> = { ta: 'alice', tb: 'bob' };
  events.attachWebSocketServer(server, '/ws', {
    identify: (req) => {
      const token = new URL(req.url, 'http://x').searchParams.get('token');
      return token && tokens[token] ? { userId: tokens[token] } : null;
    },
  });
  try {
    const alice = await connect(port, '?token=ta');
    const bob = await connect(port, '?token=tb');
    const anon = await connect(port, '');
    await tick();

    events.broadcast('conversation:message_delivered', { text: 'for alice' }, { target: 'user:alice' });
    events.broadcast('table_update', { x: 1 });
    await tick();

    assert.deepEqual(alice.types.filter((t) => t !== 'log'), ['conversation:message_delivered', 'table_update']);
    assert.deepEqual(bob.types.filter((t) => t !== 'log'), ['table_update']);
    assert.deepEqual(anon.types.filter((t) => t !== 'log'), ['table_update']);
    for (const c of [alice, bob, anon]) c.ws.close();
  } finally {
    events.close?.();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
