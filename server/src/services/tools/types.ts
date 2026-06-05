import type { Resource, Relation, Text } from '@prisma/client';

/**
 * Common data shapes for tools.
 */

export interface ToolResult<T = any> {
    success: boolean;
    data: T;
    error?: string;
    aiModel?: {
        name: string;
        provider: string;
        type?: string;
        shortName?: string;
    };
}

/** Tools that produce a primary Resource item. */
export interface ResourceProducer {
    createdItem: Resource;
}

/** Tools that return a list of items for fan-out (.onItem / .foreach). */
export interface Fannable<T = any> {
    items: T[];
}

export interface AIQContext {
    feed?: Resource;
    resources?: Resource[];
    toolData?: any;
    parentItem?: any;
}


/**
 * Specific Tool Input/Output Types
 */

// process_feed
export interface ProcessFeedInput {
    url: string;
    excludedUrlPatterns?: string[];
    excludedCategories?: string[];
}
export interface EvaluateConditionInput<T = any> {
    expression?: string;
    evalFn?: (data: T) => boolean;
    data?: T;
}

export interface FeedItem {
    title: string;
    uri: string;
    link: string;
    content: string;
    categories: string[];
    isoDate: string;
    isNew: boolean;
    resource: Resource | null;
}

export interface ProcessFeedOutput extends ToolResult, Fannable<FeedItem> {

    data: {
        feed: Resource;
        stats: { total: number; new: number; existing: number };
    };
}

// upsert_resource
export interface UpsertResourceInput {
    uri: string;
    title?: string;
    description?: string;
    type?: string;
    resourceType?: string;
    status?: string;
    language?: string;

    isPublished?: boolean;
}
export interface UpsertResourceOutput extends ToolResult, ResourceProducer {
    data: any; // The sanitized resource object
}

// upsert_relation
export interface UpsertRelationInput {
    subjectUri: string;
    predicateUri: string;
    objectUri: string;
    justification?: string;
    aiModel?: string;
    literalValue?: number;
    literalString?: string;
    literalDate?: string; // ISO string
    literalBoolean?: boolean;
    literalDatatype?: string;
    registerAsEnumOption?: boolean;
}


export interface UpsertRelationOutput extends ToolResult {
    data: {
        id: number;
        subjectUri: string;
        predicateUri: string;
        objectUri: string;
        justification?: string | null;
        literalValue?: number | null;
        action: 'upserted';
    };
}



// classify
export interface ClassifyInput {
    text: string;
    candidateLabels: string[];
    model?: string;
}
export interface ClassifyOutput extends ToolResult {
    data: {
        labels: string[];
        scores: number[];
    };
}

// classify_et
export interface ClassifyEtInput {
    text: string;
    candidateLabels: string[];
    model?: string;
}
export interface ClassifyEtOutput extends ToolResult {
    data: {
        labels: string[];
        scores: number[];
    };
}

// feature_extraction
export interface FeatureExtractionInput {
    text: string;
    model?: string;
}
export interface FeatureExtractionOutput extends ToolResult {
    data: {
        embedding: number[];
    };
}

// query_resources
export interface QueryResourcesInput {
    // String filters (Exact or Contains)
    uri?: string;
    uriContains?: string;
    title?: string;
    titleContains?: string;


    // Enum/Type filters (uses string names)
    status?: string | string[];
    type?: string | string[];
    language?: string | string[];
    isPublished?: boolean;


    // Date range filters (ISO strings)
    createdAfter?: string;
    createdBefore?: string;
    updatedAfter?: string;
    updatedBefore?: string;

    // Advanced Relation-based search
    relation?: RelationFilter;
    relations?: RelationFilter[];
    excludeRelation?: RelationFilter;
    excludeRelations?: RelationFilter[];

    limit?: number;
    offset?: number;
}

export interface RelationFilter {
    subjectUri?: string;
    predicateUri?: string;
    objectUri?: string;
    objectUriContains?: string;
    literalValue?: number;
    literalGte?: number;
    literalLte?: number;
    literalString?: string;
    literalDate?: string;
    literalBoolean?: boolean;
    literalDatatype?: string;
}


export interface QueryResourcesOutput extends ToolResult, Fannable<Resource> {
    data: {
        count: number;
        total?: number;
        items?: any[];
    };

}

// fetch_html
export interface FetchHtmlInput {
    url: string;
}
export interface FetchHtmlOutput extends ToolResult {
    data: {
        resourceId: number;
        htmlLength: number;
    };
}

// scrape_resource
export interface ScrapeResourceInput {
    url: string;
    role?: string;
}
export interface ScrapeResourceOutput extends ToolResult, ResourceProducer {
    data: any;
}

