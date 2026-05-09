import { AIQ } from '../src/services/AIQ.js';

AIQ.init();

AIQ.chain("upsert_resource", { uri: "https://example.com" });

