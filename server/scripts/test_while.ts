import { Pipeline } from '../src/services/ast/builder.js';

const pipeline = new Pipeline();

pipeline.tool('set_context', { key: 'counter', value: 0 });

pipeline.while('{{conversation.counter}} < 3', (whileFlow) => {
    whileFlow.tool('debug', { message: "Inside while loop. Counter: {{conversation.counter}}" });
    
    // Simulate some work...
    
    // Increment the counter. Since we can't do arbitrary math easily in the template, 
    // we would normally use a tool or an agent. For now we use the `get_context` 
    // but in a real pipeline you might want a `math` tool or do this in the agent.
    // For demonstration, let's just break it by setting it to 10.
    whileFlow.tool('set_context', { key: 'counter', value: 10 });
});

pipeline.tool('debug', { message: "Finished while loop test." });

export default pipeline;
