import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { PrismaClient } from "@prisma/client";
import { executeScript } from "./services/tools/executeScript.js";

/**
 * Curator MCP Server
 * Exposes the internal Scripting Engine and Knowledge Base to external agents.
 */

const prisma = new PrismaClient();

const server = new Server(
  {
    name: "curator-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * List available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "execute_script",
        description: "Executes a Curator Script (stored or inline) to perform complex tool chains (scraping, RAG, etc.)",
        inputSchema: {
          type: "object",
          properties: {
            scriptName: { type: "string", description: "Name of the stored Script to run" },
            body: { type: "string", description: "Ad-hoc JavaScript AIQ code to execute" },
            args: { type: "object", description: "JSON arguments for the script" },
          },
        },
      },
      {
        name: "search_knowledge",
        description: "Search for Resources and Text content in the Curator database",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search term" },
            limit: { type: "number", default: 10 },
          },
          required: ["query"],
        },
      },
      {
        name: "read_resource",
        description: "Get the full content (texts) of a specific Resource by ID or URI",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "number", description: "Resource numeric ID" },
            uri: { type: "string", description: "Resource URI" },
          },
        },
      },
      {
        name: "list_scripts",
        description: "List all available automation scripts in the Curator system",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_script",
        description: "Retrieve the definition (prompt, body, toolCalls) of a specific Script by name",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Script name" },
          },
          required: ["name"],
        },
      }
    ],
  };
});

/**
 * Handle tool execution
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "execute_script": {
        const { scriptName, body, args: scriptArgs } = args as any;
        
        // We need a dummy Request object for the internal tool handler
        const dummyRequest = {
          id: -1,
          conversationId: 1, // Fallback conv
          resources: []
        };

        // Note: In a real MCP scenario, we'd want a dedicated 'MCP' user or pick the first admin
        const user = await prisma.user.findFirst();
        if (!user) throw new Error("No user found in database to execute script");

        const result = await executeScript(
          { scriptName, body, args: scriptArgs },
          prisma,
          user.id,
          -1, // No response ID for MCP
          dummyRequest
        );

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "search_knowledge": {
        const { query, limit = 10 } = args as any;
        
        // Search Resources
        const resources = await prisma.resource.findMany({
          where: {
            OR: [
              { title: { contains: query, mode: 'insensitive' } },
              { uri: { contains: query, mode: 'insensitive' } },
            ],
          },
          take: limit,
          select: { id: true, title: true, uri: true }
        });

        // Search Text content
        const texts = await prisma.text.findMany({
          where: {
            content: { contains: query, mode: 'insensitive' },
          },
          take: limit,
          include: { 
            resource: { select: { title: true } },
            role: true
          }
        });

        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({
              foundResources: resources,
              foundTextSnippets: texts.map(t => ({
                id: t.id,
                resource: t.resource?.title,
                role: t.role.name,
                preview: t.content.substring(0, 200) + "..."
              }))
            }, null, 2) 
          }],
        };
      }

      case "read_resource": {
        const { id, uri } = args as any;
        const resource = await prisma.resource.findFirst({
          where: {
            OR: [
              id ? { id: Number(id) } : undefined,
              uri ? { uri } : undefined
            ].filter(Boolean) as any
          },
          include: {
            texts: {
              where: { existent: true },
              orderBy: { createdAt: 'desc' }
            }
          }
        });

        if (!resource) throw new Error("Resource not found");

        return {
          content: [{ type: "text", text: JSON.stringify(resource, null, 2) }],
        };
      }

      case "list_scripts": {
        const scripts = await prisma.script.findMany({
          select: { id: true, name: true, body: true },
          where: { existent: true }
        });
        return {
          content: [{ type: "text", text: JSON.stringify(scripts, null, 2) }],
        };
      }

      case "get_script": {
        const { name } = args as any;
        const script = await prisma.script.findUnique({
          where: { name }
        });
        if (!script) throw new Error(`Script "${name}" not found`);
        return {
          content: [{ type: "text", text: JSON.stringify(script, null, 2) }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

/**
 * Start the server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Curator MCP Server running on stdio");
}

main().catch((error) => {
  console.error("MCP Server Error:", error);
  process.exit(1);
});
