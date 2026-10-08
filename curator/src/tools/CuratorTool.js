/** Helper to build a CuratorTool from a plain function */
export function defineTool(opts) {
    return {
        name: opts.name,
        description: opts.description,
        parameters: opts.parameters,
        accessLevel: opts.accessLevel ?? 'safe_write',
        requiresConfirmation: opts.requiresConfirmation ?? false,
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
    };
}
//# sourceMappingURL=CuratorTool.js.map