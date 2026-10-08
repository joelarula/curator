/**
 * Example: Model Context Protocol (MCP) Server & Client Workflow
 *
 * Demonstrates:
 * 1. Initializing an MCP Server directly from the Curator Host (`createMcpServerFromHost`).
 * 2. Listing all MCP-exposed tools and JSON Schema parameters.
 * 3. Calling an MCP tool (`calculate_metric`) using the MCP protocol dispatch layer.
 */

import { createBlueprintHost } from '../src/host.js';
import { McpToolRegistry } from '../../../packages/mcp-server/dist/index.js';

async function main() {
  console.log('--- [Example 4: Model Context Protocol (MCP) Integration] ---');

  // 1. Boot host
  const host = await createBlueprintHost();

  // 2. Build MCP Tool Registry bound to Host engine & context
  console.log('Initializing MCP Tool Registry...');
  const mcpRegistry = McpToolRegistry.fromEngine(
    host.engine,
    async () => ({
      prisma: host.prisma,
      userId: '1',
      projectId: '1',
    })
  );

  // 3. Discover available MCP tools
  const tools = mcpRegistry.list();
  console.log(`\nFound ${tools.length} exposed MCP tool(s):`);
  for (const t of tools) {
    console.log(`  - 🔧 [${t.name}]: ${t.description}`);
    console.log(`    Input Schema:`, JSON.stringify(t.inputSchema.properties, null, 2));
  }

  // 4. Simulate an external AI / MCP client calling a tool
  console.log('\nSimulating MCP CallToolRequest: calculate_metric...');
  const mcpResult = await mcpRegistry.call('calculate_metric', {
    baseValue: 42,
    multiplier: 10,
  });

  console.log('\n--- MCP Result ---');
  console.log('Is Error:', Boolean(mcpResult.isError));
  for (const item of mcpResult.content) {
    console.log('Response Content:\n', item.text);
  }

  await host.stop();
  console.log('\nHost stopped cleanly.');
}

main().catch((err) => {
  console.error('MCP example failed:', err);
  process.exit(1);
});
