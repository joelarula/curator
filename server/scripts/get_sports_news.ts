import { Pipeline } from '../src/services/ast/builder.js';

const pipeline = new Pipeline();

// 1. Query for up to 10 sports news resources
const queryResult = pipeline.tool('query_resources', {
    uriContains: 'sport.err.ee', // Matches the ERR sports domain
    limit: 10
});

// 2. Format the retrieved resources into a readable string
const formattedList = pipeline.tool('format_list', {
    items: queryResult.items, // Uses the template proxy, compiles to {{toolOutputs...items}}
    template: "ID: {{id}}\nTitle: {{title}}\nDescription: {{description}}"
});

// 3. Log the formatted results
pipeline.tool('debug', {
    message: "--- SPORTS NEWS ---",
    data: formattedList.data
});

// 4. Return the ids of the retrieved resources
pipeline.tool('format_list', {
    items: queryResult.items,
    template: "{{id}}",
    separator: ", "
});

export default pipeline;
