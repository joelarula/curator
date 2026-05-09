import { AIQ } from '../src/services/AIQ.js';

// Mocking tool registration for the test script environment
AIQ.register('process_feed');
AIQ.register('ask_llm');
AIQ.register('upsert_resource');

console.log("--- AIQ Simple Chain ---");
const simple = AIQ.chain("upsert_resource", { uri: "https://example.com" })
    .then("fetch_html", { url: "{{resource.uri}}" })
    .spawn("ask_llm", { prompt: "Summarize." })
    .toJSON();

console.log(JSON.stringify(simple, null, 2));

console.log("\n--- AIQ processFeed Granular Flow ---");
const feedChain = AIQ.feed('https://news.ycombinator.com/rss')
    .onItem().spawn(item => AIQ.spawn('ask_llm', { 
        prompt: `Extract tags for: ${item.title}`,
        itemUri: item.uri 
    }))
    .onDone().chain(AIQ.chain('ask_llm', { 
        prompt: 'The feed processing for {{resource.title}} is complete.' 
    }))
    .toJSON();

console.log(JSON.stringify(feedChain, null, 2));

console.log("\n--- AIQ Callback Flow (chain) ---");
const withCallbacks = AIQ.chain("ask_llm", { prompt: "Extract items from text" })
    .onItem().chain(item => AIQ.chain("upsert_resource", { uri: item.uri, title: item.title }))
    .toJSON();

console.log(JSON.stringify(withCallbacks, null, 2));
