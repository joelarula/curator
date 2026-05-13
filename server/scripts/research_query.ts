import { Pipeline } from '../src/services/ast/builder.js';
import { TOOLS } from '../src/services/tools/manifest.js';

// Usage:
//   npx tsx src/bin/curator.ts scripts/research_query.ts "abstract syntax tree" 5
const query = process.argv[3];
const limit = parseInt(process.argv[4] ?? '5', 10);

if (!query) {
    console.error('❌ Please provide a search query.');
    console.error('Usage: npx tsx src/bin/curator.ts scripts/research_query.ts "<query>" [limit]');
    process.exit(1);
}

console.log(`🔍 Researching: "${query}" (top ${limit} results)`);

const excludeLinkPatterns = [
    'facebook.com', 'twitter.com', 'x.com', 'mailto:', 'javascript:',
];

const pipeline = new Pipeline();

// Step 1: Search Google for the query
const search = pipeline.tool(TOOLS.WEB_SEARCH, { query, limit });

// Step 2: Upsert a Resource representing the search query itself
pipeline.tool(TOOLS.UPSERT_RESOURCE, {
    uri: `search:google:${encodeURIComponent(query)}`,
    title: `Search: ${query}`,
});

// Step 3: For each result — scrape, summarise, save
pipeline.forEach(search.data.items, (result, flow) => {

    // 3a. Upsert the Resource for this page
    flow.tool(TOOLS.UPSERT_RESOURCE, {
        uri: result.url,
        title: result.title,
        description: result.snippet,
    });

    // 3b. Scrape the page content — skip auto-save, clean first
    const scraped = flow.tool(TOOLS.SCRAPE_RESOURCE, {
        url: result.url,
        resourceUri: result.url,
        excludeLinkPatterns,
        saveText: false,
    });

    // 3c. Save the raw Markdown copy
    flow.tool(TOOLS.UPSERT_TEXT, {
        resourceUri: result.url,
        role: 'COPY',
        content: scraped.content,
        mimeType: 'text/markdown',
        extension: 'md',
    });

    // 3d. Ask the LLM for a concise summary
    const summary = flow.tool(TOOLS.ASK_LLM, {
        prompt:
`Summarize the following article in 4–6 clear sentences. Focus on key facts and conclusions.

TITLE: ${result.title}
SNIPPET: ${result.snippet}

ARTICLE:
${scraped.content}`,
    });

    // 3e. Save the AI summary
    flow.tool(TOOLS.UPSERT_TEXT, {
        resourceUri: result.url,
        role: 'SUMMARY',
        content: summary.text,
        mimeType: 'text/markdown',
        extension: 'md',
    });

    // 3f. Link result back to the search query resource
    flow.tool(TOOLS.UPSERT_RELATION, {
        subjectUri: `search:google:${encodeURIComponent(query)}`,
        predicateUri: 'prop:hasResult',
        objectUri: result.url,
    });
});

pipeline.tool(TOOLS.DEBUG, {
    message: `✅ Research complete: "${query}" — ${limit} results scraped and summarised.`
});

export default pipeline;
