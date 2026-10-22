import { PrismaClient } from '@prisma/client';
import { curatorEngine, CuratorRequestProcessor } from '../../curator/dist/src/index.js';
import { createMcpServer } from '../../packages/mcp-server/dist/index.js';

/**
 * Curator MCP Server
 * Exposes the internal Scripting Engine, Knowledge Base, and Tools to external agents.
 * Every MCP tool call is a durable Request (origin MCP) executed by CuratorRequestProcessor.
 */

const prisma = new PrismaClient();

async function main() {
  // Actor for MCP calls: configured service user (never taken from MCP payloads).
  const userId = process.env.CURATOR_MCP_USER_ID;
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId } })
    : await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!user) {
    throw new Error('No user available for MCP requests; set CURATOR_MCP_USER_ID to an existing user id.');
  }
  const projectId = process.env.CURATOR_MCP_PROJECT_ID || null;
  const conversation =
    (await prisma.conversation.findFirst({ where: { userId: user.id, projectId } })) ??
    (await prisma.conversation.create({ data: { userId: user.id, projectId } as any }));

  const processor = new CuratorRequestProcessor(prisma, { engine: curatorEngine });

  const mcp = await createMcpServer({
    name: 'curator-server',
    version: '1.0.0',
    engine: curatorEngine,
    prisma,
    execute: (toolName: string, args: Record<string, unknown>, session?: any) =>
      processor.runToolRequest({
        toolName,
        args: args as Record<string, any>,
        conversationId: conversation.id,
        userId: user.id,
        projectId,
        origin: 'MCP',
        context: session ? { mcpPeerId: session.peerId, mcpTrustTier: session.trustTier } : undefined,
      }),
    transport: 'stdio',
    registerBuiltinPlugins: true,
  });

  await mcp.listen();
}

main().catch((error) => {
  console.error('Curator MCP Server Error:', error);
  process.exit(1);
});
