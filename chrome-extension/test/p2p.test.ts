import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerDiscoveryHub } from '../src/p2p/PeerDiscoveryHub.ts';
import type { PeerProtocolMessage } from '../src/p2p/types.ts';

test('PeerDiscoveryHub initializes with self descriptor and environment', () => {
  const hub = new PeerDiscoveryHub({
    hubId: 'test-hub',
    name: 'Test Extension Hub',
    localTools: [
      { name: 'browser_scrape_page', description: 'Scrape page' }
    ]
  });

  const peers = hub.listPeers();
  assert.equal(peers.length, 1);
  assert.equal(peers[0].id, 'test-hub');
  assert.equal(peers[0].environment.type, 'browser-extension');
  assert.equal(peers[0].environment.capabilities?.hasDomAccess, true);

  const tools = hub.listAllFederatedTools();
  assert.equal(tools.length, 1);
  assert.equal(tools[0].fullName, 'browser_scrape_page');
});

test('PeerDiscoveryHub handles peer announce, tool proxying, and response', async () => {
  let executeLocalCalled = false;
  const hub = new PeerDiscoveryHub({
    hubId: 'test-hub',
    localTools: [{ name: 'local_ping' }],
    executeLocalTool: async (toolName, args) => {
      executeLocalCalled = true;
      return { pong: true, args };
    }
  });

  // Mock port representing an in-browser MiniApp (e.g. Keeris)
  const portMessagesToClient: any[] = [];
  let portMessageListener: any = null;
  let portDisconnectListener: any = null;

  const mockPort: any = {
    name: 'curator-peer-bridge',
    sender: { origin: 'http://localhost:5173', tab: { id: 101 } },
    onMessage: {
      addListener: (fn: any) => { portMessageListener = fn; }
    },
    onDisconnect: {
      addListener: (fn: any) => { portDisconnectListener = fn; }
    },
    postMessage: (msg: any) => {
      portMessagesToClient.push(msg);

      // Auto-respond to tool calls
      if (msg.type === 'curator:peer:call_tool') {
        setTimeout(() => {
          portMessageListener?.({
            type: 'curator:peer:tool_response',
            callId: msg.callId,
            result: { episodes: [{ id: 1, title: 'Episode 1' }] }
          });
        }, 10);
      }
    }
  };

  hub.handlePortConnection(mockPort);

  // 1. MiniApp announces itself
  portMessageListener?.({
    type: 'curator:peer:announce',
    peer: {
      id: 'keeris-wasm',
      name: 'Keeris Media Studio',
      environment: {
        type: 'browser-wasm-miniapp',
        capabilities: { hasInteractiveUi: true, hasPersistentRelationalDb: true }
      },
      tools: [
        { name: 'search_episodes', description: 'Search audio tracks' }
      ]
    }
  });

  // Verify welcome message received by client
  assert.equal(portMessagesToClient.length, 1);
  assert.equal(portMessagesToClient[0].type, 'curator:peer:welcome');
  assert.equal(portMessagesToClient[0].hubId, 'test-hub');

  // Verify peers list in hub
  const peers = hub.listPeers();
  assert.equal(peers.length, 2);
  const keeris = peers.find(p => p.id === 'keeris-wasm');
  assert.ok(keeris);
  assert.equal(keeris.name, 'Keeris Media Studio');
  assert.equal(keeris.environment.type, 'browser-wasm-miniapp');

  // Verify federated tool listing
  const allTools = hub.listAllFederatedTools();
  const keerisTool = allTools.find(t => t.fullName === 'keeris-wasm:search_episodes');
  assert.ok(keerisTool);
  assert.equal(keerisTool.peerId, 'keeris-wasm');
  assert.equal(keerisTool.toolName, 'search_episodes');

  // 2. Call remote tool from Hub across mock port
  const toolResult = await hub.callRemoteTool('keeris-wasm', 'search_episodes', { query: 'test' });
  assert.deepEqual(toolResult, { episodes: [{ id: 1, title: 'Episode 1' }] });

  // 3. Test calling local hub tool from client
  portMessageListener?.({
    type: 'curator:peer:call_tool',
    callId: 'call_abc',
    targetPeerId: 'test-hub',
    toolName: 'local_ping',
    args: { num: 42 }
  });

  await new Promise(r => setTimeout(r, 20));
  assert.equal(executeLocalCalled, true);
  const localResp = portMessagesToClient.find(m => m.callId === 'call_abc');
  assert.ok(localResp);
  assert.equal(localResp.type, 'curator:peer:tool_response');
  assert.equal(localResp.result.pong, true);

  // 4. Test Disconnect
  portDisconnectListener?.();
  assert.equal(hub.listPeers().length, 1); // Only hub remains
});

test('PeerDiscoveryHub forwards events across peers with hops and deduplication', () => {
  const hub = new PeerDiscoveryHub({ hubId: 'test-hub' });

  const client1Messages: any[] = [];
  const client2Messages: any[] = [];

  const createMockPort = (messages: any[]) => ({
    name: 'curator-peer-bridge',
    sender: {},
    onMessage: { addListener: () => {} },
    onDisconnect: { addListener: () => {} },
    postMessage: (m: any) => messages.push(m)
  });

  const port1: any = createMockPort(client1Messages);
  const port2: any = createMockPort(client2Messages);

  // Directly register ports
  (hub as any).peerPorts.set('peer-1', port1);
  (hub as any).peerPorts.set('peer-2', port2);

  const envelope = {
    id: 'mesh_evt_1',
    sourcePeer: 'peer-1',
    topic: 'content:scraped',
    timestamp: new Date().toISOString(),
    hops: 0,
    payload: { url: 'https://example.com' }
  };

  hub.broadcastEvent(envelope);

  // Peer 1 should NOT receive its own event
  assert.equal(client1Messages.length, 0);
  // Peer 2 SHOULD receive the event with hops incremented
  assert.equal(client2Messages.length, 1);
  assert.equal(client2Messages[0].type, 'curator:peer:event');
  assert.equal(client2Messages[0].envelope.hops, 1);
  assert.equal(client2Messages[0].envelope.topic, 'content:scraped');

  // Broadcasting again with same ID should be dropped by deduplicator
  hub.broadcastEvent(envelope);
  assert.equal(client2Messages.length, 1); // Unchanged
});
