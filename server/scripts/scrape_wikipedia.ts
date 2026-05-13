import { Pipeline } from '../src/services/ast/builder.js';
import { TOOLS } from '../src/services/tools/manifest.js';
import { VOCAB } from '../src/constants/vocabulary.js';

const targetUrl = process.argv[3] || 'https://en.wikipedia.org/wiki/Abstract_syntax_tree';

// ── CSS selector ──────────────────────────────────────────────────────────────
const contentSelector = '#content';

// ── Exclude noisy Wikipedia link patterns ─────────────────────────────────────
const excludeLinkPatterns = [
    'facebook.com', 'twitter.com', 'x.com', 'mailto:',
    '/wiki/Special:', '/wiki/Help:', '/wiki/Wikipedia:',
    '/wiki/Talk:', '/wiki/File:', '/wiki/Template:', '/wiki/Category:',
    '#cite_',
];

// ── Regex cleanup patterns ────────────────────────────────────────────────────
const cleanupPatterns = [
    // Remove Wikipedia [edit] section links: \[[edit](...)\]
    { pattern: '\\\\\\[\\[edit\\]\\(https?://[^)]+\\)\\]', flags: 'g', replacement: '' },
    // Remove \[1\] \[2\] footnote markers
    { pattern: '\\\\\\[\\d+\\\\\\]', flags: 'g', replacement: '' },
    // Remove lone backslashes before brackets left by turndown
    { pattern: '\\\\(?=\\[|\\])', flags: 'g', replacement: '' },
    // Collapse 3+ blank lines to 2
    { pattern: '\\n{3,}', flags: 'g', replacement: '\n\n' },
];

const pipeline = new Pipeline();

// Step 1: Upsert the Resource record
pipeline.tool(TOOLS.UPSERT_RESOURCE, {
    uri: targetUrl,
    title: 'Abstract syntax tree',
    type: VOCAB.TYPE.article,
    language: VOCAB.LANGUAGES.english,
});

// Step 2: Fetch and extract Markdown — but do NOT save text yet
const scraped = pipeline.tool<{ content: string; resourceUri: string }>(TOOLS.SCRAPE_RESOURCE, {
    url: targetUrl,
    resourceUri: targetUrl,
    contentSelector,
    excludeLinkPatterns,
    saveText: false,   // ← skip saving, we'll clean it first
});

// Step 3: Apply regex cleanup to the extracted Markdown
const cleaned = pipeline.tool<{ text: string }>(TOOLS.REGEX_REPLACE, {
    text: scraped.content,
    patterns: cleanupPatterns
});

// Step 4: Save the cleaned text with role COPY
pipeline.tool(TOOLS.UPSERT_TEXT, {
    resourceUri: targetUrl,
    role: 'COPY',
    content: cleaned.text,
    mimeType: 'text/markdown',
    extension: 'md'
});

// Step 5: Add a subject relation tagging this as a Computer Science topic
pipeline.tool(TOOLS.UPSERT_RELATION, {
    subjectUri: targetUrl,
    predicateUri: VOCAB.PROP.about,
    objectUri: 'topic:computer-science/abstract-syntax-tree'
});

pipeline.tool(TOOLS.DEBUG, {
    message: `✅ Imported and cleaned Wikipedia article: ${targetUrl}`
});

export default pipeline;
