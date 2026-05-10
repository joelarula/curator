import { AIQ } from '../src/services/AIQ.js';

const flow = AIQ
    // 1. Store a value in the conversation metadata
    .chain("set_context", { key: "research_focus", value: "Digital Governance" })
    // 2. Immediately use it in a template
    .chain("debug", { 
        message: "The conversation focus is now: {{conversation.research_focus}}" 
    });

export default flow;
