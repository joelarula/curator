import { AIQ } from '../src/services/AIQ.js';

AIQ.init();

AIQ.chain("upsert_resource", { 
    uri: "test:lookup-resource", 
    title: "Lookup Test",
    status: "DRAFT",
    type: "ARTICLE",
    language: "ET",
    notation: "TEST-123"
});
