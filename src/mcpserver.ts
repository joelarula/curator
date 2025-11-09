#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {consult } from './service';

const server = new Server(
  {
    name: "curator-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "consult",
        description: "Consult curator tool. Searches the curator knowledge base for documents relevant to the user's question.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The exact question or search term to use for retrieval.",
            },
          },
          required: ["query"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "consult") {
    const { query} = args as { query: string };

    const consultResults: Array<{ content: string; score: number; metadata: { fileId: string } }> = await consult(query);
    const results = consultResults.map((res) => ({
      content: res.content,
      score: res.score,
      metadata: res.metadata.fileId,
    }));

    console.log('✅ Query Results:', results);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(results, null, 2),
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Curator MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});