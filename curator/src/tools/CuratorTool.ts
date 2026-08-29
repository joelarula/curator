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

export type CuratorToolAccessLevel = 'read_only' | 'safe_write' | 'elevated' | 'destructive';

export interface CuratorTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: CuratorJsonSchema;
  readonly accessLevel: CuratorToolAccessLevel;
  readonly requiresConfirmation: boolean;

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
  accessLevel?: CuratorToolAccessLevel;
  requiresConfirmation?: boolean;
  execute: (args: Record<string, unknown>, ctx: CuratorToolContext) => Promise<CuratorToolOutput>;
}): CuratorTool {
  return {
    name: opts.name,
    description: opts.description,
    parameters: opts.parameters,
    accessLevel: opts.accessLevel ?? 'safe_write',
    requiresConfirmation: opts.requiresConfirmation ?? false,
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
