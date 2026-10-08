import { defineTool, type CuratorTool } from '../../../../curator/dist/src/index.js';
import type { PeerDescriptor } from '../types.js';

export interface RemoteProxyOptions {
  peer: PeerDescriptor;
  remoteName: string;
  description?: string;
  parameters?: Record<string, unknown>;
  localPrefix?: string;
  callRemote: (peerId: string, toolName: string, args: Record<string, unknown>) => Promise<any>;
}

export function createRemoteMcpProxyTool(options: RemoteProxyOptions): CuratorTool {
  const { peer, remoteName, description, parameters, localPrefix, callRemote } = options;
  const prefix = localPrefix ?? `${peer.name || peer.id}:`;
  const fullName = `${prefix}${remoteName}`;

  return defineTool({
    name: fullName,
    description: `[Federated from peer "${peer.name || peer.id}"] ${description || remoteName}`,
    accessLevel: 'read_only',
    mcp: {
      expose: false, // Don't re-expose remote tools on local MCP server by default to prevent proxy loops
    },
    parameters: parameters || {
      type: 'object',
      properties: {},
    },
    execute: async (args) => {
      return await callRemote(peer.id, remoteName, args as Record<string, unknown>);
    },
  });
}
