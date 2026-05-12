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
