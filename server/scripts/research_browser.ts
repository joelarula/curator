import { Pipeline } from '../src/services/ast/builder.js';
import { TOOLS } from '../src/services/tools/manifest.js';

// Usage:
//   npx tsx src/bin/curator.ts scripts/research_browser.ts "abstract syntax tree"
const query = process.argv[3];
const limit = parseInt(process.argv[4] ?? '3', 10);

if (!query) {
    console.error('❌ Please provide a search query.');
    process.exit(1);
}

const pipeline = new Pipeline();

// Step 1: Use the browser to search DuckDuckGo
// This bypasses API keys and "Search the entire web" restrictions.
const searchPage = pipeline.tool(TOOLS.BROWSER_ACTION, {
    id: 'searchPage',
    commands: [
        { type: 'navigate', url: 'https://duckduckgo.com/?q=' + encodeURIComponent(query) },
        // Simple wait for the page to finish rendering
        { type: 'wait', timeout: 5000 },
        // Get the page content (HTML)
        { type: 'content' }
    ]
});

// Step 2: Extract result links from the search page
const results = pipeline.tool(TOOLS.EXTRACT_RESOURCE_LINKS, {
    id: 'results',
    resourceUri: searchPage.url,
    html: searchPage.html,
    selector: 'a[data-testid="result-title-a"]' // Specific DuckDuckGo result links
});

// Step 3: Iterate through top N results
// Note: We filter out DDG/Google internal links in the loop
const itemFlow = pipeline.forEach(results.extractedItems, (item, flow) => {
    
    // Simple filter: skip non-http links or ddg/google internal links
    const isGoodLink = flow.tool(TOOLS.EVALUATE_CONDITION, {
        data: { url: item.uri },
        evalFn: (data: any) => {
            return data.url.startsWith('http') && 
                  !data.url.includes('duckduckgo.com') && 
                  !data.url.includes('google.com');
        }
    });

    flow.if(isGoodLink.result, (sub) => {
        // 3a. Create the resource
        sub.tool(TOOLS.UPSERT_RESOURCE, {
            uri: item.uri,
            title: item.title,
        });

        // 3b. Use the browser to visit each result (bypass bot detection)
        const page = sub.tool(TOOLS.BROWSER_ACTION, {
            id: 'page',
            commands: [
                { type: 'navigate', url: item.uri },
                { type: 'wait', timeout: 3000 }, // Brief wait for dynamic content
                { type: 'content' }
            ]
        });

        // 3c. Clean with Scraper
        const scraped = sub.tool(TOOLS.SCRAPE_RESOURCE, {
            id: 'scraped',
            url: item.uri,
            html: page.html,
            saveText: false
        });

        // 3d. Save final Markdown
        sub.tool(TOOLS.UPSERT_TEXT, {
            resourceUri: item.uri,
            content: scraped.content,
            role: 'COPY',
            mimeType: 'text/markdown',
            extension: 'md'
        });

        // 3e. Link to search query
        sub.tool(TOOLS.UPSERT_RELATION, {
            subjectUri: `search:browser:ddg:${encodeURIComponent(query)}`,
            predicateUri: 'prop:hasResult',
            objectUri: item.uri
        });
    });
});

pipeline.tool(TOOLS.DEBUG, {
    message: `✅ Browser research complete: "${query}"`
});

export default pipeline;
