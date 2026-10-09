import fs from 'node:fs';
import path from 'node:path';
import express, { Router, type Request, type Response } from 'express';
import type { GraphQLSchema } from 'graphql';
import { compileCoffeeScriptToAST } from '@curator/agent-server';
import type { CuratorHost } from '@curator/host';
import {
  curatorGraphQLSchema,
  curatorGraphQLTypeDefs,
  executeCuratorGraphql,
} from './graphql/index.js';

export interface CuratorRouterOptions {
  customGraphQLResolvers?: Record<string, any>;
  customGraphQLSchema?: GraphQLSchema;
  customGraphQLTypeDefs?: string;
  sqliteDbPath?: string;
}

export function createCuratorRouter(host: CuratorHost, options: CuratorRouterOptions = {}): Router {
  const router = Router();
  let enginePaused = false;

  // 1. Status & Health
  router.get('/api/status', async (req: Request, res: Response) => {
    try {
      const requestsCount = await host.prisma.request.count();
      const responsesCount = await host.prisma.response.count();

      res.json({
        status: 'online',
        name: host.config?.name || 'curator',
        database: host.config?.curatorDb?.url ? 'MariaDB/MySQL' : 'SQLite',
        requests: requestsCount,
        responses: responsesCount,
        recentLogs: host.events.getRecentLogs(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Tools listing & execution
  const getToolsHandler = (req: Request, res: Response) => {
    const tools = Array.from(host.engine.tools.entries()).map(([name, tool]: [string, any]) => ({
      name,
      description: tool.description,
      parameters: tool.parameters,
      accessLevel: tool.accessLevel || 'domain',
    }));
    res.json({ tools });
  };
  router.get('/api/tools', getToolsHandler);
  router.get('/api/curator/tools', getToolsHandler);

  router.post('/api/curator/tools/:name/exec', async (req: Request, res: Response) => {
    try {
      const toolName = req.params.name;
      const tool = host.engine.tools.get(toolName);
      if (!tool) {
        return res.status(404).json({ error: `Tool '${toolName}' not found` });
      }
      const args = req.body.args || {};
      const result = await tool.execute(args, { prisma: host.prisma, events: host.events });
      res.json({ success: true, tool: toolName, result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 3. Agents listing & execution
  const getAgentsHandler = (req: Request, res: Response) => {
    const agents = Array.from(host.engine.agents.entries()).map(([name, agent]: [string, any]) => ({
      name,
      description: agent.description,
      schedule: agent.schedule,
      enabled: agent.enabled ?? true,
    }));
    res.json({ agents });
  };
  router.get('/api/agents', getAgentsHandler);
  router.get('/api/curator/agents', getAgentsHandler);

  router.post('/api/trigger', async (req: Request, res: Response) => {
    try {
      const { agent, context } = req.body;
      if (!agent) {
        return res.status(400).json({ error: 'agent parameter is required' });
      }

      const request = await host.triggerAgent(agent, context || {});
      res.json({
        success: true,
        requestId: request.id,
        agent,
        status: request.status,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 4. CoffeeScript & AST Compilation
  router.post('/api/curator/ast/compile-coffee', async (req: Request, res: Response) => {
    try {
      const { code } = req.body;
      if (!code) return res.status(400).json({ error: 'code is required' });
      const ast = await compileCoffeeScriptToAST(code);
      res.json({ success: true, ast });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 5. Database Health for Curator Console
  router.get('/api/curator/db/health', async (req: Request, res: Response) => {
    try {
      const requestsTotal = await host.prisma.request.count();
      const requestsCompleted = await host.prisma.request.count({ where: { status: 'COMPLETED' } });
      const requestsFailed = await host.prisma.request.count({ where: { status: 'FAILED' } });
      const requestsPending = await host.prisma.request.count({ where: { status: { in: ['PENDING', 'RUNNING'] } } });

      const tables = [
        { name: 'Request', rowCount: requestsTotal },
        { name: 'Response', rowCount: await host.prisma.response.count() },
        { name: 'Agent', rowCount: await host.prisma.agent.count() },
        { name: 'Script', rowCount: await host.prisma.script.count() },
        { name: 'Conversation', rowCount: await host.prisma.conversation.count() },
        { name: 'User', rowCount: await host.prisma.user.count() },
      ];

      res.json({
        storageEngine: host.config?.curatorDb?.url ? 'MariaDB/MySQL' : 'SQLite',
        isOpfs: false,
        tables,
        requestsTotal,
        requestsCompleted,
        requestsFailed,
        requestsPending,
        agentsTotal: host.engine.agents.size,
        agentsActive: Array.from(host.engine.agents.values()).filter((a: any) => a.enabled).length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 6. Engine Pause / Resume
  router.get('/api/curator/engine/status', (req: Request, res: Response) => {
    res.json({ isPaused: enginePaused });
  });

  router.post('/api/curator/engine/toggle-pause', async (req: Request, res: Response) => {
    enginePaused = !enginePaused;
    if (enginePaused) {
      await host.stop();
    } else {
      await host.start(1000);
    }
    res.json({ isPaused: enginePaused });
  });

  // 7. Database Export & Import
  router.get('/api/curator/db/export', (req: Request, res: Response) => {
    const dbPath = options.sqliteDbPath || path.resolve(process.cwd(), 'data/state/curator.db');
    if (fs.existsSync(dbPath)) {
      res.download(dbPath, `${host.config?.name || 'curator'}.sqlite3`);
    } else {
      res.status(404).json({ error: 'Database file not found' });
    }
  });

  router.post(
    '/api/curator/db/import',
    express.raw({ type: '*/*', limit: '50mb' }),
    async (req: Request, res: Response) => {
      try {
        const buffer = req.body;
        if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
          return res.status(400).json({ error: 'No database content received' });
        }
        const targetPath = options.sqliteDbPath || path.resolve(process.cwd(), 'data/state/curator.db');
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, buffer);
        res.json({ success: true, message: 'Database imported successfully' });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 8. P2P & Event emission
  router.post('/api/curator/events/broadcast', (req: Request, res: Response) => {
    try {
      const { type, payload } = req.body;
      if (!type) return res.status(400).json({ error: 'type is required' });
      host.events.broadcast(type, payload || {});
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/api/curator/p2p/bang', (req: Request, res: Response) => {
    try {
      host.events.broadcast('game:bang', { sender: `${host.config?.name || 'curator'}-server`, timestamp: new Date().toISOString() });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 9. GraphQL endpoint
  const activeSchema = options.customGraphQLSchema || curatorGraphQLSchema;
  router.post('/graphql', async (req: Request, res: Response) => {
    try {
      const { query, variables } = req.body;
      if (!query) return res.status(400).json({ errors: [{ message: 'query is required' }] });

      const result = await executeCuratorGraphql(
        host,
        query,
        variables,
        activeSchema,
        options.customGraphQLResolvers || {}
      );
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ errors: [{ message: err.message }] });
    }
  });

  // 10. GraphQL SDL schema inspection
  router.get('/graphql/schema', (req: Request, res: Response) => {
    res.type('text/plain').send(options.customGraphQLTypeDefs || curatorGraphQLTypeDefs);
  });

  return router;
}
