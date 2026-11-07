import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { CuratorPlugin } from "../../engine/CuratorEngine.js";
import { defineTool } from "../../tools/CuratorTool.js";
import { GuardrailService } from "../../services/GuardrailService.js";
import { SecretService } from "../../services/SecretService.js";
import { logger } from "../../utils/logger.js";

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
    if (GuardrailService.isRawExecutionTool(t.name)) {
      logger.warn(`[createMcpPlugin] Skipping raw text execution MCP tool '${t.name}' in plugin '${pluginName}' [AML.T0040]`);
      continue;
    }

    const inputSchema = (t.inputSchema || { type: "object", properties: {} }) as Record<string, unknown>;
    mappedTools[t.name] = defineTool({
      name: t.name,
      description: t.description || "MCP Tool",
      parameters: inputSchema,
      execute: async (args, _ctx) => {
        const paramCheck = GuardrailService.validateToolParameters(inputSchema, args);
        if (!paramCheck.valid) {
          throw new Error(`MCP Tool Schema Error for '${t.name}': ${(paramCheck.errors || []).join("; ")}`);
        }
        try {
          const result = await client.callTool({
            name: t.name,
            arguments: args
          });
          
          if (result.isError) {
             throw new Error(`MCP Tool Error: ${(result.content as any[]).map((c: any) => c.type === 'text' ? c.text : '').join(' ')}`);
          }
          
          const rawText = (result.content as any[]).map((c: any) => c.type === 'text' ? c.text : '').join('\n');
          return SecretService.mask(rawText);
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
