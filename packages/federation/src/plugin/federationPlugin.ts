import { defineTool, type CuratorPluginDefinition } from '../../../../curator/dist/src/index.js';
import type { PeerConnectionManager } from '../mesh/PeerConnectionManager.js';

export function createFederationPlugin(manager: PeerConnectionManager): CuratorPluginDefinition {
  // 1. Tool: List Connected Peers & Federated Tools
  const listPeersTool = defineTool({
    name: 'mesh_list_peers',
    description: 'Lists all connected federation peers, connection status, and remote proxy tools',
    accessLevel: 'read_only',
    mcp: { expose: true },
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      const peerList = [];
      for (const [id, peer] of manager.peers.entries()) {
        const toolsForPeer = [...manager.remoteTools.keys()].filter((name) =>
          name.startsWith(`${peer.name || peer.id}:`)
        );

        peerList.push({
          id,
          name: peer.name || peer.id,
          status: peer.status || 'connected',
          mcpUrl: peer.mcpUrl,
          eventsUrl: peer.eventsUrl,
          lastSeen: peer.lastSeen,
          toolsCount: toolsForPeer.length,
          tools: toolsForPeer,
        });
      }

      return {
        localPeerId: manager.config.peerId,
        peersCount: peerList.length,
        peers: peerList,
        totalRemoteTools: manager.remoteTools.size,
      };
    },
  });

  // 2. Tool: Invoke Remote Tool on a Specific Peer
  const invokeRemoteTool = defineTool({
    name: 'mesh_invoke_remote',
    description: 'Invokes a tool on a connected remote peer via MCP protocol',
    accessLevel: 'read_only',
    mcp: { expose: true },
    parameters: {
      type: 'object',
      properties: {
        peerId: { type: 'string', description: 'Peer ID or Name' },
        toolName: { type: 'string', description: 'Original tool name on the remote peer' },
        args: { type: 'object', description: 'JSON arguments for the tool', default: {} },
      },
      required: ['peerId', 'toolName'],
    },
    execute: async (input) => {
      const { peerId, toolName, args } = input as {
        peerId: string;
        toolName: string;
        args?: Record<string, unknown>;
      };

      const result = await manager.invokeRemoteTool(peerId, toolName, args || {});
      return {
        peerId,
        toolName,
        status: 'completed',
        result,
      };
    },
  });

  // 3. Tool: Broadcast Mesh Event
  const broadcastEventTool = defineTool({
    name: 'mesh_broadcast_event',
    description: 'Broadcasts a distributed lifecycle or domain event across the peer mesh',
    accessLevel: 'read_only',
    mcp: { expose: true },
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Event topic identifier (e.g. task:update)' },
        payload: { type: 'object', description: 'Event payload object' },
      },
      required: ['topic', 'payload'],
    },
    execute: async (input) => {
      const { topic, payload } = input as { topic: string; payload: any };
      manager.eventBridge.emitMeshEvent(topic, payload);
      return {
        status: 'broadcasted',
        sourcePeer: manager.config.peerId,
        topic,
        timestamp: new Date().toISOString(),
      };
    },
  });

  // 4. Tool: Dynamically Add Peer
  const addPeerTool = defineTool({
    name: 'mesh_add_peer',
    description: 'Dynamically connects and registers a new peer into the mesh at runtime',
    accessLevel: 'read_only',
    mcp: { expose: true },
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Unique peer identifier' },
        name: { type: 'string', description: 'Friendly peer name' },
        mcpUrl: { type: 'string', description: 'HTTP MCP endpoint URL' },
        eventsUrl: { type: 'string', description: 'WebSocket events URL' },
      },
      required: ['id'],
    },
    execute: async (input) => {
      const peer = input as any;
      await manager.addPeer(peer);
      return {
        status: 'peer_added',
        peerId: peer.id,
      };
    },
  });

  return {
    name: 'curator-federation',
    description: 'Peer-to-Peer Curator Host Federation & Distributed Mesh Tools',
    mcp: { exposeAll: true },
    tools: {
      mesh_list_peers: listPeersTool,
      mesh_invoke_remote: invokeRemoteTool,
      mesh_broadcast_event: broadcastEventTool,
      mesh_add_peer: addPeerTool,
    },
  };
}
