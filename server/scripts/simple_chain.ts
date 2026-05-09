import { AIQ } from '../src/services/AIQ.js';

AIQ.init();

const simple = AIQ.spawn("upsert_resource", {
    uri: "https://example2.com",
    title: "Example",
    description: "Example description",
    type: "ARTICLE",
    status: "ACTIVE",
    language: "en",
    isPublished: true
});
