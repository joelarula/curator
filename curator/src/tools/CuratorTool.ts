import type { PrismaClient } from '@prisma/client';

export type CuratorJsonSchema = Record<string, unknown>;
export type CuratorToolOutput = unknown;

/**
 * Base interface for all Curator tools.
 * Replaces @google/adk FunctionTool.
 */
export interface CuratorToolContext {
  conversationId?: string;
  userId?: number;
  projectId?: number;
  prisma?: PrismaClient;
}

export interface CuratorTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: CuratorJsonSchema;

  runAsync(input: {
    args: Record<string, unknown>;
    toolContext: CuratorToolContext;
  }): Promise<CuratorToolOutput>;

  /** Returns a genai-compatible tool declaration for agentic tool-calling loops */
  toGenAiDeclaration(): {
    name: string;
    description: string;
    parameters: CuratorJsonSchema;
  };
}

/** Helper to build a CuratorTool from a plain function */
export function defineTool(opts: {
  name: string;
  description: string;
  parameters: CuratorJsonSchema;
  execute: (args: Record<string, unknown>, ctx: CuratorToolContext) => Promise<CuratorToolOutput>;
}): CuratorTool {
  return {
    name: opts.name,
    description: opts.description,
    parameters: opts.parameters,
    async runAsync({ args, toolContext }): Promise<CuratorToolOutput> {
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
