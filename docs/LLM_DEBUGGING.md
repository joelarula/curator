# Debugging what an agent sent to the LLM

For developers and coding agents working on `curator/`. Use it when an agent answers wrongly, ignores context,
repeats itself, loses tool results, or a provider rejects a request, and you need to see the prompt the model
actually received.

## Why the database alone is not enough

The engine stores conversation history (`Response` rows), not prompts. Each agent turn rebuilds its prompt from those
rows (`curator/src/engine/nodes/agent.ts`, `loadConversationTurns`, `ConversationFold.buildContext`), so rebuilding
it by hand can differ from what was sent:

- Earlier user turns are re-rendered from `Request.ast.prompt` with that request's `context` and the conversation's
  current state (`Conversation.metadata`); a turn whose template no longer resolves is dropped.
- Earlier tool calls replay as structured tool messages only if those tools are still offered; otherwise as text.
- `history_profile: 'answers'` drops tool results; `history_limit` and `history_compaction` (summaries) cut history.
- Steps with `exclude_from_history` are skipped; `history_from: 'conversation'` adds `BusEvent` rows instead.
- Inside one turn, the tool loop appends messages in memory only.

So turn on the LLM trace and read the exact request.

## 1. Turn the trace on

Two sinks, each off by default and enabled separately (`curator/src/engine/llm/LlmTrace.ts`):

| Sink | Enable | Output |
|---|---|---|
| Files | `CURATOR_LLM_TRACE=<dir>` | `<dir>/<conversationId>/<requestId>-<turn>.json` |
| Database | `CURATOR_LLM_TRACE_DB=1`, or processor option `llmCalls: true \| { prisma?, ttlMs? }` | `LlmCall` table |

- The env vars must be set in the process that runs the `CuratorRequestProcessor` (the worker), not the client.
- Files are the quickest for one local run and easy to diff. Use the table for a shared or remote worker, or when you
  want SQL over many calls.
- The table needs a Prisma client generated after `LlmCall` was added (`npm --prefix curator run prisma:generate`,
  `prisma:mariadb:generate`, `prisma:postgres:generate`). With an old client the database sink silently does nothing.
- Rows are buffered and written once per poll tick (and on worker stop), so they appear a few seconds after the call.
- Retention: 7 days by default (`ttlMs`; 0 keeps them). Postgres/MariaDB drop whole day partitions; SQLite deletes in
  batches.

```powershell
$env:CURATOR_LLM_TRACE = "$PWD\llm-trace"   # files
$env:CURATOR_LLM_TRACE_DB = "1"             # and/or the table
```

Then reproduce the problem.

## 2. Find the conversation

Local SQLite databases are `curator/data/<name>.db` (`--db <name>`, default `default`).

```sql
SELECT id, externalId, userId, projectId, updatedAt FROM Conversation ORDER BY updatedAt DESC LIMIT 10;
```

## 3. Read the calls

One row per LLM call. `turn` is the agentic-loop iteration (1, 2, ... within one agent step: each tool round is
another call) or `summary` for a history-compaction call.

**SQLite**

```sql
SELECT requestId, turn, model, ms, error,
       json_extract(request,'$.systemPrompt') AS system,
       json_array_length(json_extract(request,'$.messages')) AS n_messages,
       request
FROM LlmCall WHERE conversationId = ? ORDER BY createdAt, id;
```

**Postgres**

```sql
SELECT "requestId", turn, model, ms, error,
       request->>'systemPrompt' AS system,
       jsonb_array_length(request->'messages') AS n_messages,
       request
FROM "LlmCall" WHERE "conversationId" = $1 ORDER BY "createdAt", id;
```

**MariaDB**

```sql
SELECT requestId, turn, model, ms, error,
       JSON_UNQUOTE(JSON_EXTRACT(request,'$.systemPrompt')) AS `system`,
       JSON_LENGTH(request,'$.messages') AS n_messages,
       request
FROM LlmCall WHERE conversationId = ? ORDER BY createdAt, id;
```

Useful variants (SQLite syntax):

```sql
-- the messages of one call, one row each
SELECT m.key AS i, json_extract(m.value,'$.role') AS role, json_extract(m.value,'$.toolName') AS tool,
       substr(json_extract(m.value,'$.content'),1,300) AS content
FROM LlmCall c, json_each(c.request,'$.messages') m
WHERE c.requestId = ? AND c.turn = '1' ORDER BY m.key;

-- tools offered to the model
SELECT json_extract(t.value,'$.name') FROM LlmCall c, json_each(c.request,'$.tools') t WHERE c.id = ?;

-- failed or slow calls
SELECT conversationId, requestId, turn, model, ms, error FROM LlmCall
WHERE error IS NOT NULL OR ms > 30000 ORDER BY createdAt DESC LIMIT 20;
```

