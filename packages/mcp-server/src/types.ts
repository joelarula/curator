import type { CuratorEngine, ExposurePolicyController, PeerSessionContext } from '@curator/agent-server';
import type { CuratorHost } from '@curator/host';
import type { McpToolExecutor } from './McpToolRegistry.js';

export type McpTransport = 'stdio' | { http: { port: number; path?: string } };

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
}

export interface McpToolDeclaration {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpCallResult {
  content: Array<{ type: 'text' | string; text: string; [key: string]: unknown }>;
  isError?: boolean;
  [key: string]: unknown;
}
