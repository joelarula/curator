import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import type { CuratorHost } from '@curator/host';
import { createCuratorRouter, type CuratorRouterOptions } from './createCuratorRouter.js';

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
  server: http.Server;
  host: CuratorHost;
  start(port?: number): Promise<{ port: number; url: string }>;
  stop(): Promise<void>;
}

export async function createCuratorServer(
  host: CuratorHost,
  options: CuratorServerOptions = {}
): Promise<CuratorServerInstance> {
  const app = express();
  const wsPath = options.wsPath || '/api/events';
  const autoStart = options.autoStartProcessor ?? true;
  const pollingIntervalMs = options.pollingIntervalMs ?? 1000;

  // 1. Auto-start host processor if requested
  if (autoStart) {
    await host.start(pollingIntervalMs);
  }

  // 2. Base middlewares (CORS & JSON parsing)
  if (options.cors !== false) {
    app.use((_req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      if (_req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }
      next();
    });
  }

  app.use(express.json({ limit: '50mb' }));

  // 3. User-defined pre-middleware hook
  if (options.beforeMiddleware) {
    options.beforeMiddleware(app);
  }

  // 4. Mount Core Curator Router (REST + Coffee compiler + GraphQL)
  const curatorRouter = createCuratorRouter(host, options.routerOptions);
  app.use(curatorRouter);

  // 5. User-defined post-routes hook (for domain specific routes)
  if (options.afterRoutes) {
    options.afterRoutes(app);
  }

  // 6. Static frontend SPA hosting if dist exists
  if (options.webDistPath && fs.existsSync(options.webDistPath)) {
    app.use(express.static(options.webDistPath));
    app.get('*', (req, res, next) => {
      // Do not catch API or GraphQL routes
      if (req.path.startsWith('/api') || req.path.startsWith('/graphql')) {
        return next();
      }
      const indexPath = path.resolve(options.webDistPath!, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        next();
      }
    });
  }

  // 7. Create HTTP Server & attach real-time WebSocket events
  const server = http.createServer(app);
  host.events.attachWebSocketServer(server, wsPath);

  let isStopping = false;
  const stop = async () => {
    if (isStopping) return;
    isStopping = true;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await host.stop();
  };

  const instance: CuratorServerInstance = {
    app,
    server,
    host,
    async start(customPort?: number) {
      const activePort = Number(customPort || options.port || process.env.PORT || 4100);
      return new Promise<{ port: number; url: string }>((resolve, reject) => {
        server.listen(activePort, () => {
          const url = `http://localhost:${activePort}`;
          console.log(`[CuratorServer:${host.config?.name || 'curator'}] Running on ${url}`);
          console.log(`[CuratorServer:${host.config?.name || 'curator'}] Real-time events on ws://localhost:${activePort}${wsPath}`);
          resolve({ port: activePort, url });
        });
        server.once('error', reject);
      });
    },
    stop,
  };

  return instance;
}
