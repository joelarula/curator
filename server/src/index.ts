import express from 'express';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { typeDefs } from './schema/index.js';
import { resolvers } from './resolvers/index.js';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from 'pg';
const { Pool } = pkg;
import { setupAuth, getUserFromToken } from './auth/index.js';
import dotenv from 'dotenv';

import { AgentScheduler } from './services/AgentScheduler.js';
import { RequestProcessor } from './services/RequestProcessor.js';

dotenv.config();

const connectionString = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter });

const app = express();
const PORT = process.env.PORT || 4000;

// Initialize background services
const agentScheduler = new AgentScheduler(prisma);
const requestProcessor = new RequestProcessor(prisma);

/**
 * Self-hosted GraphiQL IDE with integrated Google OAuth login.
 *
 * Flow:
 *   1. User visits /graphql (GET) → sees GraphiQL with a "Login with Google" button
 *   2. Clicking login redirects to /auth/google?callback=http://localhost:4000/graphql
 *   3. After OAuth, the callback appends ?token=<jwt> to the URL
 *   4. GraphiQL reads the token from the URL, stores it in localStorage, and
 *      uses it as the Authorization header for all subsequent requests
 */
function getGraphiQLHTML(serverUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Curator — GraphQL IDE</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🔮</text></svg>">
  <link rel="stylesheet" href="https://unpkg.com/graphiql@3/graphiql.min.css" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { height: 100vh; overflow: hidden; font-family: system-ui, -apple-system, sans-serif; }
    #graphiql { height: 100vh; }
    .auth-bar {
      display: flex; align-items: center; gap: 12px;
      padding: 6px 16px;
      background: #1a1a2e; color: #e0e0e0;
      font-size: 13px; border-bottom: 1px solid #2a2a4a;
    }
    .auth-bar .brand {
      font-weight: 700; font-size: 14px; color: #a78bfa;
      margin-right: auto;
    }
    .auth-bar .user-info {
      color: #94a3b8; font-size: 12px;
    }
    .auth-bar button {
      padding: 4px 14px; border-radius: 6px; border: none;
      font-size: 12px; font-weight: 600; cursor: pointer;
      transition: all 0.15s ease;
    }
    .auth-bar .login-btn {
      background: #4285f4; color: white;
    }
    .auth-bar .login-btn:hover { background: #3367d6; }
    .auth-bar .logout-btn {
      background: #374151; color: #e0e0e0;
    }
    .auth-bar .logout-btn:hover { background: #4b5563; }
  </style>
</head>
<body>
  <div class="auth-bar">
    <span class="brand">🔮 Curator</span>
    <span class="user-info" id="user-info"></span>
    <button id="auth-btn" class="login-btn" onclick="handleAuth()">Login with Google</button>
  </div>
  <div id="graphiql"></div>

  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/graphiql@3/graphiql.min.js"></script>

  <script>
    const SERVER = '${serverUrl}';

    // Token management
    function getToken() { return localStorage.getItem('curator_jwt'); }
    function setToken(t) { localStorage.setItem('curator_jwt', t); }
    function clearToken() { localStorage.removeItem('curator_jwt'); }

    // Extract token from URL (after OAuth callback redirect)
    (function captureToken() {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      if (token) {
        setToken(token);
        // Clean URL without reload
        window.history.replaceState({}, '', window.location.pathname);
      }
    })();

    // Parse JWT payload (no verification — just display)
    function parseJwt(token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload;
      } catch { return null; }
    }

    // Update auth UI
    function updateAuthUI() {
      const token = getToken();
      const btn = document.getElementById('auth-btn');
      const info = document.getElementById('user-info');
      if (token) {
        const claims = parseJwt(token);
        info.textContent = claims?.email || 'Authenticated';
        btn.textContent = 'Logout';
        btn.className = 'logout-btn';
      } else {
        info.textContent = '';
        btn.textContent = 'Login with Google';
        btn.className = 'login-btn';
      }
    }

    function handleAuth() {
      if (getToken()) {
        clearToken();
        updateAuthUI();
      } else {
        window.location.href = SERVER + '/auth/google?callback=' + encodeURIComponent(SERVER + '/graphql');
      }
    }

    updateAuthUI();

    // GraphiQL fetcher with auth header
    const fetcher = GraphiQL.createFetcher({
      url: SERVER + '/graphql',
      headers: () => {
        const token = getToken();
        return token ? { Authorization: 'Bearer ' + token } : {};
      },
    });

    const root = ReactDOM.createRoot(document.getElementById('graphiql'));
    root.render(
      React.createElement(GraphiQL, {
        fetcher,
        defaultEditorToolsVisibility: true,
      })
    );
  </script>
</body>
</html>`;
}

async function startServer() {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    plugins: [
      // Disable Apollo's default landing page — we serve our own GraphiQL
      ApolloServerPluginLandingPageDisabled(),
    ],
  });

  await server.start();

  // Global Middlewares
  app.use(cors());
  app.use(cookieParser());

  // Setup Auth (Google OAuth + JWT — unchanged)
  setupAuth(app as any, prisma);

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Serve custom GraphiQL IDE on GET /graphql
  const serverUrl = `http://localhost:${PORT}`;
  app.get('/graphql', (_req, res) => {
    res.type('html').send(getGraphiQLHTML(serverUrl));
  });

  // GraphQL API on POST /graphql (handled by Apollo)
  app.use('/graphql',
    express.json({ limit: '50mb' }),
    (req, res, next) => {
      if (req.body === undefined) req.body = {};
      next();
    },
    expressMiddleware(server, {
      context: async ({ req }: { req: any }) => {
        const token = req.headers.authorization?.replace('Bearer ', '')
          || req.cookies?.jwt
          || (req.query?.token as string)
          || '';
        const user = await getUserFromToken(token, prisma);
        return {
          user,
          prisma,
          agentScheduler,
          requestProcessor
        };
      }
    }) as any
  );

  app.listen(PORT, () => {
    console.log(`🚀 Server ready at http://localhost:${PORT}`);
    console.log(`📊 GraphQL IDE: http://localhost:${PORT}/graphql`);
    console.log(`🏥 Health check: http://localhost:${PORT}/health`);

    // Start background worker loops
    agentScheduler.start(); // Start Bree
    requestProcessor.start(5000); // Poll requests every 5s
  });
}

startServer().catch((error) => {
  console.error('Error starting server:', error);
});
