import type { PeerDescriptor } from '../types.js';

export interface McpRemoteToolItem {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export class McpPeerClient {
  constructor(public readonly peer: PeerDescriptor) {}

  /**
   * Fetches the list of exposed tools from the remote peer's MCP endpoint.
   */
  public async listTools(): Promise<McpRemoteToolItem[]> {
    if (!this.peer.mcpUrl) {
      return [];
    }

    try {
      // For HTTP/JSON-RPC MCP endpoints
      const res = await fetch(`${this.peer.mcpUrl}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/list',
          params: {},
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data: any = await res.json();
      if (data.error) {
        throw new Error(data.error.message || 'MCP JSON-RPC Error');
      }

      return data.result?.tools || [];
    } catch (err: any) {
      console.warn(`[McpPeerClient] Failed to list tools from peer "${this.peer.id}":`, err?.message || err);
      return [];
    }
  }

  /**
   * Calls an exposed tool on the remote peer over MCP JSON-RPC.
   */
  public async callTool(toolName: string, args: Record<string, unknown> = {}): Promise<any> {
    if (!this.peer.mcpUrl) {
      throw new Error(`Peer "${this.peer.id}" does not have an mcpUrl configured.`);
    }

    const res = await fetch(`${this.peer.mcpUrl}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`MCP call failed with HTTP ${res.status}: ${res.statusText}`);
    }

    const data: any = await res.json();
    if (data.error) {
      throw new Error(data.error.message || 'Remote MCP Tool Execution Error');
    }

    // Extract text/json content from MCP response format
    const content = data.result?.content || [];
    if (Array.isArray(content) && content.length > 0) {
      const textItem = content.find((c: any) => c.type === 'text');
      if (textItem?.text) {
        try {
          return JSON.parse(textItem.text);
        } catch {
          return textItem.text;
        }
      }
    }

    return data.result;
  }
}
