import { AIQ } from '../src/services/AIQ.js';

/**
 * Example Script: Advanced Resource Query
 * 
 * This script demonstrates the new query_resources tool capabilities:
 * 1. Searching by title keyword.
 * 2. Filtering by status and type.
 * 3. Fanning out via .onItem() to process results.
 */

// 0. Initialize plugins (adds fluent methods like .upsert_relation)
AIQ.init();

// 1. Build the orchestration flow
const flow = AIQ.spawn("query_resources", {
    titleContains: "Eesti",
    status: ["DRAFT", "ACTIVE"],
    type: "ARTICLE",
    limit: 5
}).onItem().chain((item) => {
    // This callback is executed during the orchestration phase.

    // Using the new debug tool to inspect resolved templates
    return AIQ.chain().debug({
        message: `Found resource: {{item.title}} (URI: {{item.uri}})`,
        data: {
            id: "{{item.id}}",
            status: "{{item.status.name}}"
        }
    });
});


// 2. Output the serialized flow for inspection
console.log("--- Serialized ToolChain ---");
console.log(JSON.stringify(flow, null, 2));
console.log("----------------------------");

export default flow;
