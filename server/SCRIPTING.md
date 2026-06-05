# Curator Scripting Guide

Scripts let you compose agentic tool call pipelines in JavaScript and submit them as Requests.
The runtime is a sandboxed `vm` context — no file system, no network, no `require`.

---

## How it works

1. Your script runs inside a function body.
2. It must **return a `ToolChain` instance** (or write a single expression that evaluates to one).
3. The runner calls `.toJSON()` on it and stores the resulting `toolCalls[]` array on the Request.
4. `RequestProcessor` executes the tool calls sequentially (or in parallel for `.spawn()` calls).

---

## Available globals

| Global | Description |
|--------|-------------|
| `ToolChain` | The full `ToolChain` class with all registered tool plugins |
| `start()` | Alias for `ToolChain.start()` — begin an empty chain |
| `run(name, args)` | Alias for `ToolChain.run(name, args)` — begin a chain with the first call |
| `args` | Runtime arguments passed by the caller (`{}` by default) |
| `tools` | Array of registered tool definitions `{ name, description, version }` |
| `console.log/warn/error` | Forwarded to the server log prefixed with `[Script]` |

---

## Script styles

### Single expression (no `return` needed)

```js
ToolChain.start().upsert_resource({ uri: "https://example.com", title: "My Page" })
```

```js
run("upsert_resource", { uri: args.url }).then("fetch_html", { url: args.url })
```

### Multi-line with `return`

```js
const url = "https://example.com";
return ToolChain.start()
  .upsert_resource({ uri: url, title: "My Page" })
  .fetch_html({ url: url });
```

### Using `args` for parameterised scripts

```js
const url = args.url;
return ToolChain.start()
  .process_feed({ url })
  .forEachItem(
    start().scrape_resource({ uri: ref("item", "uri") })
  );
```

---

## Method chaining

Every registered tool is a plugin on `ToolChain`. Calling one adds a sequential (inline) step:

```js
ToolChain.start()
  .fetch_html({ url: "https://example.com" })
  .scrape_resource({ uri: "{{fetch_html.uri}}" })
  .ask_llm({ prompt: "Summarise: {{scrape_resource.content}}" })
  .upsert_text({ resourceUri: "{{scrape_resource.uri}}", content: "{{ask_llm.text}}" })
```

Use `.spawn()` for parallel (fire-and-forget) steps:

```js
ToolChain.start()
  .process_feed({ url: args.feedUrl })
  .spawn("ask_llm", { prompt: "Daily digest ready." })
```

---

## llama.cpp API tools

Curator now includes first-class tools for llama.cpp server endpoints (matching
the upstream server API surface).

Base URL and auth:

- Default base URL: `CURATOR_LLM_URL` (fallback `LLAMA_CPP_BASE_URL`, then `http://127.0.0.1:8080`)
- Optional API key: `LLAMA_API_KEY` (or pass `apiKey` in tool args)

Primary tools:

- `llama_health`
- `llama_models`
- `llama_chat_completion`
- `llama_completion`
- `llama_tokenize`
- `llama_detokenize`
- `llama_apply_template`
- `llama_embedding`
- `llama_v1_embeddings`
- `llama_rerank`
- `llama_props_get`
- `llama_props_set`
- `llama_slots`
- `llama_slot_action`
- `llama_metrics`
- `llama_lora_list`
- `llama_lora_set`
- `llama_responses`
- `llama_messages`
- `llama_messages_count_tokens`

For endpoints not explicitly wrapped, use:

- `llama_request` (generic GET/POST path caller)

Example: health + OpenAI chat completion

```js
return ToolChain.start()
  .llama_health({})
  .llama_chat_completion({
    model: "local-gemma-3-1b-it",
    messages: [
      { role: "system", content: "You are concise." },
      { role: "user", content: "Summarize the article in 3 bullets." }
    ],
    temperature: 0.3,
    max_tokens: 200
  });
```

Example: generic call for unsupported endpoint

```js
return ToolChain.start().llama_request({
  method: "POST",
  path: "/infill",
  body: {
    input_prefix: "function add(a, b) {",
    input_suffix: "}",
    n_predict: 128
  }
});
```

---

## Runtime template references (`{{tool.field}}`)

Previous tool results are available via `{{toolName.field}}` placeholders, resolved at execution time by `RequestProcessor`. Build them with the `ref()` helper (import not needed inside scripts — use the string directly, or call `ref` if exposed):

```js
// String template — always works
"{{upsert_resource.uri}}"

// ref() helper — available in server-side TS code, not inside scripts
import { ref } from './services/ToolChain.js';
ref("upsert_resource", "uri") // → "{{upsert_resource.uri}}"
```

Inside `forEachItem` child chains, the current item is `{{item}}` or `{{item.field}}`.

---

## GraphQL mutations

### `submitScript` — queue and return immediately

```graphql
mutation {
  submitScript(
    name: "my_pipeline",        # optional — if given, script is persisted/upserted
    body: """
      const url = args.url;
      return ToolChain.start()
        .upsert_resource({ uri: url })
        .fetch_html({ url: url });
    """
  ) {
    id
    status
    toolCalls
  }
}
```

### `executeScript` — queue and poll until complete

```graphql
mutation {
  executeScript(
    body: """
      return ToolChain.start().upsert_resource({ uri: "https://example.com" });
    """,
    timeoutMs: 15000
  ) {
    request { id status }
    responses { id data }
    timedOut
  }
}
```

### Modes

| Inputs | Behaviour |
|--------|-----------|
| `name` + `body` | Script compiled → `toolCalls` on Request; script persisted by name for reuse |
| `body` only | Script compiled → `toolCalls` on Request; nothing written to Script table |
| `toolCalls` only | JSON array passed directly to Request; no compilation |
| `name` only | Existing named script's saved `toolCalls` used (no recompilation) |

---

## Rules & constraints

- Scripts run with a **5 second timeout**.
- No `require`, `import`, `fetch`, or file system access.
- The script **must return a `ToolChain` instance** — calling `.toJSON()` yourself before returning throws an error.
- For multi-statement scripts, use an explicit `return` on the last line.
- For single-expression scripts, omit `return` entirely.
