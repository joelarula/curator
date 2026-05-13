import { Curator } from '../src/services/Curator.js';

Curator.init();

// This should execute locally (no DB records)
console.log("Starting local chain...");
Curator.chain("upsert_resource", { uri: "https://google.com" });

// This should create a Request record and process it
console.log("Starting detached spawn...");
Curator.spawn("upsert_resource", { uri: "https://bing.com" });
