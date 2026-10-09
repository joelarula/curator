import type { Express } from 'express';
import type { Server } from 'node:http';
import type { CuratorHost } from '@curator/host';
import type { GraphQLSchema } from 'graphql';

export interface CuratorRouterOptions {
  customGraphQLResolvers?: Record<string, any>;
  customGraphQLSchema?: GraphQLSchema;
  customGraphQLTypeDefs?: string;
  sqliteDbPath?: string;
}

export interface CuratorServerOptions {
  port?: number;
  webDistPath?: string;
  wsPath?: string;
  cors?: boolean;
  routerOptions?: CuratorRouterOptions;
  autoStartProcessor?: boolean;
  pollingIntervalMs?: number;
  beforeMiddleware?: (app: Express) => void;
  afterRoutes?: (app: Express) => void;
}

export interface CuratorServerInstance {
  app: Express;
  server: Server;
  host: CuratorHost;
  start(port?: number): Promise<{ port: number; url: string }>;
  stop(): Promise<void>;
}