From the command line: `sqlite3 -json curator/data/<name>.db "<query>"`.

## 4. What a record contains

| Field | Meaning |
|---|---|
| `request.model`, `request.baseUrl` | Model and endpoint asked for |
| `request.systemPrompt` | The agent's `instruction` after interpolation |
| `request.messages[]` | History plus the current prompt as the last `user` message. Roles: `user`, `assistant` (may carry `toolCalls`), `tool` (`toolCallId`, `toolName`, `isError`) |
| `request.tools[]` | Tool definitions offered (provider-safe names, e.g. `mcp.crm.lookup` becomes `mcp__crm__lookup`) |
| `request.jsonOutput` | True when the agent has an `output_schema` |
| `response` | `text` and `toolCalls` returned, null on error |
| `error`, `ms` | Provider error message; call duration |

This is the provider-neutral `LlmRequest`. Each provider (`AnthropicLlmProvider`, `OpenAiCompatibleLlmProvider`,
...) maps it to its own wire format. If the trace looks right but the provider misbehaves, the mapping in that
provider is the next suspect.

## 5. Symptom → where to look

| Symptom | Check in the trace | Usual cause |
|---|---|---|
| Agent "forgets" earlier turns | `n_messages` small; earlier user turns missing | `history_limit`, `include_contents: 'none'`, compaction summary replaced them, or the past prompt template no longer resolves |
| Tool results missing from history | No `tool` messages, only the final answers | `history_profile: 'answers'` |
| Earlier tool calls appear as plain text | `assistant` text like `[Tool Result: x] ...` instead of `tool` messages | That tool is not in today's `tools` list |
| Step output leaks into other agents' prompts, or is missing | Message present/absent from another step | `exclude_from_history` on that step; tool output is private to the agent that ran it |
| Wrong persona/instructions | `system` | `instruction` expression or `resolveSetting` result |
| Model can't call a tool | Tool absent from `request.tools` | Not offered, pattern matched nothing, or role/project access filtered it out |
| Provider 400 on tool messages | A `tool` message without a matching earlier `toolCalls` id | Turn cut short and replayed; see `agentTurnMessages` |
| Part of the prompt is empty | Last `user` message | An optional `{var?}` placeholder had no value (a required `{var}` fails the step with `Template Error` instead, so there is no call) |
| Earlier prompt reads differently than it did then | An earlier `user` message | Past prompts are re-rendered with the current conversation state and that request's context |
| `[Secret Resolution Error]` / masked values | `tool` message content | Secret not available to the project/user/agent |

## 6. Without the trace (already-finished conversations)

Only the history rows exist. They show what was saved, not what was sent:

```sql
-- history rows in replay order, with the step that wrote each one
SELECT r.id, r.requestId, json_extract(q.ast,'$.type') AS node,
       json_extract(q.ast,'$.agentName') AS agent,
       json_extract(q.ast,'$.exclude_from_history') AS excluded,
       substr(r.content,1,200) AS content
FROM Response r JOIN Request q ON q.id = r.requestId
WHERE r.conversationId = ? ORDER BY r.createdAt, r.id;

-- system prompt template, prompt template and variables of one agent step
SELECT json_extract(ast,'$.instruction'), json_extract(ast,'$.prompt'), context FROM Request WHERE id = ?;
```

`Response.content` is one of: a `{"type":"TOOL_CALLS",...}` record, `[Tool Result: <name>]\n...`, a
`{"type":"APPROVAL_REQUIRED",...}` notice (never replayed), or the agent's final answer. `StepTrace` has step status
and control-flow outputs, not prompts.

## 7. Rules for coding agents

- Debug against a scratch database: CLI runs use `--db <scratch>` and a scratch `CURATOR_IDENTITY_DIR`. Never turn
  the trace on against the user's databases or production workers without asking.
- Trace records contain system prompts, user content and tool output (secrets are masked, other personal data is
  not). Quote only the parts needed, never paste whole records into commits, issues or docs, and do not commit trace
  directories.
- Turn the trace off when done (unset the env vars). Leftover `LlmCall` rows age out; delete a scratch trace
  directory yourself.
- Prefer the file sink for a single local reproduction; it needs no client regeneration or schema change.
- Report findings as: the conversation/request ids, the turn, the specific message(s) that were wrong or missing,
  and which history rule (section 5) explains it.
