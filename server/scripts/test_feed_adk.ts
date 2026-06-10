import { Agent, SequentialAgent, BaseAgent } from '@google/adk';
import { compileADKAgent } from '../src/services/ast/adk_compiler.js';
import { VOCAB } from '../src/constants/vocabulary.js';

/**
 * PATHWAY A: Using Google ADK's Code-First OOP Class Format
 * 
 * In standard Google ADK, complex procedural tasks like loops, conditional filtering,
 * and database upserts are modeled using specialized custom Agents or Function nodes.
 * Here we define a sequential workflow composed of individual agent/tool steps.
 */

// 1. Define the Feed Processor Agent
const feedProcessorAgent = new Agent({
    name: 'feed_processor',
    model: 'local-gemma-3-1b-it',
    instruction: `Fetch news feed and parse items. Exclude categories: 'Viipekeelsed', 'ilm', 'uudised', 'ETV uudised', 'Raadiouudised'.`,
    // In ADK, we would register custom local tool functions
    tools: []
});

// 2. Define the Resource Creator Agent
const resourceCreatorAgent = new Agent({
    name: 'resource_creator',
    model: 'local-gemma-3-1b-it',
    instruction: `For each valid feed item, upsert a database resource with type: ${VOCAB.TYPE.article} and status: ${VOCAB.STATUS.draft}.`
});

// 3. Define the Tag Relation Linker Agent
const relationLinkerAgent = new Agent({
    name: 'relation_linker',
    model: 'local-gemma-3-1b-it',
    instruction: `Create relationships between feed provider resource and articles, and associate categories as 'err:<tag>' relations.`
});

// Chain them sequentially under a root agent
export const errFeedWorkflow = new SequentialAgent({
    name: 'err_feed_pipeline',
    subAgents: [feedProcessorAgent, resourceCreatorAgent, relationLinkerAgent]
});


/**
 * PATHWAY B: Directed Graph Configuration (ADKWorkflow structure)
 * 
 * In a flat directed graph state-machine configuration, nodes map directly to 
 * tools, conditions, and sub-agents. Transitions represent edges.
 */
export const errFeedGraph = {
    startNode: 'process_feed',
    nodes: [
        {
            id: 'process_feed',
            type: 'tool',
            toolName: 'process_feed',
            args: {
                url: "http://uudised.err.ee/uudised_rss.php",
                excludedUrlPatterns: ['sport.err.ee']
            },
            next: 'check_items'
        },
        {
            id: 'check_items',
            type: 'condition',
            // Check if items were extracted
            conditionExpr: '{{toolData.process_feed.items.length}} > 0',
            trueNext: 'iterate_items',
            falseNext: 'END'
        },
        // Note: For complex nested iterations in a flat state graph, the node transitions 
        // back to check state indexes, or delegates to sub-graph pipelines (using Spawn / ForEach AST blocks)
        {
            id: 'iterate_items',
            type: 'tool',
            toolName: 'iterate', // Maps to internal iteration / ForEach AST construction
            args: {
                items: '{{toolData.process_feed.items}}',
                iterator: 'item'
            },
            next: 'END'
        }
    ]
};

// Compile the sequential OOP ADK flow to Curator JSON AST
const compiledAST = compileADKAgent(errFeedWorkflow);
console.log('--- COMPILED FEED PIPELINE AST ---');
console.log(JSON.stringify(compiledAST, null, 2));
