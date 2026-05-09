import { AIQ } from '../src/services/AIQ.js';

AIQ.init();

const simple = AIQ.chain("upsert_resource", {
    uri: "https://example.com",
    title: "Example",
    description: "Example description",
    type: "ARTICLE",
    status: "ACTIVE",
    language: "en",
    isPublished: true
});
