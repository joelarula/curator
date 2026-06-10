import { Pipeline } from '../src/services/ast/builder.js';
import { TOOLS } from '../src/services/tools/manifest.js';

const pipeline = new Pipeline({
    meta: {
        agent: "Gemma-ReAct-Search",
        purpose: "Run conversational loops with dynamic web search queries using the first-class react loop construct"
    },
    context: {
        messages: [
            { role: 'user', content: 'What is the latest stable version of the Rust language and when was it released?' }
        ]
    }
});

// Invoke the first-class ReAct loop pipeline construct
pipeline.react({
    model: 'local-gemma-3-1b-it',
    systemPrompt: `You are an expert factual research assistant. Answer the user's question accurately.
If you do not know the answer or need to verify current facts, you MUST use the web_search tool.
Do not guess.`,
    messages: '{{conversation.messages}}',
    tools: [TOOLS.WEB_SEARCH]
});

// Output the final results to debug console
pipeline.tool('debug', { message: 'ReAct execution complete. Full conversation history: {{conversation.messages}}' });

export default pipeline;
