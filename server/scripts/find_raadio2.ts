import { Pipeline } from '../src/services/ast/builder.js';

const pipeline = new Pipeline();

// Query the database for resources that have a relation pointing to 'err:Raadio 2'
const queryResult = pipeline.tool('query_resources', {
    relation: {
        predicateUri: 'err:about', // Optional, but good practice if you know the predicate
        objectUri: 'err:Raadio 2'
    },
    limit: 50
});

// We can loop through the found items and print them out using the debug tool
pipeline.forEach(queryResult.items, (item, flow) => {
    flow.tool('debug', {
        message: 'Found Raadio 2 Resource: {{item.title}} (URI: {{item.uri}})'
    });
});

pipeline.tool('debug', {
    message: 'Total Raadio 2 items found: {{queryResult.data.total}}'
});

export default pipeline;