// extract_resource_links
export interface ExtractResourceLinksInput {
    url: string;
}
export interface ExtractResourceLinksOutput extends ToolResult, Fannable {
    data: { linkCount: number };
}

// execute_script
export interface ExecuteScriptInput {
    scriptId?: number;
    scriptBody?: string;
}
export interface ExecuteScriptOutput extends ToolResult {
    data: any;
}

// classify_udc
export interface ClassifyUdcInput {
    resourceUri: string;
}
export interface ClassifyUdcOutput extends ToolResult {
    data: { categories: string[] };
}

// udc_cat
export interface UdcCatInput {
    resourceUri: string;
    category: string;
}
export interface UdcCatOutput extends ToolResult {
    data: { success: boolean };
}

// ask_llm
export interface AskLlmInput {
    prompt: string;
    model?: string;
    temperature?: number;
    systemPrompt?: string;
    json?: boolean;
}
export interface AskLlmOutput extends ToolResult {
    data: string | any; // String response or parsed JSON
}

// debug
export interface DebugInput {
    message?: string;
    data?: any;
}
export interface DebugOutput extends ToolResult {
    data: { logged: true };
}

// iterate
export interface IterateInput {
    items: any[];
}
export interface IterateOutput extends ToolResult, Fannable {
    data: { success: true };
}


// context
export interface SetContextInput {
    key: string;
    value: any;
}
export interface GetContextInput {
    key: string;
}

// get_resource
export interface GetResourceInput {
    id?: number;
    uri?: string;
}

// delete_resource
export interface DeleteResourceInput {
    uri?: string;
    id?: number;
    hardDelete?: boolean;
}
export interface DeleteResourceOutput extends ToolResult {
    data: { action: string, id: number, uri: string | null };
}

// llama.cpp API tools
export interface LlamaCommonInput {
    baseUrl?: string;
    apiKey?: string;
    timeoutMs?: number;
    queryParams?: Record<string, unknown>;
}

export interface LlamaHealthInput extends LlamaCommonInput {}

export interface LlamaRequestInput extends LlamaCommonInput {
    method: 'GET' | 'POST' | string;
    path: string;
    body?: unknown;
}

export interface LlamaModelsInput extends LlamaCommonInput {
    api?: 'oai' | 'router';
    reload?: boolean;
    model?: string;
}

export interface LlamaChatCompletionInput extends LlamaCommonInput {
    model: string;
    messages: unknown[];
    [key: string]: unknown;
}

export interface LlamaCompletionInput extends LlamaCommonInput {
    prompt: unknown;
    [key: string]: unknown;
}

export interface LlamaTokenizeInput extends LlamaCommonInput {
    content: string;
    add_special?: boolean;
    parse_special?: boolean;
    with_pieces?: boolean;
}

export interface LlamaDetokenizeInput extends LlamaCommonInput {
    tokens: number[];
}

export interface LlamaApplyTemplateInput extends LlamaCommonInput {
    messages: unknown[];
    [key: string]: unknown;
}

export interface LlamaEmbeddingInput extends LlamaCommonInput {
    content: string;
    embd_normalize?: number;
    [key: string]: unknown;
}

export interface LlamaV1EmbeddingsInput extends LlamaCommonInput {
    input: string | string[];
    model?: string;
    encoding_format?: 'float' | 'base64';
    [key: string]: unknown;
}

export interface LlamaRerankInput extends LlamaCommonInput {
    query: string;
    documents: string[];
    model?: string;
    top_n?: number;
    [key: string]: unknown;
}

export interface LlamaPropsGetInput extends LlamaCommonInput {
    model?: string;
    autoload?: boolean;
}

export interface LlamaPropsSetInput extends LlamaCommonInput {
    body?: Record<string, unknown>;
}

export interface LlamaSlotsInput extends LlamaCommonInput {
    failOnNoSlot?: boolean;
    model?: string;
}

export interface LlamaSlotActionInput extends LlamaCommonInput {
    id_slot: number;
    action: 'save' | 'restore' | 'erase';
    filename?: string;
}

export interface LlamaMetricsInput extends LlamaCommonInput {
    model?: string;
}

export interface LlamaLoraListInput extends LlamaCommonInput {}

export interface LlamaLoraSetInput extends LlamaCommonInput {
    adapters: Array<{ id: number; scale: number }>;
}

export interface LlamaResponsesInput extends LlamaCommonInput {
    model: string;
    input: unknown;
    [key: string]: unknown;
}

export interface LlamaMessagesInput extends LlamaCommonInput {
    model: string;
    messages: unknown[];
    [key: string]: unknown;
}

export interface LlamaMessagesCountTokensInput extends LlamaCommonInput {
    model: string;
    messages: unknown[];
    [key: string]: unknown;
}

