import type { PrismaClient } from '@prisma/client';

export type CuratorJsonSchema = Record<string, unknown>;
export type CuratorToolOutput = unknown;

/**
 * Base interface for all Curator tools.
 * Replaces @google/adk FunctionTool.
 */
export interface CuratorToolContext {
  conversationId?: string | number;
  userId?: number | string;
  projectId?: number | string;
  prisma?: PrismaClient | any;
  [key: string]: unknown;
}

export const CuratorAccessLevel = {
  READ_ONLY: 'read_only',
  SAFE_READ: 'safe_read',
  SAFE_WRITE: 'safe_write',
  ELEVATED: 'elevated',
  DESTRUCTIVE: 'destructive',
  ADMIN: 'admin',
} as const;

export type CuratorToolAccessLevel = (typeof CuratorAccessLevel)[keyof typeof CuratorAccessLevel];
export type CuratorAccessLevel = CuratorToolAccessLevel;

export interface McpToolExposure {
  /** Expose this tool on the MCP server. Default: false */
  expose?: boolean;
  /** Override MCP tool name (default: tool.name) */
  name?: string;
  /** Override MCP description */
  description?: string;
}

export interface CuratorTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: CuratorJsonSchema;
  readonly accessLevel: CuratorToolAccessLevel;
  readonly requiredRole?: string;
  readonly requiresHumanApproval: boolean;
  readonly requiresConfirmation: boolean;
  readonly mcp?: McpToolExposure;
  readonly usage?: string;
  readonly aliases?: string[];

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

  /** Returns an MCP-compatible tool declaration for external MCP clients */
  toMcpDeclaration(): {
    name: string;
    description: string;
    inputSchema: CuratorJsonSchema;
  };
}

/** Helper to build a CuratorTool from a plain function */
export function defineTool<TArgs = Record<string, unknown>>(opts: {
  name: string;
  description: string;
  parameters: CuratorJsonSchema;
  accessLevel?: CuratorToolAccessLevel;
  requiredRole?: string;
  requiresHumanApproval?: boolean;
  requiresConfirmation?: boolean;
  mcp?: McpToolExposure;
  usage?: string;
  aliases?: string[];
  execute: (args: TArgs, ctx: CuratorToolContext) => Promise<CuratorToolOutput>;
}): CuratorTool {
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
    usage: opts.usage,
    aliases: opts.aliases,
    async runAsync({ args, toolContext }): Promise<CuratorToolOutput> {
      return opts.execute(args as TArgs, toolContext);
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
