import { AIQ } from '../src/services/AIQ.js';

AIQ.init();

// Script to list ALL resources to see what's in the DB
const flow = AIQ.spawn("query_resources", {
    limit: 50
}).onItem().chain((item) => {
    return AIQ.chain().debug({
        message: "DB Resource: [{{item.id}}] {{item.uri}}",
        data: {
            title: "{{item.title}}",
            type: "{{item.resourceType.name}}"
        }
    });
});


export default flow;
