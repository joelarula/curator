import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createMcpPlugin } from "../src/plugins/mcp/index.js";
import { curatorEngine } from "../src/engine/CuratorEngine.js";
import type { CuratorAgentNode } from "../src/engine/CuratorAst.js";

export async function run(): Promise<CuratorAgentNode> {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-everything"]
  });

  console.log("Connecting to MCP server...");
  const mcpPlugin = await createMcpPlugin("mcp-test", transport);
  console.log("Registered tools from MCP:", Object.keys(mcpPlugin.tools || {}));
  
  // Register the dynamically created tools into CuratorEngine
  curatorEngine.registerPlugin(mcpPlugin);

  // The engine will sync these tools and the agent can use them!
  return {
    type: "Curator_Agent",
    agentName: "mcp_test_agent",
    provider: "gemini",
    model: "gemini-2.5-flash",
    prompt: "Use the `echo` tool to echo back the string 'Hello MCP World!', and then tell me what you got.",
    tools: ["echo"]
  };
}
