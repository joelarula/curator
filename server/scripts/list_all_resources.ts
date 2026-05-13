import { Curator } from '../src/services/Curator.js';

Curator.init();

// Script to list ALL resources to see what's in the DB
const flow = Curator.spawn("query_resources", {
    limit: 50
}).onItem().chain((item) => {
    return Curator.chain().debug({
        message: "DB Resource: [{{item.id}}] {{item.uri}}",
        data: {
            title: "{{item.title}}",
            type: "{{item.resourceType.name}}"
        }
    });
});


export default flow;
