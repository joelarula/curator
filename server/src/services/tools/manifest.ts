/**
 * manifest.ts — Central list of all registered tool names.
 * Used by AIQ to initialize fluent methods without loading full tool handlers.
 */
export const TOOL_NAMES = [
    'ask_llm',

    'process_feed',
    'classify',
    'classify_et',
    'feature_extraction',
    'upsert_resource',
    'upsert_text',
    'upsert_relation',
    'query_resources',
    'fetch_html',
    'scrape_resource',
    'extract_resource_links',
    'execute_script',
    'classify_udc',
    'udc_cat',
    'iterate',
    'debug',
    'set_context',
    'get_context',
    'get_resource',
    'extract_udc_hierarchy',
    'format_list',
    'select_objects',
    'internal:trigger_agent'





] as const;

export type ToolName = typeof TOOL_NAMES[number];

/**
 * Convenience constant mapping for IDE autocompletion (Enum-style).
 */
export const TOOLS = {
    ASK_LLM: 'ask_llm',
    PROCESS_FEED: 'process_feed',
    CLASSIFY: 'classify',
    CLASSIFY_ET: 'classify_et',
    FEATURE_EXTRACTION: 'feature_extraction',
    UPSERT_RESOURCE: 'upsert_resource',
    UPSERT_TEXT: 'upsert_text',
    UPSERT_RELATION: 'upsert_relation',
    QUERY_RESOURCES: 'query_resources',
    FETCH_HTML: 'fetch_html',
    SCRAPE_RESOURCE: 'scrape_resource',
    EXTRACT_RESOURCE_LINKS: 'extract_resource_links',
    EXECUTE_SCRIPT: 'execute_script',
    CLASSIFY_UDC: 'classify_udc',
    UDC_CAT: 'udc_cat',
    ITERATE: 'iterate',
    DEBUG: 'debug',
    SET_CONTEXT: 'set_context',
    GET_CONTEXT: 'get_context',
    GET_RESOURCE: 'get_resource',
    EXTRACT_UDC_HIERARCHY: 'extract_udc_hierarchy',
    FORMAT_LIST: 'format_list',
    SELECT_OBJECTS: 'select_objects',
    TRIGGER_AGENT: 'internal:trigger_agent'
} as const;
