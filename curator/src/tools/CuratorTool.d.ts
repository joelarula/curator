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
export type CuratorToolAccessLevel = 'read_only' | 'safe_read' | 'safe_write' | 'elevated' | 'destructive' | 'admin';
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
export declare function defineTool<TArgs = Record<string, unknown>>(opts: {
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
}): CuratorTool;
//# sourceMappingURL=CuratorTool.d.ts.map