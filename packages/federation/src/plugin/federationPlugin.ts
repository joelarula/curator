import { defineTool, type CuratorPluginDefinition } from '../../../../curator/dist/src/index.js';
import type { PeerConnectionManager } from '../mesh/PeerConnectionManager.js';
import {
  createAgentMessageEnvelope,
  type SpeechAct,
  type ConversationType,
  type VoteChoice,
} from '../conversations/index.js';

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

  // 5. Tool: Send Agent Message Envelope
  const sendAgentMessageTool = defineTool({
    name: 'mesh_send_agent_message',
    description: 'Sends a structured agentic message envelope across the mesh using formal SpeechActs',
    accessLevel: 'read_only',
    mcp: { expose: true },
    parameters: {
      type: 'object',
      properties: {
        conversationId: { type: 'string', description: 'Unique conversation or room identifier' },
        conversationType: { type: 'string', enum: ['dialog', 'monolog', 'forum', 'qa'], default: 'dialog' },
        speechAct: {
          type: 'string',
          enum: ['INFORM', 'QUERY', 'REQUEST', 'PROPOSE', 'ACCEPT', 'REJECT', 'VOTE', 'SYNTHESIZE', 'ACK'],
        },
        recipientNodeId: { type: 'string', description: "Recipient node ID, 'local', or '*' for broadcast", default: '*' },
        recipientAgentId: { type: 'string', description: 'Recipient agent ID' },
        recipientRole: { type: 'string', description: 'Target communicative role (e.g. critic, chair)' },
        topic: { type: 'string', description: 'Conversational topic or RFC name' },
        payload: { type: 'object', description: 'Message payload data', default: {} },
        turn: { type: 'number', description: 'Conversation turn index', default: 1 },
      },
      required: ['conversationId', 'speechAct', 'payload'],
    },
    execute: async (input) => {
      const {
        conversationId,
        conversationType = 'dialog',
        speechAct,
        recipientNodeId = '*',
        recipientAgentId = 'all',
        recipientRole,
        topic,
        payload = {},
        turn = 1,
      } = input as any;

      const isBroadcast = recipientNodeId === '*' || !recipientAgentId;
      const recipients = isBroadcast
        ? '*'
        : [{ nodeId: recipientNodeId, agentId: recipientAgentId, role: recipientRole }];

      const envelope = createAgentMessageEnvelope({
        conversationId,
        conversationType: conversationType as ConversationType,
        speechAct: speechAct as SpeechAct,
        sender: {
          nodeId: manager.config.peerId,
          agentId: 'curator_agent',
        },
        recipients,
        topic,
        payload,
        turn,
      });

      await manager.router.routeOutbound(envelope);

      return {
        status: 'sent',
        messageId: envelope.messageId,
        conversationId,
        speechAct,
        turn: envelope.turn,
      };
    },
  });

  // 6. Tool: Forum Deliberation Action
  const postForumTool = defineTool({
    name: 'mesh_post_forum',
    description: 'Submits a proposal, casts a vote, or concludes a consensus synthesis in a multi-agent forum',
    accessLevel: 'read_only',
    mcp: { expose: true },
    parameters: {
      type: 'object',
      properties: {
        roomUri: { type: 'string', description: 'Forum room URI (e.g. curator://forums/rfc-42)' },
        action: { type: 'string', enum: ['propose', 'vote', 'synthesize'] },
        title: { type: 'string', description: 'Proposal title (required for propose)' },
        payload: { type: 'object', description: 'Proposal payload or rationale' },
        ballot: { type: 'string', enum: ['approve', 'reject', 'abstain'], description: 'Vote choice (required for vote)' },
        rationale: { type: 'string', description: 'Rationale for vote' },
        conclusion: { type: 'string', description: 'Consensus synthesis conclusion (required for synthesize)' },
      },
      required: ['roomUri', 'action'],
    },
    execute: async (input) => {
      const { roomUri, action, title, payload = {}, ballot, rationale, conclusion } = input as any;

      let speechAct: SpeechAct = 'PROPOSE';
      let msgPayload: any = payload;

      if (action === 'vote') {
        speechAct = 'VOTE';
        msgPayload = { ballot: ballot as VoteChoice, rationale, ...payload };
      } else if (action === 'synthesize') {
        speechAct = 'SYNTHESIZE';
        msgPayload = { conclusion, ...payload };
      } else {
        speechAct = 'PROPOSE';
        msgPayload = { title, ...payload };
      }

      const envelope = createAgentMessageEnvelope({
        conversationId: roomUri,
        conversationType: 'forum',
        speechAct,
        sender: {
          nodeId: manager.config.peerId,
          agentId: 'curator_agent',
        },
        recipients: '*',
        topic: title || roomUri,
        payload: msgPayload,
      });

      await manager.router.routeOutbound(envelope);

      return {
        status: 'posted',
        action,
        roomUri,
        messageId: envelope.messageId,
        speechAct,
      };
    },
  });

  // 7. Tool: Ask Network / QA Tender Solicitation
  const askNetworkTool = defineTool({
    name: 'mesh_ask_network',
    description: 'Broadcasts a Q&A or RFP task solicitation across the peer mesh',
    accessLevel: 'read_only',
    mcp: { expose: true },
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The question or task specification to solicit' },
        topic: { type: 'string', description: 'Subject or category' },
        timeoutMs: { type: 'number', description: 'Timeout window in ms for bidding', default: 15000 },
        requiredTools: { type: 'array', items: { type: 'string' }, description: 'Required MCP tool capabilities' },
      },
      required: ['query'],
    },
    execute: async (input) => {
      const { query, topic, timeoutMs = 15000, requiredTools = [] } = input as any;
      const conversationId = `qa_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      const envelope = createAgentMessageEnvelope({
        conversationId,
        conversationType: 'qa',
        speechAct: 'QUERY',
        sender: {
          nodeId: manager.config.peerId,
          agentId: 'requester',
        },
        recipients: '*',
        topic,
        payload: { query, requiredTools, timeoutMs },
        expiresInMs: timeoutMs,
      });

      await manager.router.routeOutbound(envelope);

      return {
        status: 'solicited',
        conversationId,
        query,
        timeoutMs,
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
      mesh_send_agent_message: sendAgentMessageTool,
      mesh_post_forum: postForumTool,
      mesh_ask_network: askNetworkTool,
    },
  };
}
