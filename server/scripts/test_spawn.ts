import { Curator } from '../src/services/Curator.js';

Curator.init();

Curator.spawn("upsert_resource", { uri: "https://example.com" });