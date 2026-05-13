import { Curator } from '../src/services/Curator.js';

Curator.init();

const flow = Curator.chain("query_resources", {
    relation: {
        objectUri: "err:ilm"
    },
    limit: 10
}).onItem().chain((item) => {
    return Curator.chain().debug({
        message: "Resource #{{item.id}} has type {{item.resourceType.name}}",
        data: {
            actual_db_id: "{{item.id}}",
            actual_db_uri: "{{item.uri}}"
        }
    });
});


export default flow;
