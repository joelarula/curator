import type { CuratorHost } from '../../../host/dist/index.js';
import type { FederationConfig, FederatedMesh, PeerDescriptor } from '../types.js';
import { PeerConnectionManager } from './PeerConnectionManager.js';
import { createFederationPlugin } from '../plugin/federationPlugin.js';

export async function withFederation(
  host: CuratorHost,
  config: FederationConfig
): Promise<FederatedMesh> {
  const manager = new PeerConnectionManager(host, config);
  const plugin = createFederationPlugin(manager);

  // Register federation plugin tools into the local host engine
  host.engine.registerPlugin(plugin);

  return {
    host,
    config,
    peers: manager.peers,
    remoteTools: manager.remoteTools,
    broadcastEvent: (topic, payload) => manager.eventBridge.emitMeshEvent(topic, payload),
    invokeRemoteTool: (peerId, toolName, args) => manager.invokeRemoteTool(peerId, toolName, args),
    addPeer: async (peer: PeerDescriptor) => await manager.addPeer(peer),
    removePeer: async (peerId: string) => await manager.removePeer(peerId),
    getPlugin: () => plugin,
    close: async () => await manager.close(),
  };
}
