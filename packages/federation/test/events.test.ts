import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeshEnvelope, MeshDeduplicator } from '../dist/events/MeshEnvelope.js';
import { createFederationPlugin } from '../dist/plugin/federationPlugin.js';

test('MeshDeduplicator tracks seen event IDs and avoids duplicates', () => {
  const deduplicator = new MeshDeduplicator(5);

  const env1 = createMeshEnvelope('host-1', 'task:start', { id: 1 });
  const env2 = createMeshEnvelope('host-1', 'task:start', { id: 2 });

  assert.equal(deduplicator.hasSeen(env1.id), false);
  deduplicator.markSeen(env1.id);
  assert.equal(deduplicator.hasSeen(env1.id), true);

  assert.equal(deduplicator.hasSeen(env2.id), false);
  deduplicator.markSeen(env2.id);
  assert.equal(deduplicator.hasSeen(env2.id), true);
});

test('createMeshEnvelope generates valid structure with timestamps and hops', () => {
  const env = createMeshEnvelope('host-alpha', 'entity:discovered', { count: 42 });
  assert.ok(env.id.startsWith('mesh_'));
  assert.equal(env.sourcePeer, 'host-alpha');
  assert.equal(env.topic, 'entity:discovered');
  assert.equal(env.hops, 0);
  assert.equal(env.payload.count, 42);
  assert.ok(new Date(env.timestamp).getTime() > 0);
});

test('createFederationPlugin exports standard federation tools', () => {
  const mockManager: any = {
    config: { peerId: 'local-test' },
    peers: new Map([['peer-1', { id: 'peer-1', name: 'remote-node', status: 'connected' }]]),
    remoteTools: new Map([['remote-node:ping', {}]]),
    eventBridge: {
      emitMeshEvent: () => {},
    },
    invokeRemoteTool: async () => ({ ok: true }),
    addPeer: async () => {},
  };

  const plugin = createFederationPlugin(mockManager);
  assert.equal(plugin.name, 'curator-federation');
  assert.ok(plugin.tools?.mesh_list_peers);
  assert.ok(plugin.tools?.mesh_invoke_remote);
  assert.ok(plugin.tools?.mesh_broadcast_event);
  assert.ok(plugin.tools?.mesh_add_peer);
});
