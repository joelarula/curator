import { compileADKAgent } from '../src/services/ast/adk_compiler.js';
import { Agent, SequentialAgent, GoogleSearchTool } from '@google/adk';

// 1. Create a search agent using the official Google ADK Agent class
const searchAgent = new Agent({
    name: 'search_agent',
    model: 'local-gemma-3-1b-it',
    instruction: 'Use search tool to look up details.',
    tools: [new GoogleSearchTool()]
});

// 2. Create a summarization agent
const summarizeAgent = new Agent({
    name: 'summarize_agent',
    model: 'local-gemma-3-1b-it',
    instruction: 'Create a summary report.'
});

// 3. Chain them sequentially using SequentialAgent
const sequentialFlow = new SequentialAgent({
    name: 'research_flow',
    subAgents: [searchAgent, summarizeAgent]
});

// 4. Compile the ADK object graph into a persistent database-ready Curator AST
const compiledAST = compileADKAgent(sequentialFlow);
console.log('--- COMPILED ADK CLASS GRAPH AST ---');
console.log(JSON.stringify(compiledAST, null, 2));
process.exit(0);
