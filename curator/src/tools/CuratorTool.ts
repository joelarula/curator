import type { PrismaClient } from '@prisma/client';
import type { CuratorToolNode } from '../engine/CuratorAst.js';
import type { ServiceKey } from '../engine/nodes/NodeHandler.js';
import { CuratorCoreBuilder, type CuratorExpr, type TypedPathProxy } from '../engine/builder/CuratorCoreBuilder.js';

export type CuratorJsonSchema = Record<string, unknown>;
export type CuratorToolOutput = unknown;

export type TypedToolArgs<TArgs> = TArgs extends Record<string, any>
  ? { [K in keyof TArgs]?: CuratorExpr<TArgs[K]> } & Record<string, any>
  : Record<string, any>;

export interface CuratorToolCallOptions {
  /** Context/state key to bind the tool output to. When set, `spread` defaults to `false`. */
  as?: string | TypedPathProxy<any> | unknown;
  /** Whether top-level fields of the tool output are also merged into context/state. */
  spread?: boolean;
}

/**
 * Base interface for all Curator tools.
 * Replaces @google/adk FunctionTool.
 */
export interface CuratorToolContext {
  conversationId?: string | number;
  userId?: number | string;
  projectId?: number | string;
  prisma?: PrismaClient | any;
  /** Host and plugin services (`defineService`); set when the tool runs inside a processor, absent for local calls. */
  service?: <T>(key: ServiceKey<T>) => T;
  tryService?: <T>(key: ServiceKey<T>) => T | undefined;
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

export interface CuratorTool<TArgs = Record<string, unknown>, TOutput = CuratorToolOutput> {
  /**
   * Directly callable in workflow AST definitions (like Bevy `register_curator_tool::<T>`):
   * produces a typed `Curator_Tool` AST node with IDE autocomplete on `TArgs`.
   */
  (args?: TypedToolArgs<TArgs> | ((ctx: any) => Partial<TArgs>), options?: CuratorToolCallOptions): CuratorToolNode;
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
  }): Promise<TOutput>;

  /** Builds a `Curator_Tool` AST node (explicit alias for calling the tool directly). */
  call(args?: TypedToolArgs<TArgs> | ((ctx: any) => Partial<TArgs>), options?: CuratorToolCallOptions): CuratorToolNode;

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

/** Helper to build a callable CuratorTool from a plain function */
export function defineTool<TArgs = Record<string, unknown>, TOutput = CuratorToolOutput>(opts: {
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
  execute: (args: TArgs, ctx: CuratorToolContext) => Promise<TOutput>;
}): CuratorTool<TArgs, TOutput> {
  const requiresApproval = opts.requiresHumanApproval ?? opts.requiresConfirmation ?? false;
  const buildNode = (
    args?: TypedToolArgs<TArgs> | ((ctx: any) => Partial<TArgs>),
    options: CuratorToolCallOptions = {}
  ): CuratorToolNode => {
    const spread = options.spread ?? (options.as === undefined);
    return CuratorCoreBuilder.tool(opts.name, args as any, options.as, { spread });
  };

  const fn = function (
    args?: TypedToolArgs<TArgs> | ((ctx: any) => Partial<TArgs>),
    options?: CuratorToolCallOptions
  ): CuratorToolNode {
    return buildNode(args, options);
  } as unknown as CuratorTool<TArgs, TOutput>;

  Object.defineProperty(fn, 'name', { value: opts.name, configurable: true, enumerable: true });
  Object.assign(fn, {
    description: opts.description,
    parameters: opts.parameters,
    accessLevel: opts.accessLevel ?? 'safe_write',
    requiredRole: opts.requiredRole,
    requiresHumanApproval: requiresApproval,
    requiresConfirmation: requiresApproval,
    mcp: opts.mcp,
    usage: opts.usage,
    aliases: opts.aliases,
    call: buildNode,
    async runAsync({ args, toolContext }: { args: Record<string, unknown>; toolContext: CuratorToolContext }): Promise<TOutput> {
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
  });

  return fn;
}
