import { Curator } from '../src/services/Curator.js';

Curator.init();

Curator.chain("upsert_resource", { uri: "https://example.com" });

