import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

import { provisionSqliteDb } from './src/db/sqliteProvisioner.js';
import { curatorEngine, type CuratorPlugin } from './src/engine/CuratorEngine.js';
import { corePlugin } from './src/plugins/core/index.js';
import { CuratorRequestProcessor } from './src/engine/CuratorRequestProcessor.js';
import { defineTool } from './src/tools/CuratorTool.js';
import { run } from './scripts/test_process_feed_with_mocks.js';

function startMockLlmServer(port: number) {
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }

    let body = '';
    for await (const chunk of req) body += chunk;

    const parsed = body ? JSON.parse(body) : {};
    const userPrompt = parsed?.messages?.[parsed.messages.length - 1]?.content || '';

    const content =
      'ERR feed headlines were parsed successfully. The top items cover Estonia news and public affairs. This is a deterministic mock summary from the local test provider.' +
      (userPrompt.includes('JSON DATA') ? '' : '');

    const payload = {
      id: 'chatcmpl-mock',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: parsed?.model || 'mock-model',
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: { role: 'assistant', content },
        },
      ],
    };

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  });

  return new Promise<{ close: () => Promise<void> }>((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      console.log(`[MockLLM] Listening on http://127.0.0.1:${port}`);
      resolve({
        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            server.close((err) => (err ? closeReject(err) : closeResolve()));
          }),
      });
    });
  });
}

async function main() {
  const dbName = 'test_process_feed_mock';
  const sessionId = `mock-feed-${randomUUID()}`;
  const mockPort = 18080;
  process.env.MOCK_LLM_URL = `http://127.0.0.1:${mockPort}`;

  const llm = await startMockLlmServer(mockPort);

  const prisma = await provisionSqliteDb(dbName, true);
  const processor = new CuratorRequestProcessor(prisma);

  try {
    // Register core plugin first, then override process_feed with deterministic mock.
    curatorEngine.registerPlugin(corePlugin);

    const mockProcessFeed = defineTool({
      name: 'process_feed',
      description: 'Mocked process_feed that returns deterministic feed items.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          limit: { type: 'number' },
          format: { type: 'string' },
        },
        required: ['url'],
      },
      execute: async (args) => {
        const limit = Number(args.limit || 5);
        const items = Array.from({ length: limit }).map((_, i) => ({
          uri: `https://mock.local/news/${i + 1}`,
          title: `Mock headline ${i + 1}`,
          description: `Mock description ${i + 1}`,
        }));
        return JSON.stringify(items, null, 2);
      },
    });

    const mockPlugin: CuratorPlugin = {
      name: 'mock-process-feed-plugin',
      tools: {
        process_feed: mockProcessFeed,
      },
    };
    curatorEngine.registerPlugin(mockPlugin);

    const user = await prisma.user.upsert({
      where: { id: 2 },
      update: {},
      create: { id: 2, username: 'cli_user', name: 'CLI User', email: 'cli@example.com' },
    });

    const conversation = await prisma.conversation.upsert({
      where: { id: sessionId },
      update: {},
      create: { id: sessionId, userId: user.id },
    });

    const ast = await run({ prisma, dbName });

    const req = await prisma.request.create({
      data: {
        userId: user.id,
        conversationId: conversation.id,
        status: 'NEW',
        toolName: 'Curator_Workflow',
        ast,
      },
    });

    await processor.start(250);

    const deadline = Date.now() + 30_000;
    let finalStatus = 'NEW';
    while (Date.now() < deadline) {
      const latest = await prisma.request.findUnique({ where: { id: req.id } });
      finalStatus = latest?.status || 'UNKNOWN';
      if (finalStatus === 'COMPLETED' || finalStatus === 'FAILED' || finalStatus === 'SKIPPED') {
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    if (finalStatus !== 'COMPLETED') {
      throw new Error(`Workflow did not complete successfully. Final status: ${finalStatus}`);
    }

    const responses = await prisma.response.findMany({
      where: { conversationId: sessionId },
      orderBy: { createdAt: 'asc' },
    });

    const last = responses[responses.length - 1]?.content || '';
    console.log('\n[Test Output] Last response:\n', last);

    if (!last.includes('deterministic mock summary')) {
      throw new Error('Expected mock LLM summary text not found in final output.');
    }

    console.log('\n[Test] PASS: process_feed + summarizer flow completed with mocked tool and mocked LLM provider.');
  } finally {
    processor.stop();
    await prisma.$disconnect();
    await llm.close();
  }
}

main().catch((err) => {
  console.error('[Test] FAIL:', err);
  process.exit(1);
});
