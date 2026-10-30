import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

export interface MockTool {
  description?: string;
  annotations?: Record<string, any>;
  handler: (args: any) => any;
}

export interface MockMcpOptions {
  label: string;
  tools: Record<string, MockTool>;
  resources?: { uri: string; name: string; mimeType?: string; text: string }[];
  templates?: { uriTemplate: string; name: string }[];
  prompts?: { name: string; description?: string; arguments?: { name: string; required?: boolean }[] }[];
  /** When set, requests need `Authorization: Bearer <token>`. */
  token?: string;
}

/** Stateless Streamable HTTP MCP server; `options` stays mutable so tests can change the catalog. */
export async function startMockMcpServer(options: MockMcpOptions) {
  const calls: { tool: string; args: any; auth?: string }[] = [];

  const buildServer = (auth?: string) => {
    const server = new Server(
      { name: `mock-${options.label}`, version: '2.1.0' },
      { capabilities: { tools: { listChanged: true }, resources: {}, prompts: {} }, instructions: `Mock server ${options.label}` }
    );
    // Two pages, to exercise cursor handling.
    server.setRequestHandler(ListToolsRequestSchema, async (req: any) => {
      const all = Object.entries(options.tools).map(([name, t]) => ({
        name,
        description: t.description ?? name,
        inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
        ...(t.annotations ? { annotations: t.annotations } : {}),
      }));
      const start = Number(req.params?.cursor ?? 0);
      const page = all.slice(start, start + 2);
      return { tools: page, ...(start + 2 < all.length ? { nextCursor: String(start + 2) } : {}) };
    });
    server.setRequestHandler(CallToolRequestSchema, async (req: any) => {
      const { name, arguments: args } = req.params;
      calls.push({ tool: name, args, auth });
      const tool = options.tools[name];
      if (!tool) return { isError: true, content: [{ type: 'text', text: `unknown tool ${name}` }] };
      const out = tool.handler(args);
      return typeof out === 'string'
        ? { content: [{ type: 'text', text: out }] }
        : { content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out };
    });
    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: (options.resources ?? []).map(({ uri, name, mimeType }) => ({ uri, name, mimeType })),
    }));
    server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: options.templates ?? [] }));
    server.setRequestHandler(ReadResourceRequestSchema, async (req: any) => {
      const found = options.resources?.find((r) => r.uri === req.params.uri);
      const text = found?.text ?? `generated:${req.params.uri}`;
      return { contents: [{ uri: req.params.uri, mimeType: found?.mimeType ?? 'text/plain', text }] };
    });
    server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: options.prompts ?? [] }));
    server.setRequestHandler(GetPromptRequestSchema, async (req: any) => ({
      description: `prompt ${req.params.name}`,
      messages: [{ role: 'user', content: { type: 'text', text: `${options.label}:${req.params.name}:${JSON.stringify(req.params.arguments ?? {})}` } }],
    }));
    return server;
  };

  const httpServer = http.createServer(async (req, res) => {
    const auth = req.headers.authorization;
    if (options.token && auth !== `Bearer ${options.token}`) {
      res.writeHead(401, { 'WWW-Authenticate': 'Bearer error="invalid_token"' }).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString('utf8');
    const body = raw ? JSON.parse(raw) : undefined;
    const server = buildServer(auth);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  });

  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}/mcp`;
  return {
    url,
    calls,
    options,
    close: () =>
      new Promise<void>((resolve) => {
        httpServer.closeAllConnections();
        httpServer.close(() => resolve());
      }),
  };
}
