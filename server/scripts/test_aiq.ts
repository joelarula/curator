import { Curator } from '../src/services/Curator.js';

// One-stop registration for all known tools
Curator.init();

console.log("--- Curator Simple Chain ---");
const simple = Curator.chain("upsert_resource", { uri: "https://example.com" })
    .then("fetch_html", { url: "{{resource.uri}}" })
    .spawn("ask_llm", { prompt: "Summarize." })
    .toJSON();

console.log(JSON.stringify(simple, null, 2));

console.log("\n--- Curator processFeed Granular Flow ---");
const feedChain = Curator.feed('https://news.ycombinator.com/rss')
    .onItem().spawn((item: any) => Curator.spawn('ask_llm', { 
        prompt: `Extract tags for: ${item.title}`,
        itemUri: item.uri 
    }))
    .onDone().chain(Curator.chain('ask_llm', { 
        prompt: 'The feed processing for {{resource.title}} is complete.' 
    }))
    .toJSON();

console.log(JSON.stringify(feedChain, null, 2));

console.log("\n--- Curator Callback Flow (chain) ---");
const withCallbacks = Curator.chain("ask_llm", { prompt: "Extract items from text" })
    .onItem().chain(item => Curator.chain("upsert_resource", { uri: item.uri, title: item.title }))
    .toJSON();

console.log(JSON.stringify(withCallbacks, null, 2));
