import { Pipeline } from '../src/services/ast/builder.js';
import type { QueryResourcesOutput } from '../src/services/tools/types.js';

/**
 * Weather Summary Pipeline (Linear)
 * 
 * This script demonstrates the professional way to aggregate and summarize
 * resources using a linear tool chain. Each tool can reference the 
 * results of previous tools in the same chain.
 */
const pipeline = new Pipeline();

const queryData = pipeline.tool<QueryResourcesOutput>('query_resources', {
    relation: {
        objectUri: "err:ilm"
    },
    limit: 10
});

const formatData = pipeline.tool('format_list', {
    items: queryData.items,
    template: "- {{title}}: {{description}}"
});

pipeline.tool('ask_llm', {
    prompt: `
        You are a high-fidelity weather analyst. 
        Below is a list of recent weather reports from ERR.
        
        REPORTS:
        ${formatData}

        
        TASK:
        Please provide a professional summary of the current weather situation in Estonia.
    `
});

export default pipeline;
