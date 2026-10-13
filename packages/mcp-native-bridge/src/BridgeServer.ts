import { WebSocketServer, WebSocket } from 'ws';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

export interface BridgeConfig {
  port?: number;
  host?: string;
  serverName?: string;
  serverVersion?: string;
}

export interface RemoteToolDeclaration {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  peerId?: string;
}

export class BridgeServer {
  public readonly port: number;
  public readonly host: string;
  private wss: WebSocketServer | null = null;
  private extensionSocket: WebSocket | null = null;
  private mcpServer: Server;
  private registeredTools: RemoteToolDeclaration[] = [];
  private pendingCalls = new Map<string, {
    resolve: (val: any) => void;
    reject: (err: any) => void;
    timer: any;
  }>();

  constructor(config: BridgeConfig = {}) {
    this.port = config.port ?? 8765;
    this.host = config.host ?? '127.0.0.1';

    this.mcpServer = new Server(
      {
        name: config.serverName ?? 'curator-chrome-bridge',
        version: config.serverVersion ?? '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupMcpHandlers();
  }

  private setupMcpHandlers() {
    // 1. List Tools
    this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      if (this.registeredTools.length === 0) {
        return {
          tools: [
            {
              name: 'curator_extension_status',
              description: 'Check status of the Curator Chrome Extension connection to the desktop bridge',
              inputSchema: { type: 'object', properties: {} },
            },
          ],
        };
      }

      return {
        tools: this.registeredTools.map((t) => ({
          name: t.name,
          description: t.description || `Tool provided by ${t.peerId || 'Curator Chrome Extension'}`,
          inputSchema: t.inputSchema || t.parameters || { type: 'object', properties: {} },
        })),
      };
    });

    // 2. Call Tool
    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params;

      if (name === 'curator_extension_status') {
        const isConnected = !!this.extensionSocket && this.extensionSocket.readyState === WebSocket.OPEN;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  connected: isConnected,
                  toolsCount: this.registeredTools.length,
                  message: isConnected
                    ? 'Curator Chrome Extension is active and connected.'
                    : 'Chrome Extension is not connected. Ensure Chrome is running with the Curator extension installed and active.',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (!this.extensionSocket || this.extensionSocket.readyState !== WebSocket.OPEN) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error: Curator Chrome Extension is not currently connected to the desktop bridge. Please open Chrome or check the extension icon.`,
            },
          ],
        };
      }

      const callId = `mcp_call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      try {
        const result = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            this.pendingCalls.delete(callId);
            reject(new Error(`Tool call "${name}" to Chrome Extension timed out after 45 seconds.`));
          }, 45000);

          this.pendingCalls.set(callId, { resolve, reject, timer });

          this.extensionSocket?.send(
            JSON.stringify({
              type: 'CALL_TOOL',
              callId,
              toolName: name,
              args,
            })
          );
        });

        return {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error executing "${name}": ${err?.message || String(err)}`,
            },
          ],
        };
      }
    });
  }

  /**
   * Start the bridge: opens local WebSocket server for extension and connects stdio transport for MCP
   */
  public async listen(): Promise<void> {
    // Start WebSocket Server
    this.wss = new WebSocketServer({ port: this.port, host: this.host });

    this.wss.on('connection', (ws: WebSocket) => {
      this.extensionSocket = ws;
      console.error(`[Curator Bridge] Chrome Extension connected from ${ws.url || 'localhost'}`);

      ws.on('message', (data: Buffer | string) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleExtensionMessage(msg);
        } catch (err) {
          console.error('[Curator Bridge] Failed parsing message from extension:', err);
        }
      });

      ws.on('close', () => {
        console.error('[Curator Bridge] Chrome Extension disconnected.');
        if (this.extensionSocket === ws) {
          this.extensionSocket = null;
          this.registeredTools = [];
        }
      });
    });

    console.error(`[Curator Bridge] WebSocket listening on ws://${this.host}:${this.port}`);

    // Connect MCP Stdio Transport
    const stdioTransport = new StdioServerTransport();
    await this.mcpServer.connect(stdioTransport);
    console.error('[Curator Bridge] MCP Server listening on stdio transport.');
  }

  private handleExtensionMessage(msg: any) {
    switch (msg.type) {
      case 'REGISTER_TOOLS':
      case 'TOOLS_UPDATE': {
        const { tools = [] } = msg;
        this.registeredTools = tools.map((t: any) => ({
          name: t.fullName || t.name,
          description: t.description,
          inputSchema: t.inputSchema || t.parameters,
          parameters: t.parameters,
          peerId: t.peerId,
        }));
        console.error(`[Curator Bridge] Synced ${this.registeredTools.length} tools from Chrome Extension.`);
        break;
      }

      case 'TOOL_RESPONSE': {
        const { callId, result, error } = msg;
        const pending = this.pendingCalls.get(callId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingCalls.delete(callId);
          if (error) {
            pending.reject(new Error(error));
          } else {
            pending.resolve(result);
          }
        }
        break;
      }
    }
  }

  public async close(): Promise<void> {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    await this.mcpServer.close();
  }
}
