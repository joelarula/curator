/**
 * Base interface for all Curator tools.
 * Replaces @google/adk FunctionTool.
 */
export interface CuratorToolContext {
  conversationId?: string;
  userId?: number;
  projectId?: number;
}

export interface CuratorTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, any>;

  runAsync(input: {
    args: Record<string, any>;
    toolContext: CuratorToolContext;
  }): Promise<any>;

  /** Returns a genai-compatible tool declaration for agentic tool-calling loops */
  toGenAiDeclaration(): {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

/** Helper to build a CuratorTool from a plain function */
export function defineTool(opts: {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (args: Record<string, any>, ctx: CuratorToolContext) => Promise<any>;
}): CuratorTool {
  return {
    name: opts.name,
    description: opts.description,
    parameters: opts.parameters,
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
