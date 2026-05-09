import { PrismaClient } from '@prisma/client';

import { AIQ } from './AIQ.js';
import { persistAddress }  from './tools/persistAddress.js';
import { processFeed }     from './tools/processFeed.js';
import { classify }          from './tools/classify.js';
import { askLlm }          from './tools/askLlm.js';
import { upsertResource }      from './tools/upsertResource.js';
import { upsertRelation }      from './tools/upsertRelation.js';
import { queryResources }      from './tools/queryResources.js';
import { fetchHtml }           from './tools/fetchHtml.js';
import { scrapeResource }      from './tools/scrapeResource.js';
import { extractResourceLinks } from './tools/extractResourceLinks.js';
import { upsertText }           from './tools/upsertText.js';
import { executeScript }        from './tools/executeScript.js';
import { classifyEstonian }     from './tools/classifyEstonian.js';
import { featureExtraction }    from './tools/featureExtraction.js';
import { classifyUdc }         from './tools/classifyUdc.js';
import { udcCat }             from './tools/udcCat.js';
import { TOOL_NAMES }       from './tools/manifest.js';

// ─── Tool Handler Type ────────────────────────────────────────────────────────

export type ToolHandler = (
    args: any,
    prisma: PrismaClient,
    userId: string,
    responseId?: number,
    request?: any
) => Promise<any>;

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
        name: 'persist_address',
        description: 'Saves a physical address as a Resource (type: LOCATION) and creates an extracted_address relation.',
        version: '1.0.0',
        handler: persistAddress,
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
];

// ─── Register all tools as AIQ plugins ─────────────────────────────────
// Runs once on module load. After this every tool is a fluent method:
//   AIQ.start().process_feed({ url }).upsert_resource({ uri }).toJSON()
for (const name of TOOL_NAMES) {
    AIQ.register(name);
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
    responseId?: number,
    request?: any
) {
    const handler = HANDLER_MAP.get(toolName);
    if (!handler) {
        throw new Error(`Unknown tool: "${toolName}". Registered tools: ${[...HANDLER_MAP.keys()].join(', ')}`);
    }
    return await handler(args, prisma, userId, responseId, request);
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
declare module './AIQ.js' {
    interface AIQPlugins {
        ask_llm(args?: Record<string, any>): AIQ & AIQPlugins;
        persist_address(args?: Record<string, any>): AIQ & AIQPlugins;
        process_feed(args?: Record<string, any>): AIQ & AIQPlugins;
        classify(args?: Record<string, any>): AIQ & AIQPlugins;
        upsert_resource(args?: Record<string, any>): AIQ & AIQPlugins;
        upsert_text(args?: Record<string, any>): AIQ & AIQPlugins;
        upsert_relation(args?: Record<string, any>): AIQ & AIQPlugins;
        query_resources(args?: Record<string, any>): AIQ & AIQPlugins;
        fetch_html(args?: Record<string, any>): AIQ & AIQPlugins;
        scrape_resource(args?: Record<string, any>): AIQ & AIQPlugins;
        extract_resource_links(args?: Record<string, any>): AIQ & AIQPlugins;
        execute_script(args?: Record<string, any>): AIQ & AIQPlugins;
        classify_et(args?: Record<string, any>): AIQ & AIQPlugins;
        feature_extraction(args?: Record<string, any>): AIQ & AIQPlugins;
        classify_udc(args?: Record<string, any>): AIQ & AIQPlugins;
        udc_cat(args?: Record<string, any>): AIQ & AIQPlugins;
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
