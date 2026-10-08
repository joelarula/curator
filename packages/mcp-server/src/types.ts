import type { CuratorEngine } from '@curator/agent-server';
import type { CuratorHost } from '@curator/host';

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
  engine: CuratorEngine;
  prisma: any;
  host?: CuratorHost;
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
