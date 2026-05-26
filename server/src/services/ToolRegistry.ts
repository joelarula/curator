import { PrismaClient } from '@prisma/client';

import { Curator } from './Curator.js';

import { processFeed }     from './tools/processFeed.js';
import { classify }          from './tools/classify.js';
import { askLlm }          from './tools/askLlm.js';
import { upsertResource }      from './tools/upsertResource.js';
import { upsertRelation }      from './tools/upsertRelation.js';
import { fetchHtml }           from './tools/fetchHtml.js';
import { scrapeResource }      from './tools/scrapeResource.js';
import { extractResourceLinks } from './tools/extractResourceLinks.js';
import { upsertText }           from './tools/upsertText.js';
import { executeScript }        from './tools/executeScript.js';
import { classifyEstonian }     from './tools/classifyEstonian.js';
import { featureExtraction }    from './tools/featureExtraction.js';
import { classifyUdc }         from './tools/classifyUdc.js';
import { udcCat }             from './tools/udcCat.js';
import { iterate }            from './tools/iterate.js';
import { debug }              from './tools/debug.js';
import { queryResources }      from './tools/queryResources.js';
import { getContext, setContext } from './tools/context.js';
import { getResource }         from './tools/getResource.js';
import { deleteResource }      from './tools/deleteResource.js';
import { extractUdcHierarchy } from './tools/udcUtils.js';
import { format_list }         from './tools/formatList.js';
import { selectObjects }        from './tools/selectObjects.js';
import { evaluateCondition }    from './tools/evaluateCondition.js';
import { regexReplace }         from './tools/regexReplace.js';
import { webSearch }            from './tools/webSearch.js';
import { browserAction }        from './tools/browserAction.js';
import { trigger_agent }      from './tools/trigger_agent.js';








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
    {
        name: 'ask_llm',
        description: 'Sends an ad-hoc prompt to the language model and returns a freeform response.',
        version: '1.0.0',
        handler: askLlm,
    },

    {
        name: 'process_feed',
        description: 'Polls an RSS/Atom feed URL and processes each new item through a nested tool call chain.',
        version: '1.0.0',
        handler: processFeed,
    },
    {
        name: 'classify',
        description: 'Zero-shot classifies text against candidate labels using local HuggingFace models. Supports distilbert, bart, deberta.',
        version: '1.1.0',
        handler: classify,
    },
    {
        name: 'classify_et',
        description: 'Estonian text classifier using embedding-based zero-shot (cosine similarity). Default model: me5 (Xenova/multilingual-e5-small).',
        version: '1.0.0',
        handler: classifyEstonian,
    },
    {
        name: 'feature_extraction',
        description: 'Runs a feature-extraction (embedding) pipeline on text and stores the resulting vector as a Text(role=EMBEDDING) on the linked resource. Default model: me5.',
        version: '1.0.0',
        handler: featureExtraction,
    },
    {
        name: 'upsert_resource',
        description: 'Idempotently creates or updates a Resource by URI. Auto-creates the ResourceType if it does not exist.',
        version: '1.0.0',
        handler: upsertResource,
    },
    {
        name: 'upsert_text',
        description: 'Idempotently creates or updates a Text record on a Resource. Useful for saving LLM summaries or custom scraped content.',
        version: '1.0.0',
        handler: upsertText,
    },
    {
        name: 'upsert_relation',
        description: 'Idempotently creates or updates an RDF triple by resolving subject, predicate, and object URIs. Auto-creates stub Resources as needed.',
        version: '1.0.0',
        handler: upsertRelation,
    },
    {
        name: 'query_resources',
        description: 'Queries Resources by RDF relation filters (subject/predicate/object URI) and fans out a child tool call per matched resource via onItemExtracted.',
        version: '1.0.0',
        handler: queryResources,
    },
    {
        name: 'fetch_html',
        description: 'Fetches raw HTML from a URL and stores it as Text(role=HTML) on the Resource. Downstream tools (scrape_resource, extract_resource_links) read from this cache instead of re-fetching.',
        version: '1.0.0',
        handler: fetchHtml,
    },
    {
        name: 'scrape_resource',
        description: 'Fetches a web page via ScraperService, upserts it as a Resource (type: ARTICLE), and creates/replaces a Text record (role: MAIN by default) with the extracted content.',
        version: '1.0.0',
        handler: scrapeResource,
    },
    {
        name: 'extract_resource_links',
        description: 'Fetches the HTML of a Resource URL, extracts all hyperlinks, upserts each as a stub Resource, creates links_to relations, and fans out extractedItems for downstream tool calls.',
        version: '1.0.0',
        handler: extractResourceLinks,
    },
    {
        name: 'execute_script',
        description: 'Evaluates a stored Script (by scriptId) or inline script body and spawns its compiled tool call chain as a child Request. Scripts use the ToolChain builder API: result = run("tool", args).then(...)',
        version: '1.0.0',
        handler: executeScript,
    },
    {
        name: 'classify_udc',
        description: 'Uses an LLM to classify a resource into UDC categories (JSON output), activates UDC resources, and creates subject relations.',
        version: '1.0.0',
        handler: classifyUdc,
    },
    {
        name: 'udc_cat',
        description: 'Persists a UDC category classification: activates/creates the UDC resource and creates a dc:subject relation.',
        version: '1.0.0',
        handler: udcCat,
    },
    {
        name: 'iterate',
        description: 'Utility tool that simply returns the provided items array for fan-out (onItem).',
        version: '1.0.0',
        handler: iterate,
    },
    {
        name: 'debug',
        description: 'Logs a message or object to the server console for debugging resolved templates.',
        version: '1.0.0',
        handler: debug,
    },
    {
        name: 'set_context',
        description: 'Sets a persistent context key-value pair for the current execution chain.',
        version: '1.0.0',
        handler: setContext,
    },
    {
        name: 'get_context',
        description: 'Retrieves a context value for the current execution chain.',
        version: '1.0.0',
        handler: getContext,
    },
    {
        name: 'get_resource',
        description: 'Fetches a single resource with all its relations and texts.',
        version: '1.0.0',
        handler: getResource,
    },
    {
        name: 'delete_resource',
        description: 'Deletes a single resource by ID or URI. Can perform a hard delete (cascading to relations) or soft delete (setting deletedAt and existent).',
        version: '1.0.0',
        handler: deleteResource,
    },
    {
        name: 'extract_udc_hierarchy',
        description: 'Calculates the parent UDC notation from a URI.',
        version: '1.0.0',
        handler: extractUdcHierarchy,
    },
    {
        name: 'format_list',
        description: 'Aggregates an array of objects into a single formatted string based on a template.',
        version: '1.0.0',
        handler: format_list,
    },
    {
        name: 'internal:trigger_agent',
        description: 'Internal tool to trigger an agent and schedule the next run.',
        version: '1.0.0',
        handler: trigger_agent,
    },
    {
        name: 'select_objects',
        description: 'Generic tool to extract object resources from a list of relations based on predicate URI.',
        version: '1.0.0',
        handler: selectObjects,
    },
    {
        name: 'evaluate_condition',
        description: 'Evaluates a raw JS expression synchronously to return a boolean result. Useful for AST if/else nodes.',
        version: '1.0.0',
        handler: evaluateCondition,
    },
    {
        name: 'regex_replace',
        description: 'Applies one or more regex substitutions sequentially to a text string. Returns { text: string }.',
        version: '1.0.0',
        handler: regexReplace,
    },
    {
        name: 'web_search',
        description: 'Queries Google Custom Search and returns top N organic results as { items: [{ url, title, snippet }] }.',
        version: '1.0.0',
        handler: webSearch,
    },
    {
        name: 'browser_action',
        description: 'Executes a sequence of browser commands (navigate, click, type, wait, screenshot) for complex interactions.',
        version: '1.0.0',
        handler: browserAction,
    },

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
        ask_llm(args: T.AskLlmInput): Curator & CuratorPlugins;

        process_feed(args: T.ProcessFeedInput): Curator & CuratorPlugins;
        classify(args: T.ClassifyInput): Curator & CuratorPlugins;
        upsert_resource(args: T.UpsertResourceInput): Curator & CuratorPlugins;
        upsert_text(args: any): Curator & CuratorPlugins;
        upsert_relation(args: T.UpsertRelationInput): Curator & CuratorPlugins;
        query_resources(args: T.QueryResourcesInput): Curator & CuratorPlugins;
        fetch_html(args: T.FetchHtmlInput): Curator & CuratorPlugins;
        scrape_resource(args: T.ScrapeResourceInput): Curator & CuratorPlugins;
        extract_resource_links(args: T.ExtractResourceLinksInput): Curator & CuratorPlugins;
        execute_script(args: T.ExecuteScriptInput): Curator & CuratorPlugins;
        classify_et(args: T.ClassifyEtInput): Curator & CuratorPlugins;
        feature_extraction(args: T.FeatureExtractionInput): Curator & CuratorPlugins;
        classify_udc(args: T.ClassifyUdcInput): Curator & CuratorPlugins;
        udc_cat(args: T.UdcCatInput): Curator & CuratorPlugins;
        iterate(args: T.IterateInput): Curator & CuratorPlugins;
        debug(args: T.DebugInput): Curator & CuratorPlugins;
        delete_resource(args: T.DeleteResourceInput): Curator & CuratorPlugins;
        select_objects(args: { items: any[], predicateUri: string }): Curator & CuratorPlugins;
        evaluate_condition(args: T.EvaluateConditionInput): Curator & CuratorPlugins;
        as(name: string): Curator & CuratorPlugins;
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
