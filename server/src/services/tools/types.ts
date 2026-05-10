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

/**
 * Specific Tool Input/Output Types
 */

// process_feed
export interface ProcessFeedInput {
    url: string;
}
export interface ProcessFeedOutput extends ToolResult, Fannable {
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
    notation?: string;
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
    literalValue?: number;
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
    notation?: string;
    notationContains?: string;

    // Enum/Type filters (uses string names)
    status?: string | string[];
    type?: string | string[];
    isPublished?: boolean;

    // Date range filters (ISO strings)
    createdAfter?: string;
    createdBefore?: string;
    updatedAfter?: string;
    updatedBefore?: string;

    // Advanced Relation-based search
    relation?: {
        subjectUri?: string;
        predicateUri?: string;
        objectUri?: string;
        literalValue?: number;
        literalGte?: number;
        literalLte?: number;
    };

    limit?: number;
    offset?: number;
}
export interface QueryResourcesOutput extends ToolResult, Fannable<Resource> {
    data: { 
        count: number;
        total?: number;
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

