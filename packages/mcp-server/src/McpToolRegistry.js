export class McpToolRegistry {
    constructor(engine, getContext) {
        this.engine = engine;
        this.getContext = getContext;
        this.exposedTools = new Map(); // key: MCP exposed name -> tool
        this.refresh();
    }
    static fromEngine(engine, getContext) {
        return new McpToolRegistry(engine, getContext);
    }
    refresh() {
        this.exposedTools.clear();
        for (const [toolKey, tool] of this.engine.tools.entries()) {
            if (this.isToolExposed(toolKey, tool)) {
                const declaration = tool.toMcpDeclaration();
                const mcpName = declaration.name || toolKey;
                this.exposedTools.set(mcpName, tool);
            }
        }
    }
    isToolExposed(toolKey, tool) {
        const pluginName = this.engine.toolPlugins?.get(toolKey);
        const plugin = pluginName
            ? this.engine.plugins?.find((p) => p.name === pluginName)
            : undefined;
        if (plugin?.mcp) {
            if (plugin.mcp.exclude?.includes(toolKey)) {
                return false;
            }
            if (plugin.mcp.include && Array.isArray(plugin.mcp.include)) {
                return plugin.mcp.include.includes(toolKey);
            }
            if (plugin.mcp.exposeAll === true) {
                return true;
            }
        }
        // Per-tool fallback
        if (tool.mcp?.expose === true) {
            return true;
        }
        // Default safe deny
        return false;
    }
    list() {
        const list = [];
        for (const tool of this.exposedTools.values()) {
            list.push(tool.toMcpDeclaration());
        }
        return list;
    }
    async call(name, args = {}) {
        const tool = this.exposedTools.get(name);
        if (!tool) {
            return {
                content: [{ type: 'text', text: `Error: Unknown or unexposed MCP tool "${name}"` }],
                isError: true,
            };
        }
        if (tool.accessLevel === 'destructive' && process.env.MCP_ALLOW_DESTRUCTIVE !== 'true') {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Error: Tool "${name}" is marked destructive and requires MCP_ALLOW_DESTRUCTIVE=true in environment.`,
                    },
                ],
                isError: true,
            };
        }
        try {
            const toolContext = await this.getContext();
            const output = await tool.runAsync({
                args,
                toolContext,
            });
            const formattedText = typeof output === 'string'
                ? output
                : JSON.stringify(output, null, 2);
            return {
                content: [{ type: 'text', text: formattedText }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Error: ${err?.message || String(err)}` }],
                isError: true,
            };
        }
    }
}
//# sourceMappingURL=McpToolRegistry.js.map