import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpAuthenticatedCaller, McpCallSession, McpHttpAuth, McpLogger } from './types.js';

export interface McpHttpHandlerOptions {
  /** Builds a fresh MCP Server bound to one call session (stateless Streamable HTTP). */
  createServer(session: McpCallSession | undefined): Server;
  path?: string;
  auth?: McpHttpAuth;
  allowAnonymous?: boolean;
  publicUrl?: string;
  /** Session for anonymous calls (allowAnonymous) */
  anonymousSession?: McpCallSession;
  maxBodyBytes?: number;
  logger?: McpLogger;
}

/** Returns true when it handled the request; false lets the caller route it elsewhere (e.g. Express `next`). */
export type McpHttpHandler = (req: IncomingMessage, res: ServerResponse, parsedBody?: unknown) => Promise<boolean>;

const json = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
};

async function readJsonBody(req: IncomingMessage, limit: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw Object.assign(new Error('Request body too large'), { status: 413 });
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

/**
 * Streamable HTTP endpoint for a Curator MCP server, stateless: every request gets its own Server and
 * transport. With `auth`, callers must present a bearer token (e.g. a Google id_token) that maps to a
 * Curator actor; RFC 9728 protected resource metadata tells clients where to sign in.
 */
export function createMcpHttpHandler(options: McpHttpHandlerOptions): McpHttpHandler {
  const path = options.path ?? '/mcp';
  const metadataPaths = new Set([`/.well-known/oauth-protected-resource${path}`, '/.well-known/oauth-protected-resource']);
  const limit = options.maxBodyBytes ?? 1024 * 1024;
  if (!options.auth && !options.allowAnonymous) {
    throw new Error('MCP over HTTP requires `auth` (or allowAnonymousHttp for loopback development)');
  }

  const baseUrl = (req: IncomingMessage) => (options.publicUrl ?? `http://${req.headers.host ?? 'localhost'}`).replace(/\/+$/, '');
  const metadataUrl = (req: IncomingMessage) => `${baseUrl(req)}/.well-known/oauth-protected-resource${path}`;

  const unauthorized = (req: IncomingMessage, res: ServerResponse, error?: string) => {
    const params = [`resource_metadata="${metadataUrl(req)}"`];
    if (error) params.push(`error="${error}"`);
    json(res, 401, { error: error ?? 'unauthorized', error_description: 'Sign in with an accepted identity provider' }, {
      'WWW-Authenticate': `Bearer ${params.join(', ')}`,
    });
  };

  return async (req, res, parsedBody) => {
    const url = new URL(req.url ?? '/', 'http://local');

    if (req.method === 'GET' && metadataPaths.has(url.pathname)) {
      if (!options.auth) return false;
      json(res, 200, {
        resource: `${baseUrl(req)}${path}`,
        authorization_servers: options.auth.authorizationServers,
        bearer_methods_supported: ['header'],
        ...(options.auth.scopesSupported ? { scopes_supported: options.auth.scopesSupported } : {}),
      });
      return true;
    }
    if (url.pathname !== path) return false;

    let session: McpCallSession | undefined = options.anonymousSession;
    if (options.auth) {
      const header = req.headers.authorization ?? '';
      const match = /^Bearer\s+(\S+)$/i.exec(header);
      if (!match) {
        unauthorized(req, res);
        return true;
      }
      let caller: McpAuthenticatedCaller | null = null;
      try {
        caller = await options.auth.authenticate(match[1]);
      } catch (err: any) {
        options.logger?.warn?.(`[CuratorMCP] Rejected bearer token: ${err?.message || err}`);
      }
      if (!caller) {
        unauthorized(req, res, 'invalid_token');
        return true;
      }
      session = {
        peerId: `user:${caller.email ?? caller.subject}`,
        trustTier: 'collaborator',
        activeProjectId: caller.actor.projectId,
        roleNames: caller.actor.roleNames,
        actor: caller.actor,
      };
    }

    let body = parsedBody;
    if (req.method === 'POST' && body === undefined) {
      try {
        body = await readJsonBody(req, limit);
      } catch (err: any) {
        json(res, err.status ?? 400, { error: 'invalid_request', error_description: err.message });
        return true;
      }
    }

    const server = options.createServer(session);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (err: any) {
      options.logger?.error?.(`[CuratorMCP] HTTP request failed: ${err?.message || err}`);
      if (!res.headersSent) json(res, 500, { error: 'server_error' });
    }
    return true;
  };
}
