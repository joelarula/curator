/**
 * Example: Direct In-Process Tool Execution & MCP Declarations
 *
 * Demonstrates:
 * 1. Resolving tools directly from the engine registry.
 * 2. Inspecting the tool's MCP JSON Schema declaration.
 * 3. Executing the tool directly in-process with custom arguments.
 */

import { createBlueprintHost } from '../src/host.js';

async function main() {
  console.log('--- [Example 2: Direct Tool Execution & MCP Inspection] ---');

  const host = await createBlueprintHost();

  // 1. Inspect registered tools
  const toolName = 'calculate_metric';
  const tool = host.engine.tools.get(toolName);

  if (!tool) {
    throw new Error(`Tool "${toolName}" not found in engine.`);
  }

  // 2. Generate MCP declaration
  const mcpDeclaration = tool.toMcpDeclaration();
  console.log('\n📋 MCP Tool Declaration:');
  console.log(JSON.stringify(mcpDeclaration, null, 2));

  // 3. Execute tool synchronously
  console.log('\n⚙️ Executing tool directly in-process...');
  const result = await tool.runAsync({
    args: { baseValue: 120, multiplier: 5 },
    toolContext: {
      prisma: host.prisma,
      userId: '1',
      projectId: '1',
    },
  });

  console.log('\n✅ Execution Output:');
  console.log(JSON.stringify(result, null, 2));

  await host.stop();
}

main().catch((err) => {
  console.error('Example failed:', err);
  process.exit(1);
});
