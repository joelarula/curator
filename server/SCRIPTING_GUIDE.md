# Curator Scripting Guide

> **Agent instructions for writing Curator pipeline scripts.**
> Scripts live in `server/scripts/` and are executed via `npx tsx src/bin/curator.ts scripts/<name>.ts`.

---

## Core Concepts

The **Curator Pipeline DSL** is a declarative, type-safe scripting system built on a Formal Abstract Syntax Tree (AST). Each script defines a `Pipeline` — a sequence of tool calls that the `RequestProcessor` executes in order.

Pipelines are **pure data** until executed. Tools are referenced by name from the `TOOLS` enum; arguments may contain **template placeholders** (`{{toolName.field}}`) that resolve to upstream outputs at runtime.

---

## Basic Structure

```typescript
import { Pipeline } from '../src/services/ast/builder.js';
import { TOOLS } from '../src/services/tools/manifest.js';
import { VOCAB } from '../src/constants/vocabulary.js';

const pipeline = new Pipeline();

pipeline.tool(TOOLS.UPSERT_RESOURCE, { uri: 'example:foo', title: 'Foo' });

export default pipeline;
```

**Always `export default pipeline`** — the executor imports this as the entry point.

### CLI arguments

```typescript
const url  = process.argv[3]; // First argument after the script path
const sel  = process.argv[4]; // Second argument, etc.
```

---

## Available Tools (`TOOLS` enum)

| Constant | Tool name | Description |
|---|---|---|
| `TOOLS.UPSERT_RESOURCE` | `upsert_resource` | Create or update a Resource record |
| `TOOLS.UPSERT_TEXT` | `upsert_text` | Create or update a Text record on a Resource |
| `TOOLS.UPSERT_RELATION` | `upsert_relation` | Create a subject → predicate → object triple |
| `TOOLS.DELETE_RESOURCE` | `delete_resource` | Soft-delete a Resource |
| `TOOLS.GET_RESOURCE` | `get_resource` | Fetch a Resource by URI or ID |
| `TOOLS.QUERY_RESOURCES` | `query_resources` | Search/filter Resources |
| `TOOLS.SCRAPE_RESOURCE` | `scrape_resource` | Fetch a URL and extract Markdown content |
| `TOOLS.PROCESS_FEED` | `process_feed` | Parse an RSS/Atom feed and iterate items |
| `TOOLS.FETCH_HTML` | `fetch_html` | Fetch raw HTML and cache as a Text record |
| `TOOLS.EXTRACT_RESOURCE_LINKS` | `extract_resource_links` | Extract all links from a page |
| `TOOLS.EVALUATE_CONDITION` | `evaluate_condition` | Evaluate a JS closure or expression (returns boolean) |
| `TOOLS.REGEX_REPLACE` | `regex_replace` | Apply regex substitutions to a text string |
| `TOOLS.WEB_SEARCH` | `web_search` | Search Google/Bing for results |
| `TOOLS.BROWSER_ACTION` | `browser_action` | Execute browser commands (click, type, etc.) |
| `TOOLS.ASK_LLM` | `ask_llm` | Send a prompt to Gemini |
| `TOOLS.CLASSIFY` | `classify` | Classify text into categories |
| `TOOLS.CLASSIFY_ET` | `classify_et` | Estonian-language classifier |
| `TOOLS.CLASSIFY_UDC` | `classify_udc` | UDC (Universal Decimal Classification) classifier |
| `TOOLS.ITERATE` | `iterate` | Fan-out: run a sub-pipeline for each item in an array |
| `TOOLS.DEBUG` | `debug` | Log a message to the console |
| `TOOLS.EXECUTE_SCRIPT` | `execute_script` | Execute another stored Curator script |

---

## Tool Reference

### `TOOLS.SCRAPE_RESOURCE`

Fetches a URL, converts HTML → Markdown (YAML front matter + links + GFM tables), upserts the Resource, and optionally saves the Text.

```typescript
pipeline.tool(TOOLS.SCRAPE_RESOURCE, {
    url: 'https://example.com/article',
    resourceUri: 'https://example.com/article',  // defaults to url
    role: 'COPY',                 // Text role (default 'MAIN')
    contentSelector: '#content',  // CSS selector to scope extraction
    excludeLinkPatterns: [        // URL substrings — matching links are stripped
        'facebook.com',
        'twitter.com',
        'mailto:',
    ],
    saveText: false,              // false = return content, skip DB write
});
```

**Raw content fast-path** — `raw.githubusercontent.com`, `gist.githubusercontent.com`, `raw.gitlab.com`, `pastebin.com/raw` are auto-detected and fetched as plain text without HTML processing.

**When `saveText: false`** returns: `{ resourceId, resourceUri, title, content, contentLength }`

---

### `TOOLS.UPSERT_TEXT`

```typescript
pipeline.tool(TOOLS.UPSERT_TEXT, {
    resourceUri: 'https://example.com/article',
    role: 'COPY',
    content: cleaned.text,
    mimeType: 'text/markdown',
    extension: 'md',
});
```

---

### `TOOLS.BROWSER_ACTION`

Performs a sequence of browser commands using Playwright. Useful for login flows, interacting with SPAs, or searching sites that block simple fetches.

