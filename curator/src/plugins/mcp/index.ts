import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { CuratorPlugin } from "../../engine/CuratorEngine.js";
import { defineTool } from "../../tools/CuratorTool.js";

export async function createMcpPlugin(pluginName: string, transport: Transport): Promise<CuratorPlugin> {
  const client = new Client(
    {
      name: "curator-mcp-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  await client.connect(transport);
  
  // List all tools from the MCP server
  const mcpTools = await client.listTools();
  
  const mappedTools: Record<string, any> = {};

  for (const t of mcpTools.tools) {
    mappedTools[t.name] = defineTool({
      name: t.name,
      description: t.description || "MCP Tool",
      parameters: t.inputSchema || { type: "object", properties: {} },
      execute: async (args, _ctx) => {
        try {
          const result = await client.callTool({
            name: t.name,
            arguments: args
          });
          
          if (result.isError) {
             throw new Error(`MCP Tool Error: ${(result.content as any[]).map((c: any) => c.type === 'text' ? c.text : '').join(' ')}`);
          }
          
          return (result.content as any[]).map((c: any) => c.type === 'text' ? c.text : '').join('\n');
        } catch (e: any) {
          throw new Error(`Failed to call MCP tool '${t.name}': ${e.message}`);
        }
      }
    });
  }

  return {
    name: pluginName,
    tools: mappedTools,
  };
}
