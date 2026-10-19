import { processFeed } from './tools/processFeed.js';
import { classify } from './tools/classify.js';
import { askLlm } from './tools/askLlm.js';
import { upsertResource } from './tools/upsertResource.js';
import { upsertRelation } from './tools/upsertRelation.js';
import { fetchHtml } from './tools/fetchHtml.js';
import { scrapeResource } from './tools/scrapeResource.js';
import { extractResourceLinks } from './tools/extractResourceLinks.js';
import { upsertText } from './tools/upsertText.js';
import { executeScript } from './tools/executeScript.js';
import { classifyEstonian } from './tools/classifyEstonian.js';
import { featureExtraction } from './tools/featureExtraction.js';
import { iterate } from './tools/iterate.js';
import { debug } from './tools/debug.js';
import { queryResources } from './tools/queryResources.js';
import { getContext, setContext } from './tools/context.js';
import { getResource } from './tools/getResource.js';
import { deleteResource } from './tools/deleteResource.js';
import { format_list } from './tools/formatList.js';
import { selectObjects } from './tools/selectObjects.js';
import { evaluateCondition } from './tools/evaluateCondition.js';
import { regexReplace } from './tools/regexReplace.js';
import { webSearch } from './tools/webSearch.js';
import { browserAction } from './tools/browserAction.js';
import { trigger_agent } from './tools/trigger_agent.js';
import { userSpeech } from './tools/userSpeech.js';

export type RegistryToolDefinition = {
    name: string;
    description: string;
    version: string;
    accessLevel?: 'safe_read' | 'safe_write' | 'elevated' | 'destructive' | 'admin';
    requiredRole?: string;
    requiresHumanApproval?: boolean;
    requiresConfirmation?: boolean;
    handler: (...args: any[]) => Promise<any>;
};

