import { Pipeline } from '../src/services/ast/builder.js';

/**
 * Weather Summary Pipeline (Linear)
 * 
 * This script demonstrates the professional way to aggregate and summarize
 * resources using a linear tool chain. Each tool can reference the 
 * results of previous tools in the same chain.
 */
const pipeline = new Pipeline();

const feedData = pipeline.tool('process_feed', {
    url: "http://uudised.err.ee/uudised_rss.php",
    limit: 10
});

const formatData = pipeline.tool('format_list', {
    items: feedData.items,
    template: "- {{title}}: {{contentSnippet}}"
});

pipeline.tool('ask_llm', {
    prompt: `
        You are a high-fidelity weather analyst. 
        Below is a list of recent weather reports from ERR.
        
        REPORTS:
        ${formatData.data}

        
        TASK:
        Please provide a professional summary of the current weather situation in Estonia.
    `
});

export default pipeline;
