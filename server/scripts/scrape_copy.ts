import { Pipeline } from '../src/services/ast/builder.js';
import { TOOLS } from '../src/services/tools/manifest.js';

// argv[3] = URL, argv[4] = optional CSS selector
// Usage:
//   npx tsx src/bin/Curator.ts scripts/scrape_copy.ts "https://example.com"
//   npx tsx src/bin/Curator.ts scripts/scrape_copy.ts "https://example.com" "#main > .article-body"
const targetUrl = process.argv[3];

// ── CSS selector ─────────────────────────────────────────────────────────────
const contentSelector = 'article.prime';

// ── Exclude links matching these URL substrings ───────────────────────────────
const excludeLinkPatterns = [
    'facebook.com',
    'twitter.com',
    'x.com',
    'mailto:',
];


if (!targetUrl) {
    console.error("❌ Please provide a URL to scrape.");
    console.error("Usage: npx tsx src/bin/Curator.ts scripts/scrape_copy.ts <URL> [CSS_SELECTOR]");
    process.exit(1);
}

if (contentSelector) {
    console.log(`🎯 Using contentSelector: "${contentSelector}"`);
}

const pipeline = new Pipeline();

const scrapedData = pipeline.tool(TOOLS.SCRAPE_RESOURCE, {
    url: targetUrl,
    resourceUri: targetUrl,
    role: 'COPY',
    contentSelector,
    excludeLinkPatterns
});

pipeline.tool(TOOLS.DEBUG, {
    message: `✅ Scraped and saved COPY text for: ${targetUrl}`
});

export default pipeline;

