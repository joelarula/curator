import express, { type Express } from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStorageRouter } from '@curator/plugin-storage';
import { createGalleryHost, type GalleryHost } from '../host.ts';
import { executeGraphql } from './graphql.ts';
import { setupAuth, getUserFromToken } from './auth.ts';
import { createGalleryMcpServer } from './mcp.ts';

const currentDir = dirname(fileURLToPath(import.meta.url));
const root = existsSync(join(currentDir, 'web-dist'))
  ? currentDir
  : existsSync(join(dirname(dirname(currentDir)), 'web-dist'))
    ? dirname(dirname(currentDir))
    : dirname(dirname(currentDir));

const envCandidates = [
  join(root, '.env'),
  join(currentDir, '.env'),
  join(process.cwd(), '.env'),
  join(root, '.env.production'),
];
for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    try {
      process.loadEnvFile(envPath);
      console.log(`[Gallery Server] Loaded environment from: ${envPath}`);
      break;
    } catch {}
  }
}

export interface GalleryServerInstance {
  app: Express;
  host: GalleryHost;
  server?: ReturnType<Express['listen']>;
  stop: () => Promise<void>;
}

export async function createGalleryApp(options: {
  host?: GalleryHost;
  startProcessor?: boolean;
} = {}): Promise<{ app: Express; host: GalleryHost }> {
  const host = options.host || (await createGalleryHost());
  if (options.startProcessor !== false) {
    await host.start(3000);
  }

  const mcp = await createGalleryMcpServer({
    host,
    transport: { http: { port: Number(process.env.PORT) || 4005, path: '/mcp' } },
    allowAnonymousHttp: true,
  });
  const mcpHttpHandler = mcp.httpHandler({ path: '/mcp' });

  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // Mount MCP Streamable HTTP endpoint
  app.all('/mcp', async (req, res) => {
    await mcpHttpHandler(req, res);
  });

  app.use(express.json({ limit: '50mb' }));

  // Google OAuth 2.0 & JWT routes (configured from gallery.config.yaml & env)
  setupAuth(app, () => (host as any).definitionsPrisma ?? host.prisma, host);

  // Automatic 250px thumbnail generation when uploading photos via /api/curator/upload
  app.post('/api/curator/upload', async (req, res, next) => {
    try {
      const projectId = String(
        req.headers['x-project-id'] || req.body?.projectId || host.defaultProjectId
      );
      const bucket = req.body?.bucket || 'photos';
      const filesInput: Array<{
        filename: string;
        data: string;
        mimeType?: string;
        bucket?: any;
      }> = Array.isArray(req.body?.files)
        ? req.body.files
        : req.body?.filename && req.body?.data
          ? [req.body]
          : [];

      if (filesInput.length === 0) {
        return next();
      }

      const uploaded = [];
      for (const item of filesInput) {
        const stored = await host.storageService.saveFile({
          projectId,
          bucket: item.bucket || bucket,
          filename: item.filename,
          data: item.data,
          mimeType: item.mimeType,
        });
        let thumbnailUrl = stored.url;
        if (stored.mimeType.startsWith('image/') && !stored.mimeType.includes('svg')) {
          try {
            const thumbResolved = host.storageService.resolveFilePath(
              projectId,
              'thumbnails',
              stored.filename
            );
            await host.imageProcessor.generateThumbnail(
              stored.diskPath,
              thumbResolved.diskPath,
              { width: 250 }
            );
            thumbnailUrl = thumbResolved.url;
          } catch {}
        }
        uploaded.push({
          ...stored,
          thumbnailUrl,
        });
      }

      res.json({
        success: true,
        projectId,
        files: uploaded,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err?.message || 'File upload failed',
      });
    }
  });

  app.use(createStorageRouter({ storage: host.storageService }));

  // Backward-compatible legacy image URLs (/images/thumbnails/:file and /images/photos/:file)
  app.get('/images/thumbnails/:filename', (req, res) => {
    const resolved = host.storageService.resolveFilePath(
      host.defaultProjectId,
      'thumbnails',
      req.params.filename
    );
    if (!existsSync(resolved.diskPath)) return res.status(404).send('Thumbnail not found');
    res.sendFile(resolved.diskPath);
  });

  app.get('/images/photos/:filename', (req, res) => {
    const resolved = host.storageService.resolveFilePath(
      host.defaultProjectId,
      'photos',
      req.params.filename
    );
    if (!existsSync(resolved.diskPath)) return res.status(404).send('Photo not found');
    res.sendFile(resolved.diskPath);
  });

  // Health endpoint
  app.get('/health', async (_req, res) => {
    try {
      const stats = await host.galleryRepo.getStats({ projectId: host.defaultProjectId });
      const dbUrl = process.env.CURATOR_DATABASE_URL || process.env.DATABASE_URL || '';
      res.json({
        status: 'ok',
        serverApi: true,
        mode: 'express-graphql-mcp',
        database:
          dbUrl.startsWith('mysql://') || dbUrl.startsWith('mariadb://')
            ? 'mariadb'
            : 'sqlite',
        processor: 'ready',
        projectId: host.defaultProjectId,
        totalItems: stats.totalItems,
        publishedItems: stats.publishedItems,
        categoriesCount: stats.totalCategories,
        authorsCount: stats.totalAuthors,
      });
    } catch (err: any) {
      res.status(503).json({ status: 'error', error: err?.message });
    }
  });

  // =========================================================================
  // Public SEO & Search Engine Index Endpoints
  // =========================================================================

  // XML Sitemap with Google Image extensions (<image:image>)
  app.get('/sitemap.xml', async (req, res) => {
    try {
      const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
      const hostHeader = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost';
      const baseUrl = `${proto}://${hostHeader}`;
      const requestedProject = (req.headers['x-project-id'] as string) || (req.query?.projectId as string);
      const projectId = requestedProject || host.defaultProjectId;

      const xml = await host.galleryRepo.generateSitemapXml({ projectId, baseUrl });
      res.header('Content-Type', 'application/xml; charset=utf-8');
      res.header('Cache-Control', 'public, max-age=3600, s-maxage=86400');
      res.send(xml);
    } catch (err: any) {
      res.status(500).type('text/plain').send(`Error generating sitemap: ${err?.message}`);
    }
  });

  // robots.txt pointing to /sitemap.xml
  app.get('/robots.txt', (req, res) => {
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
    const hostHeader = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost';
    const baseUrl = `${proto}://${hostHeader}`;
    const txt = host.galleryRepo.generateRobotsTxt({ baseUrl });
    res.header('Content-Type', 'text/plain; charset=utf-8');
    res.header('Cache-Control', 'public, max-age=86400');
    res.send(txt);
  });

  // llms.txt providing clean Markdown catalog summary for AI search and LLMs
  app.get('/llms.txt', async (req, res) => {
    try {
      const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
      const hostHeader = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost';
      const baseUrl = `${proto}://${hostHeader}`;
      const requestedProject = (req.headers['x-project-id'] as string) || (req.query?.projectId as string);
      const projectId = requestedProject || host.defaultProjectId;

      const txt = await host.galleryRepo.generateLlmsTxt({ projectId, baseUrl });
      res.header('Content-Type', 'text/plain; charset=utf-8');
      res.header('Cache-Control', 'public, max-age=3600');
      res.send(txt);
    } catch (err: any) {
      res.status(500).type('text/plain').send(`Error generating llms.txt: ${err?.message}`);
    }
  });

  // JSON SEO Index for static site generators (SSG / SSR / ISR hydration)
  app.get('/api/seo/index.json', async (req, res) => {
    try {
      const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
      const hostHeader = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost';
      const baseUrl = `${proto}://${hostHeader}`;
      const requestedProject = (req.headers['x-project-id'] as string) || (req.query?.projectId as string);
      const projectId = requestedProject || host.defaultProjectId;

      const seoIndex = await host.galleryRepo.getSeoIndex({ projectId, baseUrl });

      // Conditional HTTP caching
      res.header('ETag', seoIndex.etag);
      res.header('Last-Modified', new Date(seoIndex.lastModified).toUTCString());
      res.header('Cache-Control', 'public, max-age=600, stale-while-revalidate=86400');

      if (req.headers['if-none-match'] === seoIndex.etag) {
        return res.status(304).end();
      }

      res.json(seoIndex);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to generate SEO index' });
    }
  });

  // SSE endpoint for live Curator Console & Harness progress
  app.get('/api/curator/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const recent = host.events.getRecentLogs();
    for (const log of recent) {
      res.write(`data: ${JSON.stringify({ type: 'log', payload: { message: log.message } })}\n\n`);
    }

    const listener = (event: any) => {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {}
    };

    const unsubscribe = host.events.onEvent(listener);
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {}
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      try {
        unsubscribe();
      } catch {}
    });
  });

  app.get('/api/curator/logs', (_req, res) => {
    res.json({ logs: host.events.getRecentLogs() });
  });

  // GraphiQL Explorer
  app.get('/graphql', (_req, res) => {
    res.type('html').send(`<!DOCTYPE html>
<html>
<head>
  <title>Curator Gallery GraphQL Explorer</title>
  <link rel="stylesheet" href="https://unpkg.com/graphiql@3/graphiql.min.css" />
  <style>body { height: 100vh; margin: 0; overflow: hidden; }</style>
</head>
<body>
  <div id="graphiql" style="height: 100vh;"></div>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/graphiql@3/graphiql.min.js"></script>
  <script>
    const fetcher = GraphiQL.createFetcher({ url: '/graphql' });
    const root = ReactDOM.createRoot(document.getElementById('graphiql'));
    root.render(React.createElement(GraphiQL, {
      fetcher,
      defaultQuery: '{ galleryStats { projectId totalItems publishedItems categoriesCount authorsCount } galleryCategories { key name link paintingCount } }'
    }));
  </script>
</body>
</html>`);
  });

  // GraphQL endpoint (scopes projectId from x-project-id header or host session)
  app.post('/graphql', async (req, res) => {
    if (typeof req.body?.query !== 'string') {
      return res.status(400).json({ errors: [{ message: 'query is required' }] });
    }
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : (req.query?.token as string);
    const defPrisma = (host as any).definitionsPrisma ?? host.prisma;
    const user = token ? await getUserFromToken(token, defPrisma, host) : null;
    const requestedProject = req.headers['x-project-id'] as string | undefined;
    const projectId =
      requestedProject ||
      user?.defaultProjectId ||
      host.defaultProjectId ||
      'artmoments';

    const result = await executeGraphql(req.body.query, req.body.variables, {
      host,
      user,
      projectId,
    });
    res.status(result.errors ? 400 : 200).json(result);
  });

  // Static Vue 3 SPA serving
  const webRoot = existsSync(join(root, 'web-dist', 'server'))
    ? join(root, 'web-dist', 'server')
    : join(root, 'web-dist');

  if (existsSync(webRoot)) {
    app.use(express.static(webRoot, { index: 'index.html' }));
    app.get('/', (_req, res) => {
      res.sendFile(join(webRoot, 'index.html'));
    });
    app.get('/{*splat}', (req, res, next) => {
      if (
        req.path.startsWith('/api/') ||
        req.path.startsWith('/graphql') ||
        req.path.startsWith('/media/') ||
        req.path.startsWith('/mcp')
      ) {
        return next();
      }
      res.sendFile(join(webRoot, 'index.html'));
    });
  }

  return { app, host };
}

