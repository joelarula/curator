import { AIQ } from '../src/services/AIQ.js';

AIQ.init();

// This should execute locally (no DB records)
console.log("Starting local chain...");
AIQ.chain("upsert_resource", { uri: "https://google.com" });

// This should create a Request record and process it
console.log("Starting detached spawn...");
AIQ.spawn("upsert_resource", { uri: "https://bing.com" });
