import type { CuratorAgentNode } from '../../../src/engine/CuratorAst.js';

/** Agent that uses an MCP-provided `echo` tool. The MCP server itself is supplied by the test (see engine/mcp.test.ts). */
export function run(): CuratorAgentNode {
  return {
    type: 'Curator_Agent',
    agentName: 'mcp_test_agent',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    prompt: "Use the `echo` tool to echo back the string 'Hello MCP World!', and then tell me what you got.",
    tools: ['echo'],
  };
}