```typescript
const browser = pipeline.tool(TOOLS.BROWSER_ACTION, {
    sessionId: 'optional-session-id', // Reuses cookies/storage if provided
    commands: [
        { type: 'navigate', url: 'https://example.com/login' },
        { type: 'type', selector: '#user', text: 'admin' },
        { type: 'type', selector: '#pass', text: '12345' },
        { type: 'click', selector: '#submit' },
        { type: 'wait', selector: '.dashboard' },
        { type: 'extract' } // Converts current page HTML to Markdown
    ]
});

// browser.url, browser.html, browser.markdown contain the final state
```

---

### `TOOLS.REGEX_REPLACE`

Applies an ordered array of regex substitutions sequentially.

```typescript
const cleaned = pipeline.tool(TOOLS.REGEX_REPLACE, {
    text: scraped.content,
    patterns: [
        { pattern: '\\n{3,}', flags: 'g', replacement: '\n\n' },
        { pattern: '\\\\(?=\\[|\\])', flags: 'g', replacement: '' },
    ]
});
// cleaned.text is the result
```

---

### `TOOLS.EVALUATE_CONDITION`

Prefer the `evalFn` closure syntax — it has full IDE type support:

```typescript
const ok = pipeline.tool(TOOLS.EVALUATE_CONDITION, {
    data: { categories: item.categories },
    evalFn: (data: { categories: string[] }) => {
        const blocked = ['Sport', 'ilm', 'Viipekeelsed'];
        return !data.categories?.some(c => blocked.includes(c));
    }
});
// ok.result === true | false
```

> The closure is serialized at AST build time and executed in an isolated `new Function()` sandbox at runtime. It has access only to `data`.

---

### `TOOLS.UPSERT_RELATION`

```typescript
pipeline.tool(TOOLS.UPSERT_RELATION, {
    subjectUri: 'https://example.com/article',
    predicateUri: VOCAB.PROP.about,
    objectUri: 'topic:computer-science/ast',
});
```

---

## Granular Import Pattern

Decompose `scrape_resource` for full per-step control:

```typescript
// 1. Create Resource
pipeline.tool(TOOLS.UPSERT_RESOURCE, { uri: url, title: 'My Article' });

// 2. Fetch Markdown — do NOT save yet
const scraped = pipeline.tool(TOOLS.SCRAPE_RESOURCE, {
    url,
    resourceUri: url,
    contentSelector: 'article.prime',
    excludeLinkPatterns: ['facebook.com', 'twitter.com', 'mailto:'],
    saveText: false,
});

// 3. Clean
const cleaned = pipeline.tool(TOOLS.REGEX_REPLACE, {
    text: scraped.content,
    patterns: [{ pattern: '\\n{3,}', flags: 'g', replacement: '\n\n' }]
});

// 4. Save
pipeline.tool(TOOLS.UPSERT_TEXT, {
    resourceUri: url,
    role: 'COPY',
    content: cleaned.text,
    mimeType: 'text/markdown',
    extension: 'md',
});

// 5. Tag
pipeline.tool(TOOLS.UPSERT_RELATION, {
    subjectUri: url,
    predicateUri: VOCAB.PROP.about,
    objectUri: 'topic:my-topic',
});
```

---

## Feed Pipeline Pattern

Category filtering must happen inside `itemFlow`, not at the `process_feed` stage (not all feeds have categories):

```typescript
const feed = pipeline.tool(TOOLS.PROCESS_FEED, { uri: feedUrl });

const itemFlow = pipeline.forEach(feed.items, (item) => {
    const ok = itemFlow.tool(TOOLS.EVALUATE_CONDITION, {
        data: { categories: item.categories },
        evalFn: (data: any) => {
            const blocked = ['Sport', 'ilm', 'Viipekeelsed', 'ETV uudised'];
            return !data.categories?.some((c: string) => blocked.includes(c));
        }
    });

    itemFlow.if(ok.result).tool(TOOLS.UPSERT_RESOURCE, {
        uri: item.link,
        title: item.title,
    });
});
```

---

## CSS Selector Tips

Get selectors from DevTools: right-click element → **Copy → Copy selector**

| Site | Recommended selector |
|---|---|
| Wikipedia | `#content` |
| ERR.ee | `article.prime` |
| Generic | `article`, `main`, `.article-body` |
| Angular apps | `[ng-controller="myController"]` |
| Raw GitHub | *(auto-detected, no selector needed)* |

---

## Naming Conventions (AIQ → Curator)

| Old (deprecated) | New |
|---|---|
| `AIQ` | `Curator` |
| `AIQBuilder` | `CuratorBuilder` |
| `AIQPlugins` | `CuratorPlugins` |
| `AIQFlow` | `CuratorFlow` |
| `npm run aiq` | `npm run curator` |
| `src/bin/aiq.ts` | `src/bin/curator.ts` |
| `src/services/AIQ.ts` | `src/services/Curator.ts` |

---

## Running Scripts

```bash
# Basic
npx tsx src/bin/curator.ts scripts/my_script.ts

# With arguments
npx tsx src/bin/curator.ts scripts/scrape_copy.ts "https://example.com"
npx tsx src/bin/curator.ts scripts/scrape_copy.ts "https://example.com" "#content"
npx tsx src/bin/curator.ts scripts/scrape_wikipedia.ts "https://en.wikipedia.org/wiki/Prolog"
```

---

## Text MIME Types

| Content | `mimeType` | `extension` |
|---|---|---|
| Markdown (default) | `text/markdown` | `md` |
| Plain text | `text/plain` | `txt` |
| HTML | `text/html` | `html` |
| JSON | `application/json` | `json` |
