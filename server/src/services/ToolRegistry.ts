import { PrismaClient } from '@prisma/client';

import { Curator } from './Curator.js';
import type { CuratorFlow } from './Curator.js';
import { CORE_TOOL_DEFINITIONS } from './CoreToolRegistry.js';
import { LLAMA_TOOL_DEFINITIONS } from './LlamaToolRegistry.js';








import { TOOL_NAMES }       from './tools/manifest.js';
import type * as T from './tools/types.js';


// ─── Tool Handler Type ────────────────────────────────────────────────────────

export type ToolHandler<I = any, O = any> = (
    args: I,
    prisma: PrismaClient,
    userId: string,
    responseId?: number,
    request?: any
) => Promise<O>;


// ─── Tool Definition ──────────────────────────────────────────────────────────

export interface ToolDefinition {
    name: string;
    description: string;
    version: string;
    handler: ToolHandler;
}

// ─── Registered Tools ─────────────────────────────────────────────────────────

const TOOLS: ToolDefinition[] = [
    ...CORE_TOOL_DEFINITIONS,
    ...LLAMA_TOOL_DEFINITIONS,

];




// ─── Register all tools as Curator plugins ─────────────────────────────────
// Runs once on module load. After this every tool is a fluent method:
//   Curator.start().process_feed({ url }).upsert_resource({ uri }).toJSON()
for (const name of TOOL_NAMES) {
    Curator.register(name);
}

// ─── Internal Dispatch Map ────────────────────────────────────────────────────

const HANDLER_MAP = new Map<string, ToolHandler>(
    TOOLS.map(t => [t.name, t.handler])
);

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Executes a registered tool by name.
 * Throws if the tool is unknown.
 */
export async function executeTool(
    toolName: string,
    args: any,
    prisma: PrismaClient,
    userId: string,
    request?: any,
    responseId?: number
) {
    const handler = HANDLER_MAP.get(toolName);
    if (!handler) {
        throw new Error(`Unknown tool: "${toolName}". Registered tools: ${[...HANDLER_MAP.keys()].join(', ')}`);
    }
    if (handler.length === 4) {
        return await handler(args, prisma, userId, request);
    } else {
        return await handler(args, prisma, userId, responseId, request);
    }
}


/**
 * Returns the static list of all registered tool definitions.
 */
export function getRegisteredTools(): Omit<ToolDefinition, 'handler'>[] {
    return TOOLS.map(({ name, description, version }) => ({ name, description, version }));
}

/**
 * Upserts all registered tools into the database Tool table.
 * Called once on server startup (or seed).
 */
// ─── TypeScript plugin type augmentation ─────────────────────────────────────
declare module './Curator.js' {
    interface CuratorPlugins {
        ask_llm(args: T.AskLlmInput): CuratorFlow;

        process_feed(args: T.ProcessFeedInput): CuratorFlow;
        classify(args: T.ClassifyInput): CuratorFlow;
        upsert_resource(args: T.UpsertResourceInput): CuratorFlow;
        upsert_text(args: any): CuratorFlow;
        upsert_relation(args: T.UpsertRelationInput): CuratorFlow;
        query_resources(args: T.QueryResourcesInput): CuratorFlow;
        fetch_html(args: T.FetchHtmlInput): CuratorFlow;
        scrape_resource(args: T.ScrapeResourceInput): CuratorFlow;
        extract_resource_links(args: T.ExtractResourceLinksInput): CuratorFlow;
        execute_script(args: T.ExecuteScriptInput): CuratorFlow;
        classify_et(args: T.ClassifyEtInput): CuratorFlow;
        feature_extraction(args: T.FeatureExtractionInput): CuratorFlow;
        classify_udc(args: T.ClassifyUdcInput): CuratorFlow;
        udc_cat(args: T.UdcCatInput): CuratorFlow;
        iterate(args: T.IterateInput): CuratorFlow;
        debug(args: T.DebugInput): CuratorFlow;
        delete_resource(args: T.DeleteResourceInput): CuratorFlow;
        select_objects(args: { items: any[], predicateUri: string }): CuratorFlow;
        evaluate_condition(args: T.EvaluateConditionInput): CuratorFlow;
        as(name: string): CuratorFlow;
    }




}

export async function syncToolsToDatabase(prisma: PrismaClient): Promise<void> {
    console.log('[ToolRegistry] Syncing tools to database...');
    for (const tool of TOOLS) {
        await prisma.tool.upsert({
            where:  { name: tool.name },
            update: { description: tool.description, version: tool.version, enabled: true },
            create: { name: tool.name, description: tool.description, version: tool.version, enabled: true },
        });
    }
    console.log(`[ToolRegistry] ${TOOLS.length} tools synced.`);
}
