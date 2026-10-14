import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerConnectionManager } from '../dist/mesh/PeerConnectionManager.js';
import { EventEmitter } from 'events';
import { ExposurePolicyController, CuratorEngine } from '../../../curator/dist/src/index.js';

test('PeerConnectionManager wires exposure_changed to mesh:tools:list_changed and resyncs dynamically', async () => {
  const events = new EventEmitter() as any;
  events.broadcast = (type: string, payload: any) => events.emit('event', { type, payload });
  events.onEvent = (fn: any) => events.on('event', fn);

  const exposure = new ExposurePolicyController();
  const engine = new CuratorEngine();

  const mockHost: any = {
    events,
    engine,
    conversations: {
      exposure,
      setRemoteTransport: () => {},
      routeInbound: async () => {},
    },
  };

  const emittedMeshEvents: Array<{ topic: string; payload: any }> = [];

  const manager = new PeerConnectionManager(mockHost, {
    peerId: 'local-node',
  });

  // Intercept mesh event emission
  (manager.eventBridge as any).emitMeshEvent = (topic: string, payload: any) => {
    emittedMeshEvents.push({ topic, payload });
  };

  // 1. Trigger exposure change on the local host (e.g. granted ephemeral lease)
  exposure.grantLease({
    toolName: 'sensitive_tool',
    granteePeerId: 'remote-node',
    durationMs: 60000,
  });

  assert.equal(emittedMeshEvents.length, 1);
  assert.equal(emittedMeshEvents[0].topic, 'mesh:tools:list_changed');
  assert.equal(emittedMeshEvents[0].payload.peerId, 'local-node');

  // 2. Simulate remote peer and incoming mesh:tools:list_changed
  let listToolsCalls = 0;
  const mockClient: any = {
    listTools: async () => {
      listToolsCalls++;
      return listToolsCalls === 1
        ? [{ name: 'tool_a', description: 'Tool A', inputSchema: {} }]
        : [{ name: 'tool_a', description: 'Tool A', inputSchema: {} }, { name: 'tool_b_leased', description: 'Leased Tool B', inputSchema: {} }];
    },
  };

  const peerDesc = { id: 'remote-node', name: 'remote' };
  manager.peers.set('remote-node', peerDesc);
  (manager as any).mcpClients.set('remote-node', mockClient);

  // Initial sync
  await manager.syncPeerTools(peerDesc, mockClient);
  assert.ok(manager.remoteTools.has('remote:tool_a'));
  assert.ok(!manager.remoteTools.has('remote:tool_b_leased'));

  // Now incoming notification that remote-node's tools changed (e.g. lease granted to us)
  events.emit('event', {
    type: 'mesh:tools:list_changed',
    payload: {
      _isMesh: true,
      peerId: 'remote-node',
    },
  });

  // Give async handler a tick to complete
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(listToolsCalls, 2);
  assert.ok(manager.remoteTools.has('remote:tool_a'));
  assert.ok(manager.remoteTools.has('remote:tool_b_leased'), 'remote:tool_b_leased should be dynamically registered upon list_changed notification');
});
