import http from 'node:http';
import express from 'express';
import { createBlueprintHost } from '../host.js';

async function bootstrap() {
  const host = await createBlueprintHost();

  // 1. Start continuous RequestProcessor background polling
  await host.start(3000);

  // 2. Set up Express application
  const app = express();
  app.use(express.json());

  // Health and status endpoint
  app.get('/api/status', async (req, res) => {
    try {
      const requestsCount = await host.prisma.request.count();
      const responsesCount = await host.prisma.response.count();

      res.json({
        status: 'online',
        name: 'blueprint',
        database: 'SQLite',
        requests: requestsCount,
        responses: responsesCount,
        recentLogs: host.events.getRecentLogs(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Tools listing endpoint
  app.get('/api/tools', (req, res) => {
    const tools = Array.from(host.engine.tools.entries()).map(([name, tool]: [string, any]) => ({
      name,
      description: tool.description,
      parameters: tool.parameters,
      accessLevel: tool.accessLevel,
    }));
    res.json({ tools });
  });

  // Agents listing endpoint
  app.get('/api/agents', (req, res) => {
    const agents = Array.from(host.engine.agents.entries()).map(([name, agent]: [string, any]) => ({
      name,
      description: agent.description,
      schedule: agent.schedule,
      enabled: agent.enabled,
    }));
    res.json({ agents });
  });

  // Trigger agent endpoint
  app.post('/api/trigger', async (req, res) => {
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

  // 3. Create HTTP server and attach WebSocket streaming
  const server = http.createServer(app);
  host.events.attachWebSocketServer(server, '/api/events');

  const PORT = process.env.PORT || 4100;
  server.listen(PORT, () => {
    console.log(`[Blueprint Server] Running on http://localhost:${PORT}`);
    console.log(`[Blueprint Server] Real-time event stream active on ws://localhost:${PORT}/api/events`);
  });

  // 4. Handle graceful shutdown
  const shutdown = async () => {
    console.log('\n[Blueprint Server] Shutting down gracefully...');
    server.close();
    await host.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('[Blueprint Server] Fatal error:', err);
  process.exit(1);
});
