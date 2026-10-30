import type { CuratorEngine, ExposurePolicyController, PeerSessionContext } from '@curator/agent-server';
import type { CuratorHost } from '@curator/host';
import type { McpToolExecutor } from './McpToolRegistry.js';

export type McpTransport =
  | 'stdio'
  | {
      http: {
        port: number;
        /** MCP endpoint path, default `/mcp`. */
        path?: string;
        /** Bind address, default `127.0.0.1`. */
        host?: string;
        /** Externally visible base URL (resource identifier in RFC 9728 metadata); default from the Host header. */
        publicUrl?: string;
      };
    };

/** Curator actor a verified MCP caller acts as: tool Requests run with this user and project. */
export interface McpActor {
  userId: string;
  projectId?: string;
  roleNames?: string[];
}

/** Session for one MCP call: peer (exposure policy) plus the authenticated actor, when there is one. */
export type McpCallSession = PeerSessionContext & { actor?: McpActor };

export interface McpAuthenticatedCaller {
  issuer: string;
  subject: string;
  email?: string;
  actor: McpActor;
}

/**
 * Bearer authentication for the HTTP transport (Pattern 4: the IdP's token, verified locally).
 * Unauthenticated requests get 401 with RFC 9728 `resource_metadata`, so clients discover the IdP.
 */
export interface McpHttpAuth {
  /** Verifies the bearer token and maps the caller to a Curator actor; null/throw = 401. */
  authenticate(token: string): Promise<McpAuthenticatedCaller | null>;
  /** Issuers clients should sign in with (RFC 9728 `authorization_servers`). */
  authorizationServers: string[];
  scopesSupported?: string[];
}

export interface McpLogger {
  log?: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

export interface McpServerConfig {
  name?: string;
  version?: string;
  /** Tool listing source. Default: `host.engine`. Durable execution only sees tools in the executor's engine. */
  engine?: CuratorEngine;
  prisma?: any;
  /** Curator host: tools run as Requests via `host.runTool` (database + engine). */
  host?: CuratorHost;
  /** Explicit durable executor when no host is given (e.g. CuratorRequestProcessor.runToolRequest). */
  execute?: McpToolExecutor;
  exposureController?: ExposurePolicyController;
  session?: PeerSessionContext;
  transport?: McpTransport;
  /** Extra plugins to register before building registry (mcpCorePlugin & mcpOrchestrationPlugin) */
  registerBuiltinPlugins?: boolean;
  logger?: McpLogger;
  /** Required for the HTTP transport unless `allowAnonymousHttp` is set. */
  auth?: McpHttpAuth;
  /** Serve HTTP without authentication (loopback development only); calls run as the host session. */
  allowAnonymousHttp?: boolean;
}

export interface McpToolDeclaration {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** MCP tool annotations (readOnlyHint, destructiveHint) derived from the Curator access level. */
  annotations?: Record<string, boolean>;
}

export interface McpCallResult {
  content: Array<{ type: 'text' | string; text: string; [key: string]: unknown }>;
  isError?: boolean;
  [key: string]: unknown;
}
