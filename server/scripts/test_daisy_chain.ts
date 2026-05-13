import { Pipeline } from '../src/services/ast/builder.js';

const flow = new Pipeline();

flow.spawn((child1) => {
    child1.tool('debug', { message: "I am the root background request. I am spawning child 1." });
    
    child1.spawn((child2) => {
        child2.tool('debug', { message: "I am child 1. I am spawning child 2." });
        
        child2.spawn((child3) => {
            child3.tool('ask_llm', { 
                prompt: "What is the current time? Be brief.", 
                model: "gemini-3.1-flash-lite" 
            });
        });
    });
});

export default flow;
