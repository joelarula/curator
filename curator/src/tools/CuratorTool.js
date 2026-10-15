/** Helper to build a CuratorTool from a plain function */
export function defineTool(opts) {
    const requiresApproval = opts.requiresHumanApproval ?? opts.requiresConfirmation ?? false;
    return {
        name: opts.name,
        description: opts.description,
        parameters: opts.parameters,
        accessLevel: opts.accessLevel ?? 'safe_write',
        requiredRole: opts.requiredRole,
        requiresHumanApproval: requiresApproval,
        requiresConfirmation: requiresApproval,
        mcp: opts.mcp,
        async runAsync({ args, toolContext }) {
            return opts.execute(args, toolContext);
        },
        toGenAiDeclaration() {
            return {
                name: opts.name,
                description: opts.description,
                parameters: opts.parameters,
            };
        },
        toMcpDeclaration() {
            return {
                name: opts.mcp?.name ?? opts.name,
                description: opts.mcp?.description ?? opts.description,
                inputSchema: opts.parameters ?? { type: 'object', properties: {} },
            };
        },
    };
}