// Bootstrap when executed as server entrypoint (no top-level await for cPanel CJS compatibility)
const entryArg = process.argv[1] ? process.argv[1].replace(/\\/g, '/') : '';
const isServerEntry =
  entryArg.endsWith('/server/index.ts') ||
  entryArg.endsWith('/server/index.js') ||
  entryArg.endsWith('/app.js') ||
  entryArg.endsWith('/app.cjs') ||
  entryArg.includes('lsnode');

if (isServerEntry && process.env.NODE_ENV !== 'test' && process.env.GALLERY_NO_AUTO_LISTEN !== '1') {
  const port = Number(process.env.PORT) || 4005;
  createGalleryApp()
    .then(({ app, host }) => {
      const server = app.listen(port, () => {
        console.log(`[Gallery Server] Listening on http://localhost:${port}`);
        console.log(`[Gallery Server] GraphQL API:  http://localhost:${port}/graphql`);
        console.log(`[Gallery Server] MCP Endpoint: http://localhost:${port}/mcp`);
        // Event-stream connections carry the signed-in user (bearer token or `token` query parameter): addressed
        // events (channel deliveries, invitations) reach only that user
        host.events.attachWebSocketServer(server, undefined, {
          identify: async (req: any) => {
            const header = req?.headers?.authorization;
            const token = header?.startsWith('Bearer ')
              ? header.slice(7)
              : new URL(req?.url ?? '/', 'http://localhost').searchParams.get('token');
            if (!token) return null;
            const user = await getUserFromToken(token, (host as any).definitionsPrisma ?? host.prisma, host);
            return user?.id ? { userId: String(user.id) } : null;
          },
        });
      });

      const shutdown = async () => {
        try {
          await host.stop();
        } catch {}
        server.close(() => process.exit(0));
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    })
    .catch((err) => {
      console.error('[Gallery Server] Failed to start:', err);
      process.exit(1);
    });
}
