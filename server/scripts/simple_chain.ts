import { Curator } from '../src/services/Curator.js';

Curator.init();

const simple = Curator.spawn("upsert_resource", {
    uri: "https://example2.com",
    title: "Example",
    description: "Example description",
    type: "ARTICLE",
    status: "ACTIVE",
    language: "en",
    isPublished: true
});
