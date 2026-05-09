import { AIQ } from '../src/services/AIQ.js';

AIQ.init();

AIQ.spawn("upsert_resource", { uri: "https://example.com" });