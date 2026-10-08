import { PrismaClient } from '@prisma/client';
import { curatorEngine } from '../../curator/src/index.js';
import { createMcpServer } from '../../packages/mcp-server/src/index.js';

/**
 * Curator MCP Server
 * Exposes the internal Scripting Engine, Knowledge Base, and Tools to external agents.
 */

const prisma = new PrismaClient();

async function main() {
  const mcp = await createMcpServer({
    name: 'curator-server',
    version: '1.0.0',
    engine: curatorEngine,
    prisma,
    transport: 'stdio',
    registerBuiltinPlugins: true,
  });

  await mcp.listen();
}

main().catch((error) => {
  console.error('Curator MCP Server Error:', error);
  process.exit(1);
});
