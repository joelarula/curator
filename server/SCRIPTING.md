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
- The script **must return a `ToolChain` instance** (or an AST node when using CoffeeScript verbs).
- For multi-statement scripts, use an explicit `return` on the last line.
- For single-expression scripts, omit `return` entirely.

---

## CoffeeScript Natural Verbs & AST Execution Guarantees

Curator supports writing clean, human-readable pipelines using the CoffeeScript Natural Verbs DSL (`tool`, `prompt`, `seq`, `set_state`, `while_loop`, `for_each`, `emit_event`, `wait_event`).

### Example: Stateful Ping-Pong & Event Workflow

```coffeescript
# Curator Core automatically maintains context, turn state, and database response logs
while_loop "$context.turn <= 5",
  seq [
    wait_event "game:ping"
    set_state turn: "$context.turn + 1", score: "$context.turn * 10"
    emit_event "game:pong", turn: "$context.turn", sender: "alpha"
  ]
```

### Guarantees Enforced by `CuratorRequestProcessor`
1. **Context Persistence**: `$context.turn` and state are committed to the database `Request.context` after each step.
2. **Response Generation**: a `Response` record is created per step automatically in SQLite / PostgreSQL. There is no separate audit table — the audit view (`auditLogs`) is derived from Responses.
3. **Session & Security Validation**: Peer sessions, user roles, and token permissions are validated against the database for every tool and event invocation.

---

## Modules, subroutines and calls

A stored script may have a `Curator_Module` root with a `main` entry and named `subroutines`. A plain node root is treated as a module with only `main`.

```coffeescript
define_module 'poker_table',
  params: { seats: { type: 'number', default: 6 } }
  subscriptions: [
    subscribe 'game:ping', '#onPing', as: 'ping'
  ]
  subroutines:
    onPing: sub { ping: {} },
      seq 'pong', [
        set_state turn: '$params.ping.turn + 1'
        publish 'game:pong', turn: '$context.turn'
      ]
    fmtPot: sub { pot: { type: 'number' } },
      assign 'label', '"$" + $params.pot'
  main: seq 'table', [
    call 'deck#shuffle', { seed: '$context.seed' }, as: 'deck'
    call '#fmtPot', { pot: '$context.pot' }, as: 'potLabel', mode: 'inline'
    wait_event 'game:end', 'result'
  ]
```

| Ref | Meaning |
|-----|---------|
| `'poker_table'` | `main` of script `poker_table` |
| `'poker_table#onPing'` | subroutine `onPing` of that script |
| `'#onPing'` | subroutine of the current module |

- `call ref, args, as:, mode:` — `mode: 'child'` (default) runs the callee as a child `Request` (one Request + Response per call); the caller waits and receives the result in `$context[as]`. `mode: 'inline'` is a compile-time macro for small pure helpers (no waits, human input or subscribe).
- Callees only see their arguments as `$params.*` (plus conversation state), never the caller's context.
- Local refs (`#sub`) are pinned to the caller's script version; cross-script refs use the target's current version, recorded on the child Request (`scriptVersion`).

## Events: publish, subscribe, wait

- `emit_event name, payload` (alias `publish`) runs as a Request; its Response is `{ "type": "EVENT_EMITTED", "event": { eventName, spawned, woken } }`.
- `subscribe name, handlerRef, as:, when:` — static when declared in `subscriptions` (materialized as `EventSubscription` rows on script save), dynamic (conversation-scoped) when used inside a flow. Handlers must be named refs. A matching event **spawns** a child Request with the payload in `$params[as]`.
- `wait_event name, alias` **resumes** the parked flow with the payload in `$context[alias]`.
- Subscriptions and waits share one matcher in core (`dispatchEvent`).

## Structured Responses

Besides tool output, the processor writes JSON records, e.g. `EVENT_EMITTED`, `APPROVAL_REQUIRED` (`{ tool, roles, expiresAt }`), `APPROVAL_EXPIRED` (`{ tool, roles, expiredAt, onApprovalExpired }`), `TOOL_BLOCKED` (`{ tool, reason, roles }`), and `MODEL_CHANGED` (`{ ok: true, change: { entityType, entityId, action, changes } }`). These are not merged into conversation state.

## Approval Wait Expiry in AST Flows

Tool nodes can specify approval TTL and expiry behavior:
- `approvalTtlMs`: Milliseconds before human approval times out (default 24h, 0 = never expires).
- `onApprovalExpired`: `'fail'` (default) marks the Request `FAILED`. `'continue'` auto-completes the Request as `COMPLETED` and injects `{ ok: false, expired: true, type: 'APPROVAL_EXPIRED', tool: name }` into `$context.<as>` and `$context.<toolName>` so the AST flow can branch (e.g. `if_else "$context.<as>.expired"`).
- Poll cycles automatically sweep expired `WAITING_FOR_USER` requests, recording `APPROVAL_EXPIRED` structured responses.

## Core Model Change Audit Log

Curator core models (Agents, Scripts, Roles, Tool Approvals) do not require a separate `AuditLog` table.
- Changes are recorded via `AuditService.recordModelChange(prisma, { entityType, entityId, action, userId, projectId, changes, origin })`.
- This creates a `COMPLETED` Request with context `{ origin: 'GRAPHQL', modelChange: ... }` and a `MODEL_CHANGED` structured Response.
- The derived audit trail is queried through `AuditService.getLogs(prisma, options)`.

## Direct tool calls and MCP are Requests too

- CLI, REPL, and API tool calls never invoke tool functions directly. Hosts call `host.runTool(name, args, { origin })` (→ `CuratorRequestProcessor.runToolRequest`) and `host.emitEvent(name, payload, opts)` (→ `emitEventRequest`), so RBAC, approval, and the Response trail apply exactly as in workflows. Actor and scope come from the host session, never from client payloads.
- **MCP Server** (`McpToolRegistry`): Always operates on durable storage and engine. Use `McpToolRegistry.fromHost(host)` (or `fromEngine(engine, executor)`). Tool invocations from external MCP clients execute as Requests with origin `MCP`. If approval is required, it returns `WAITING_FOR_USER` with the request ID, preventing unauthorized direct bypass.


