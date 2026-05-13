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
        description: `Executes a Curator Pipeline script (stored or inline).

Scripts use the Pipeline DSL:
  import { Pipeline } from '../src/services/ast/builder.js';
  import { TOOLS } from '../src/services/tools/manifest.js';
  const pipeline = new Pipeline();
  pipeline.tool(TOOLS.SCRAPE_RESOURCE, { url, contentSelector: '#content', saveText: false });
  pipeline.tool(TOOLS.REGEX_REPLACE, { text: scraped.content, patterns: [...] });
  pipeline.tool(TOOLS.UPSERT_TEXT, { resourceUri: url, role: 'COPY', content: cleaned.text, mimeType: 'text/markdown', extension: 'md' });
  pipeline.tool(TOOLS.UPSERT_RELATION, { subjectUri: url, predicateUri: VOCAB.PROP.about, objectUri: 'topic:...' });
  export default pipeline;

Key tools: UPSERT_RESOURCE, UPSERT_TEXT, UPSERT_RELATION, SCRAPE_RESOURCE, PROCESS_FEED, EVALUATE_CONDITION, REGEX_REPLACE, ASK_LLM, QUERY_RESOURCES, DEBUG.
See SCRIPTING_GUIDE.md for full reference.`,
        inputSchema: {
          type: "object",
          properties: {
            scriptName: { type: "string", description: "Name of a stored Script record to run" },
            body: { type: "string", description: "Inline Curator Pipeline script source (TypeScript)" },
            args: { type: "object", description: "JSON arguments passed as process.argv to the script" },
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

        const user = await prisma.user.findFirst();
        if (!user) throw new Error("No user found in database to execute script");

        const result = await executeScript(
          { scriptName, body, args: scriptArgs },
          prisma,
          user.id,
          undefined, // No response ID for MCP
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
            deletedAt: null,
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
            deletedAt: null,
            content: { contains: query, mode: 'insensitive' },
          },
          take: limit,
          include: { 
            resource: { select: { title: true } }
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
                role: t.role,
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
            deletedAt: null,
            OR: [
              id ? { id: Number(id) } : undefined,
              uri ? { uri } : undefined
            ].filter(Boolean) as any
          },
          include: {
            texts: {
              where: { deletedAt: null },
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
          where: { deletedAt: null }
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
