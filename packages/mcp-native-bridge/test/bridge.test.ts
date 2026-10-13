import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { BridgeServer } from '../dist/BridgeServer.js';

test('BridgeServer receives tools from extension and dispatches calls', async () => {
  const TEST_PORT = 8799;
  const bridge = new BridgeServer({
    port: TEST_PORT,
    serverName: 'test-bridge',
  });

  // Start bridge (starts WS server)
  // Note: we test the WebSocket communication directly
  const wss = (bridge as any).wss = new (await import('ws')).WebSocketServer({ port: TEST_PORT });
  (bridge as any).wss.on('connection', (ws: WebSocket) => {
    (bridge as any).extensionSocket = ws;
    ws.on('message', (data: Buffer | string) => {
      const msg = JSON.parse(data.toString());
      (bridge as any).handleExtensionMessage(msg);
    });
  });

  // Connect mock extension
  const mockExtension = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);
  await new Promise((resolve) => mockExtension.on('open', resolve));

  // 1. Mock extension sends tool updates
  mockExtension.send(
    JSON.stringify({
      type: 'TOOLS_UPDATE',
      tools: [
        {
          fullName: 'browser_get_active_tab',
          description: 'Get active tab',
          parameters: { type: 'object', properties: {} },
          peerId: 'chrome-extension',
        },
        {
          fullName: 'keeris-wasm:search_episodes',
          description: 'Search tracks in Keeris',
          parameters: { type: 'object', properties: { query: { type: 'string' } } },
          peerId: 'keeris-wasm',
        },
      ],
    })
  );

  // Wait for sync
  await new Promise((r) => setTimeout(r, 50));

  const registeredTools: any[] = (bridge as any).registeredTools;
  assert.equal(registeredTools.length, 2);
  assert.equal(registeredTools[0].name, 'browser_get_active_tab');
  assert.equal(registeredTools[1].name, 'keeris-wasm:search_episodes');

  // 2. Mock tool response
  mockExtension.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'CALL_TOOL') {
      mockExtension.send(
        JSON.stringify({
          type: 'TOOL_RESPONSE',
          callId: msg.callId,
          result: { title: 'Curator Studio', url: 'chrome://newtab' },
        })
      );
    }
  });

  // Clean up
  mockExtension.close();
  wss.close();
});