export const CORE_TOOL_DEFINITIONS: RegistryToolDefinition[] = [
    {
        name: 'ask_llm',
        description: 'Sends an ad-hoc prompt to the language model and returns a freeform response.',
        version: '1.0.0',
        accessLevel: 'safe_read',
        requiredRole: 'agent:reader',
        requiresHumanApproval: false,
        handler: askLlm,
    },
    {
        name: 'process_feed',
        description: 'Polls an RSS/Atom feed URL and processes each new item through a nested tool call chain.',
        version: '1.0.0',
        accessLevel: 'safe_write',
        requiredRole: 'agent:operator',
        requiresHumanApproval: false,
        handler: processFeed,
    },
    {
        name: 'classify',
        description: 'Zero-shot classifies text against candidate labels using local HuggingFace models. Supports distilbert, bart, deberta.',
        version: '1.1.0',
        accessLevel: 'safe_read',
        requiredRole: 'agent:reader',
        requiresHumanApproval: false,
        handler: classify,
    },
    {
        name: 'classify_et',
        description: 'Estonian text classifier using embedding-based zero-shot (cosine similarity). Default model: me5 (Xenova/multilingual-e5-small).',
        version: '1.0.0',
        accessLevel: 'safe_read',
        requiredRole: 'agent:reader',
        requiresHumanApproval: false,
        handler: classifyEstonian,
    },
    {
        name: 'feature_extraction',
        description: 'Runs a feature-extraction (embedding) pipeline on text and stores the resulting vector as a Text(role=EMBEDDING) on the linked resource. Default model: me5.',
        version: '1.0.0',
        accessLevel: 'safe_read',
        requiredRole: 'agent:reader',
        requiresHumanApproval: false,
        handler: featureExtraction,
    },
    {
        name: 'upsert_resource',
        description: 'Idempotently creates or updates a Resource by URI. Auto-creates the ResourceType if it does not exist.',
        version: '1.0.0',
        accessLevel: 'safe_write',
        requiredRole: 'agent:writer',
        requiresHumanApproval: false,
        handler: upsertResource,
    },
    {
        name: 'upsert_text',
        description: 'Idempotently creates or updates a Text record on a Resource. Useful for saving LLM summaries or custom scraped content.',
        version: '1.0.0',
        accessLevel: 'safe_write',
        requiredRole: 'agent:writer',
        requiresHumanApproval: false,
        handler: upsertText,
    },
    {
        name: 'upsert_relation',
        description: 'Idempotently creates or updates an RDF triple by resolving subject, predicate, and object URIs. Auto-creates stub Resources as needed.',
        version: '1.0.0',
        accessLevel: 'safe_write',
        requiredRole: 'agent:writer',
        requiresHumanApproval: false,
        handler: upsertRelation,
    },
    {
        name: 'query_resources',
        description: 'Queries Resources by RDF relation filters (subject/predicate/object URI) and fans out a child tool call per matched resource via onItemExtracted.',
        version: '1.0.0',
        accessLevel: 'safe_read',
        requiredRole: 'agent:reader',
        requiresHumanApproval: false,
        handler: queryResources,
    },
    {
        name: 'fetch_html',
        description: 'Fetches raw HTML from a URL and stores it as Text(role=HTML) on the Resource. Downstream tools (scrape_resource, extract_resource_links) read from this cache instead of re-fetching.',
        version: '1.0.0',
        accessLevel: 'safe_read',
        requiredRole: 'agent:operator',
        requiresHumanApproval: false,
        handler: fetchHtml,
    },
    {
        name: 'scrape_resource',
        description: 'Fetches a web page via ScraperService, upserts it as a Resource (type: ARTICLE), and creates/replaces a Text record (role: MAIN by default) with the extracted content.',
        version: '1.0.0',
        accessLevel: 'safe_write',
        requiredRole: 'agent:operator',
        requiresHumanApproval: false,
        handler: scrapeResource,
    },
    {
        name: 'extract_resource_links',
        description: 'Fetches the HTML of a Resource URL, extracts all hyperlinks, upserts each as a stub Resource, creates links_to relations, and fans out extractedItems for downstream tool calls.',
        version: '1.0.0',
        accessLevel: 'safe_write',
        requiredRole: 'agent:operator',
        requiresHumanApproval: false,
        handler: extractResourceLinks,
    },
    {
        name: 'execute_script',
        description: 'Evaluates a stored Script (by scriptId) or inline script body and spawns its compiled tool call chain as a child Request. Scripts use the ToolChain builder API: result = run("tool", args).then(...)',
        version: '1.0.0',
        accessLevel: 'elevated',
        requiredRole: 'agent:developer',
        requiresHumanApproval: true,
        requiresConfirmation: true,
        handler: executeScript,
    },
    {
        name: 'iterate',
        description: 'Utility tool that simply returns the provided items array for fan-out (onItem).',
        version: '1.0.0',
        accessLevel: 'safe_read',
        requiredRole: 'agent:reader',
        requiresHumanApproval: false,
        handler: iterate,
    },
    {
        name: 'debug',
        description: 'Logs a message or object to the server console for debugging resolved templates.',
        version: '1.0.0',
        accessLevel: 'safe_read',
        requiredRole: 'agent:reader',
        requiresHumanApproval: false,
        handler: debug,
    },
    {
        name: 'set_context',
        description: 'Sets a persistent context key-value pair for the current execution chain.',
        version: '1.0.0',
        accessLevel: 'safe_write',
        requiredRole: 'agent:writer',
        requiresHumanApproval: false,
        handler: setContext,
    },
    {
        name: 'get_context',
        description: 'Retrieves a context value for the current execution chain.',
        version: '1.0.0',
        accessLevel: 'safe_read',
        requiredRole: 'agent:reader',
        requiresHumanApproval: false,
        handler: getContext,
    },
    {
        name: 'get_resource',
        description: 'Fetches a single resource with all its relations and texts.',
        version: '1.0.0',
        accessLevel: 'safe_read',
        requiredRole: 'agent:reader',
        requiresHumanApproval: false,
        handler: getResource,
    },
    {
        name: 'delete_resource',
        description: 'Deletes a single resource by ID or URI. Can perform a hard delete (cascading to relations) or soft delete (setting deletedAt and existent).',
        version: '1.0.0',
        accessLevel: 'destructive',
        requiredRole: 'agent:admin',
        requiresHumanApproval: true,
        requiresConfirmation: true,
        handler: deleteResource,
    },
    {
        name: 'format_list',
        description: 'Aggregates an array of objects into a single formatted string based on a template.',
        version: '1.0.0',
        accessLevel: 'safe_read',
        requiredRole: 'agent:reader',
        requiresHumanApproval: false,
        handler: format_list,
    },
    {
        name: 'internal:trigger_agent',
        description: 'Internal tool to trigger an agent and schedule the next run.',
        version: '1.0.0',
        accessLevel: 'elevated',
        requiredRole: 'agent:operator',
        requiresHumanApproval: false,
        handler: trigger_agent,
    },
    {
        name: 'select_objects',
        description: 'Generic tool to extract object resources from a list of relations based on predicate URI.',
        version: '1.0.0',
        accessLevel: 'safe_read',
        requiredRole: 'agent:reader',
        requiresHumanApproval: false,
        handler: selectObjects,
    },
    {
        name: 'evaluate_condition',
        description: 'Evaluates a raw JS expression synchronously to return a boolean result. Useful for AST if/else nodes.',
        version: '1.0.0',
        accessLevel: 'safe_read',
        requiredRole: 'agent:reader',
        requiresHumanApproval: false,
        handler: evaluateCondition,
    },
    {
        name: 'regex_replace',
        description: 'Applies one or more regex substitutions sequentially to a text string. Returns { text: string }.',
        version: '1.0.0',
        accessLevel: 'safe_read',
        requiredRole: 'agent:reader',
        requiresHumanApproval: false,
        handler: regexReplace,
    },
    {
        name: 'web_search',
        description: 'Queries Google Custom Search and returns top N organic results as { items: [{ url, title, snippet }] }.',
        version: '1.0.0',
        accessLevel: 'safe_read',
        requiredRole: 'agent:reader',
        requiresHumanApproval: false,
        handler: webSearch,
    },
    {
        name: 'browser_action',
        description: 'Executes a sequence of browser commands (navigate, click, type, wait, screenshot) for complex interactions.',
        version: '1.0.0',
        accessLevel: 'elevated',
        requiredRole: 'agent:browser',
        requiresHumanApproval: true,
        requiresConfirmation: true,
        handler: browserAction,
    },
    {
        name: 'userSpeech',
        description: 'Pure-text speech action wrapping raw user speech and emitting a user:speech event in parallel flows.',
        version: '1.0.0',
        accessLevel: 'safe_write',
        requiredRole: 'agent:writer',
        requiresHumanApproval: false,
        handler: userSpeech,
    },
];