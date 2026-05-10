import { AIQ } from '../src/services/AIQ.js';

AIQ.init();

const flow = AIQ.chain("query_resources", {
    relation: {
        objectUri: "Majandus"
    },
    limit: 10
}).onItem().chain((item) => {
    return AIQ.chain().debug({
        message: "Resource #{{item.id}} has type {{item.resourceType.name}}",
        data: {
            actual_db_id: "{{item.id}}",
            actual_db_uri: "{{item.uri}}"
        }
    });
});


export default flow;
