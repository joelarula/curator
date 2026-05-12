import { AIQ } from '../src/services/AIQ.js';

/**
 * Weather Summary Pipeline (Linear)
 * 
 * This script demonstrates the professional way to aggregate and summarize
 * resources using a linear tool chain. Each tool can reference the 
 * results of previous tools in the same chain.
 */
AIQ.init();

const flow = AIQ.chain("query_resources", {
    relation: {
        objectUri: "err:ilm"
    },
    limit: 10
})
.chain("format_list", {
    items: "{{query_resources.items}}",
    template: "- {{title}}: {{description}}"
})
.ask({
    prompt: `
        You are a high-fidelity weather analyst. 
        Below is a list of recent weather reports from ERR.
        
        REPORTS:
        {{format_list}}

        
        TASK:
        Please provide a professional summary of the current weather situation in Estonia.
    `
});

export default flow;
