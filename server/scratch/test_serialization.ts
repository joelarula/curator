
import { AIQ } from '../src/services/AIQ.js';

const chain = AIQ.spawn("process_feed", { url: "http://example.com" })
    .onItem().spawn((item, context) => {
        return AIQ.chain("upsert_relation", {
            subjectUri: context.feed.uri,
            predicateUri: "https://schema.org/provider",
            objectUri: item.link
        });
    });

console.log(JSON.stringify(chain.toJSON(), null, 2));
