# `@curator/mcp-server`

Plugin-Driven Model Context Protocol (MCP) Server for the Curator Ecosystem.

Exposes Curator tools, knowledge base search, pipeline scripts, and agent workflows to external agents (e.g. OpenCode, Claude Desktop, Facilitator harness) via standard MCP `stdio` transport without hardcoded switch statements.

---

## Key Features

- **Plugin-Driven Tool Exposure**: Any tool registered in a Curator plugin with `defineTool({ mcp: { expose: true }, ... })` automatically appears in `tools/list` and is executable via `tools/call`.
- **Plugin Policy Control**: Control exposure at the plugin level via `mcp: { exposeAll: true, include: [...], exclude: [...] }`.
- **Built-in Core Tools**: Includes `search_knowledge`, `read_resource`, `list_scripts`, `get_script`, and `execute_script`.
- **Agent Orchestration Tools**: When connected to a `CuratorHost`, exposes `trigger_agent`, `get_request`, `list_requests`, `pause_request`, and `resume_request`.
- **Safety by Default**: Internal AST tools remain private unless explicitly opted in. Destructive operations respect execution safeguards.

---

## Programmatic Usage

```typescript
import { createCuratorHost } from '@curator/host';
import { createMcpServer } from '@curator/mcp-server';

const host = await createCuratorHost({
  name: 'facilitator',
  dataDir: './data',
  registerPlugins: (ctx) => registerFacilitatorPlugins(ctx),
});

await host.start();

const mcp = await createMcpServer({
  name: 'facilitator-mcp',
  engine: host.engine,
  prisma: host.prisma,
  host,
  transport: 'stdio',
});

await mcp.listen();
```

---

## Exposing Tools from Domain Plugins

```typescript
import { defineTool, type CuratorPlugin } from '@curator/agent-server';

export const jiraPickupTool = defineTool({
  name: 'jira_pickup',
  description: 'Pick the next assigned task from Jira backlog',
  mcp: { expose: true }, // ← Automatically surfaces on MCP!
  parameters: {
    type: 'object',
    properties: {
      projectKey: { type: 'string' },
    },
  },
  execute: async (args, ctx) => {
    // Execution logic
    return { issueKey: 'POMS-123', summary: 'Sample Issue' };
  },
});

export const jiraPlugin: CuratorPlugin = {
  name: 'facilitator-jira',
  tools: {
    jira_pickup: jiraPickupTool,
  },
};
```

---

## OpenCode / Claude Desktop Configuration

Add the server to your `mcp.json` / `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "curator": {
      "command": "npx",
      "args": ["@curator/mcp-server"],
      "env": {
        "DATA_DIR": "./data",
        "CURATOR_DATABASE_PATH": "./data/state/curator.db"
      }
    }
  }
}
```
