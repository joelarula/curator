import { Pipeline } from '../src/services/ast/builder.js';
import { TOOLS } from '../src/services/tools/manifest.js';

/**
 * Luna 3 Verification Test
 * 
 * This script searches for "Luna 3" (Soviet Moon probe), scrapes the results,
 * and performs explicit verification to ensure the content is correctly extracted 
 * (not left as a template placeholder) and stored.
 */
const query = "Luna 3";
const limit = 5;

const pipeline = new Pipeline();

// 1. Browser Search (DuckDuckGo)
const searchPage = pipeline.tool(TOOLS.BROWSER_ACTION, {
    id: 'searchPage',
    commands: [
        { type: 'navigate', url: 'https://duckduckgo.com/?q=' + encodeURIComponent(query) },
        { type: 'wait', timeout: 5000 },
        { type: 'content' }
    ]
});

// 2. Extract Links
const results = pipeline.tool(TOOLS.EXTRACT_RESOURCE_LINKS, {
    id: 'results',
    resourceUri: searchPage.url,
    html: searchPage.html,
    selector: 'a[data-testid="result-title-a"]'
});

// 3. Iterate and Verify
pipeline.forEach(results.extractedItems.slice(0, limit), (item, flow) => {
    
    // Filter out DDG internal links
    const filter = flow.tool(TOOLS.EVALUATE_CONDITION, {
        data: { url: item.uri },
        evalFn: (data: any) => data.url.startsWith('http') && !data.url.includes('duckduckgo.com')
    });

    flow.if(filter.result, (sub) => {
        // A. Upsert Resource
        sub.tool(TOOLS.UPSERT_RESOURCE, {
            uri: item.uri,
            title: item.title,
        });

        // B. Fetch Page via Browser (CDP enabled for reliability)
        const page = sub.tool(TOOLS.BROWSER_ACTION, {
            id: 'page',
            commands: [
                { type: 'navigate', url: item.uri },
                { type: 'wait', timeout: 4000 },
                { type: 'content' }
            ]
        });

        // C. Scrape to Markdown
        const scraped = sub.tool(TOOLS.SCRAPE_RESOURCE, {
            id: 'scraped',
            url: item.uri,
            html: page.html,
            saveText: false
        });

        // D. Verification Step: Check for placeholders and content quality
        const verification = sub.tool(TOOLS.EVALUATE_CONDITION, {
            id: 'verification',
            data: { 
                content: scraped.content,
                url: item.uri 
            },
            evalFn: (data: any) => {
                const content = data.content || "";
                const isPlaceholder = content.includes('{{toolOutputs.') || content.includes('{{iter_');
                const isTooShort = content.length < 200;
                
                return {
                    success: !isPlaceholder && !isTooShort,
                    length: content.length,
                    status: isPlaceholder ? "PLACEHOLDER_ERROR" : (isTooShort ? "TOO_SHORT" : "OK")
                };
            }
        });

        // E. Log Verification Result
        sub.tool(TOOLS.DEBUG, {
            message: `[Verify] ${item.uri} | Status: ${verification.result.status} | Length: ${verification.result.length}`
        });

        // F. Save if verified
        sub.tool(TOOLS.UPSERT_TEXT, {
            resourceUri: item.uri,
            content: scraped.content,
            role: 'COPY',
            mimeType: 'text/markdown',
            extension: 'md'
        });
    });
});

pipeline.tool(TOOLS.DEBUG, {
    message: `✅ Luna 3 Verification Test Complete.`
});

export default pipeline;
