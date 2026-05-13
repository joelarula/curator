import { Pipeline } from '../src/services/ast/builder.js';

const pipeline = new Pipeline();

// 1. Query for resources that match the prefix
const queryResult = pipeline.tool('query_resources', {
    uriContains: 'sport.err.ee', // Matches the ERR sports domain
    limit: 50 // process in batches
});

// 2. Iterate over the returned items and soft-delete them (archive)
pipeline.forEach(queryResult.items, (item, flow) => {
    flow.tool('delete_resource', {
        id: item.id,
        hardDelete: false // Soft delete: sets existent to null and marks deletedAt, keeping it archived in DB
    });
    
    flow.tool('debug', {
        message: "Deleted resource: {{item.uri}} (ID: {{item.id}})"
    });
});

pipeline.tool('debug', {
    message: "Finished deletion of sports news batch."
});

export default pipeline;
