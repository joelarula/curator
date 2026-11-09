# Harness UX and plugin architecture plan

Patterns taken from Open WebUI (ideas only: its frontend code is under the Open WebUI License with a branding clause,
so nothing is copied; everything is reimplemented in Vue/TypeScript on Curator's own contracts). Each item builds on an
existing Curator mechanism rather than adding a parallel one. Change order per phase: schema → engine/contracts
(`curator`, `@curator/host/contracts`) → console/harness (`@curator/console`) → CLI (`@curator/host/cli`) → docs.

Scope agreed 2026-11-09:
- UI: branch navigation, inline progress/sources, interrupt cards.
- Architecture: filter chain + message actions, plugin config schemas, agent catalog, capability flags, prompt-based
  tool calling.
- Harness/miniapp UI: composer triggers (aligned with CLI commands), prompt library, output side panel, arena +
  feedback, conversation organisation, channels.
- Not adopted: auxiliary "task model". Resource access control is a separate discussion (last section).

## Current state (2026-11-09)

| Area | What exists | Gap |
|---|---|---|
| Progress | Typed `curator:progress` stream (`curator/src/engine/ProgressEvents.ts`, `@curator/host/contracts/progress.ts`, `CuratorHostEvents.onProgress`) | Harness takes untyped `adapter.onProgress(type, payload)` and shows events only as a log (`EventStreamTab`); nothing inline with turns |
| Interrupts | `wait.opened` carries a `CuratorInterrupt`; `conversation_interrupts`, `conversation_resume` tools | Harness renders choices via its own `availableChoices`/`HarnessChoices` path, not from interrupts |
| Fork/replay | `conversation_fork` (`atRequestId`/`atSeq`, `statePatch`, `scriptVersion`), `run.forked` event; lineage in an `EventLog` `FORK_EVENT` row on the fork | No cheap "forks of conversation X" query (lineage is in a JSON payload); a fork can't replace a recorded human input, so "edit and rerun" isn't possible; no UI |
| Guardrails | `GuardrailService.inspectPromptIngress` (agent node, synthesizer); egress via `SecretService.mask` in `nodes/agent.ts`; plugin `guardrails` (signatures, redaction, providers) | Fixed call sites, not an ordered, extensible chain; no call site found for `IGuardrailProvider.sanitizeEgress` |
| Plugin config | `CuratorPluginDefinition.config` defaults + `engine.setConfig`, read as `$config` | No schema, no system/project/user layers, no persistence, no generated settings UI |
| Agents | `CuratorAgentDefinition` (roles, toolName, args) | No presentation metadata (title, icon, starter prompts) or capabilities for a picker |
| LLM providers | `ILlmProvider.generateContent` (+ embeddings, cache) | No capability declaration; tool calling always native |
| Commands | CLI `ClientShell`: slash commands, tools as commands (`toolArgsFromTokens`), turn choices as commands | Web harness has its own mode/agent/tool selectors (`HarnessOpPrompt`); no shared command catalog |
| Conversations | `Conversation.metadata` JSON, `ForumRoom`, `BroadcastChannel` | No folders/tags/pins/archive/search/share; no channel UI; no feedback records |

## Priority order

Two tracks that can run in parallel; later phases depend on earlier ones as noted.

**Track A: conversation UI (console/harness)**
1. Phase 1: Inline progress and sources (S–M). Foundation for 2, 3, 10.
2. Phase 2: Interrupt cards (M). Needs 1.
3. Phase 3: Branch navigation (M–L). Needs 1; small engine/schema additions.

**Track B: engine and plugin architecture**
4. Phase 4: Filter chain and message actions (M).
5. Phase 5: Plugin config schemas and generated settings (M–L, schema change).
6. Phase 6: Agent catalog and capability flags (S–M).
7. Phase 7: Prompt-based tool calling fallback (M). Needs 6.

**Track C: harness and miniapp UI** (after A1 and B6)
8. Phase 8: Composer triggers and shared command catalog (M–L). Needs 6.
9. Phase 9: Prompt library (S–M). Needs 8.
10. Phase 10: Output side panel (S).
11. Phase 11: Arena and feedback (M, schema change). Needs 1.
12. Phase 12: Conversation organisation (M, schema change).
13. Phase 13: Channels UI (M).

**Discussion: resource access control** (not scheduled).

---

## Phase 1: Inline progress and sources

Goal: each turn in `HarnessOutput` shows a collapsible status line built from progress events ("Searching knowledge…
→ 5 results · 1.2 s", "Retrying 2/3 (rate_limit)"), plus source chips for retrieved content.

- Adapter: add `onProgressEvent?(cb: (e: ProgressEvent) => void): () => void` to `CuratorConsoleAdapter`
  (`packages/curator-console/src/types.ts`), typed from `@curator/host/contracts`. Keep `onProgress` (deprecated shim
  for one release, per workspace rules).
- `useRunTimeline(conversationId)` composable: folds events into per-request entries
  (`step.started/finished/retrying/replayed`, `wait.*`, `run.finished`); ignores unknown kinds (contract rule).
- `HarnessRunStatus.vue`: collapsed = current/last step + total duration; expanded = step list with node type,
  status, attempts, replayed marker. Mounted per turn in `HarnessOutput.vue`.
- Human-readable step labels: optional `ui.statusLabel` on `defineTool` (e.g. `"Searching {query}"`), falling back
  to tool name / node type. Rendered as text only (escaped).
- Sources: optional `sources?: { title, uri?, snippet?, resourceId? }[]` on tool results (`ToolOutputSpec`/
  `TOOL_RESULT` content). `search_knowledge` and plugin-rag populate it. `HarnessSourceChips.vue` shows chips; click →
  snippet popover or `HarnessResourceDetail`.
- CLI parity: `ClientShell` prints the same condensed status line (dim) per step.

Tests: timeline reducer unit tests (event sequences incl. retries, replay, unknown kinds); component snapshot.

## Phase 2: Interrupt cards

Goal: a parked step appears as a card in the conversation where it happened; resolving it resumes the run.

- On `wait.opened`, render `HarnessInterruptCard.vue` by `interrupt.kind`: prompt (text/form from its schema),
  choice (reuses `HarnessChoices`), approval (tool name + args preview + approve/deny), event wait (read-only with
  deadline countdown).
- Resolve through `conversation_resume` via the adapter (`host.runTool` path, never a direct handler call). Card
  collapses into a one-line record on `wait.resumed` (outcome shown).
- On load/reconnect, hydrate open cards from `conversation_interrupts` so cards survive refresh.
- Migrate the existing `availableChoices`/`workflowChoicePrompt` path in `CuratorHarness.vue` onto interrupts; keep
  the old props as deprecated for one release.
- CLI: `ClientShell` already lists choices; switch its source to interrupts too so both surfaces match.

Tests: card per interrupt kind; resume/deny round trip against a test host; hydration after reload.

## Phase 3: Branch navigation

Goal: retrying or editing from a step creates a sibling branch shown as `‹ 2/3 ›` at that step, not a new unrelated
conversation.

Engine/schema (`curator`, all three Prisma providers):
- `Conversation.forkedFromId Int?` + `forkedAtRequestId Int?` with an index, written by `forkConversation` alongside
  the existing `FORK_EVENT` row. Enables "list forks of X at request R" without scanning JSON.
- Tool `conversation_branches({ conversationId })` → fork tree (ids, fork point, created, status). Scoped by project
  like the other conversation tools.
- "Edit and rerun": let a fork replace a recorded human input/resume value at the boundary (e.g.
  `conversation_fork({ ..., resumeValue })` when the fork point is a human-input or interrupt step). Recorded through
  the Phase B interrupt mechanism so replay stays deterministic.

UI:
- Branch switcher at the fork step in `HarnessOutput` / `RequestTreeNode`; switching loads the sibling conversation's
  turns from the fork point on.
- Message actions "Retry from here" (fork at the step) and "Edit and rerun" (fork with `resumeValue`).
- `run.forked` events update the switcher live.

Tests: fork lineage written; branches query; resumeValue replay determinism; UI switch.

## Phase 4: Filter chain and message actions

Filters (the Open WebUI inlet/outlet idea, kept inside Curator's guardrail boundary):
- `CuratorPluginDefinition.filters?: CuratorFilter[]` with `{ name, priority, appliesTo?: agent ids/glob,
  inlet?(req, ctx), outlet?(res, ctx) }`. Inlet gets the `LlmRequest` before the provider call, outlet the
  `LlmResponse` after. A `stream` hook waits until providers stream.
- One `FilterChain` service runs them in the agent node around `generateContent`. Built-in system filters always run
  first (inlet) / last (outlet) and can't be removed: `inspectPromptIngress`, input truncation, `SecretService.mask`
  / `sanitizeModelOutput`, and the registered providers' `evaluateIngress`/`sanitizeEgress` (wires the hook that has
  no call site today).
- A filter can block (recorded as `GUARDRAIL_BLOCKED`) but never adds tools or widens permissions; filter config comes
  from Phase 5.

Message actions:
- `defineTool({ ui: { messageAction: { label, icon?, appliesTo?: 'assistant'|'user'|'tool' } } })`.
- Harness shows them on message hover; clicking runs the tool through the adapter with
  `{ conversationId, requestId, text }`. Same access level/approval rules as any tool call.

Tests: chain ordering, system filters non-removable, block path, egress masking still applied; action dispatch.

## Phase 5: Plugin config schemas and generated settings

- `CuratorPluginDefinition.configSchema?: Record<namespace, JSONSchema>`; each property may set
  `x-curator-scope: 'system' | 'project' | 'user'` (who may set it) and `format: 'secret'`.
- Resolution: plugin `config` defaults < system < project < user, merged into `$config` per request (project/user from
  the host session, never the payload). Validated with Ajv on write.
- Persistence: `PluginConfigValue` table (`namespace`, `key`, `scope`, `projectId?`, `userId?`, `value Json`,
  `existent`), indexed per database rules. `engine.setConfig` stays as the in-memory override for tests/hosts.
- Secret fields go through `SecretService` / `ISecretVaultProvider`; only a reference is stored, never plain values.
- Tools `config_get` / `config_set` (role-checked per scope) and GraphQL fields for the console.
- Console "Settings" tab: renders a Vuetify form from the schema (string/number/boolean/enum/array/object, secret →
  masked input). A small in-package renderer, no new dependency unless one proves necessary.

Tests: layer merge, scope permissions, Ajv rejection, secret round trip, form rendering for each type.

## Phase 6: Agent catalog and capability flags

- `CuratorAgentDefinition.presentation?: { title, description, icon?, starterPrompts?: string[], tags? }`.
- `ILlmProvider.capabilities?: { tools: 'native' | 'prompt' | 'none', vision, json, streaming, embeddings }`
  (defaults keep current behaviour). Gemini, llama and OpenAI-compatible providers declare theirs.
- Agent capabilities = model provider ∩ agent config (e.g. no tools if the agent has none).
- `agent_catalog` tool / GraphQL query: agents visible to the session with presentation + capabilities.
- Harness agent picker uses the catalog (cards with starter prompts); controls hide when unsupported (no image attach
  without vision, no tool list without tools).

## Phase 7: Prompt-based tool calling fallback

- Agent option `toolCalling: 'auto' | 'native' | 'prompt'` (default `auto` → provider capability).
- Prompt mode: tool schemas rendered into the system prompt with a strict JSON call format; the response parser
  extracts calls, validates each with Ajv against the tool schema, and feeds the same `toolCalls` path as native
  calls. Invalid JSON → one corrective retry, then a visible tool error.
- Guardrail rules unchanged (blocked tools stripped before the prompt is built).
- Target: llamacpp / curator-rust GGUF models.

Tests: parser (well-formed, fenced, malformed, multiple calls), Ajv rejection, parity with native on a fixture.

## Phase 8: Composer triggers and shared command catalog

Goal: one command vocabulary for the CLI shell and the web composer.

- Contract in `@curator/host/contracts`: `CommandDescriptor { name, aliases, description, argsSchema?, source:
  'command' | 'tool' | 'choice' | 'prompt' | 'agent' | 'resource' }` and `listCommands(session)`.
  `ClientShell` builds its Commander program from it instead of its private list; `toolArgsFromTokens` stays the
  token parser for both.
- Triggers:
  - `/` commands, tools, turn choices and saved prompts, same names as in the CLI. Args form generated from
    `argsSchema` when selected in the web composer; CLI keeps `name arg1 --flag`.
  - `@agent` targets an agent from the Phase 6 catalog (replaces the mode/agent dropdowns in `HarnessOpPrompt`, which
    stay as a fallback for one release).
  - `#resource` attaches resources, knowledge collections or URLs as context references (ids, resolved server-side
    and project-scoped).
- CLI gains `@`/`#` parsing and readline completion from the same catalog.
- `HarnessComposer.vue`: suggestion popup with keyboard navigation, chips for attached `@`/`#` items.

## Phase 9: Prompt library

- Saved prompts as entities scoped to project or `'system'` (check first whether `SkillShape`/scripts already cover
  this; reuse if so). Body with `{{variable}}` placeholders, optional JSON Schema for the variables.
- Inserted through `/name`; variables open a small form (web) or are prompted inline (CLI).
- Console tab to create/edit prompts.

## Phase 10: Output side panel

- Tool/agent outputs with display formats `html`, `svg`, `mermaid`, `table`, `json` get "Open in panel"; the panel is
  resizable beside the conversation (`HarnessWorktable`/`HarnessOutput` area).
- HTML/SVG rendered in a sandboxed `iframe srcdoc` without `allow-same-origin`; model output treated as untrusted.

## Phase 11: Arena and feedback

- Arena: same input to two agents (or two models of one agent) as two conversations started together; side-by-side
  view; pick the better one or tie.
- Feedback: thumbs up/down + optional reason on any assistant turn. `Feedback` table (`requestId`, `conversationId`,
  `agentId`, `model`, `rating`, `reason`, `userId`, `projectId`, `existent`).
- Console leaderboard: win rate / Elo per agent+model, filter by tag; export for workflow evaluation.

## Phase 12: Conversation organisation

- Title (generated by the agent's own model or first prompt), folders, tags, pinned, archived (soft, via `existent`
  rules), full-text search over turns.
- Stored in `Conversation.metadata` first; promote to columns only where indexes are needed (pinned, archived,
  folder).
- Share: read-only snapshot export (turns + sources, secrets masked) as a link scoped to the project.

## Phase 13: Channels UI

- Room view over `ForumRoom` / `BroadcastChannel`: participants (people and agents), message stream, `@agent` mentions
  (from the Phase 8 catalog) to bring an agent into the thread.
- Reuses the harness message components; interrupts and progress render the same way as in one-to-one turns.

---

## Cross-cutting

- Packages: UI in `packages/curator-console` (Vue 3 + Vuetify peer deps); contracts in `packages/host/src/contracts`;
  engine in `curator`. Rebuild `packages/host` / `curator` before testing miniapps (blueprint, gallery, keeris).
- Deprecation: every replaced prop/adapter method keeps a `@deprecated` shim for one release.
- Security: all new tools are project-scoped and go through `host.runTool`; all rendered model/tool text is escaped
  or sandboxed; ids for `#` attachments are resolved server-side.
- Docs per phase: `packages/curator-console/README.md`, `curator/CURATOR_AST.md` (fork `resumeValue`, `toolCalling`),
  `docs/SCRIPTING_REFERENCE.md`, plugin authoring docs (filters, configSchema, presentation, `ui` tool fields).

## Discussion: resource access control (not scheduled)

Open WebUI gives each model, knowledge base, tool and prompt a private / group / public setting with read/write
grants. Questions to settle before planning it for Curator:

1. Grants within a project only, or across projects? (Today: entity belongs to a project or `'system'`.)
2. `visibility` enum on each entity vs. a shared `ResourceGrant` table (subject = user/role/group, permission =
   read/write/use)?
3. How it relates to plugin roles (`roles`, `defaultUserRoles`) and tool `requiredRole` / `accessLevel`.
4. Which entities first: agents, prompts (Phase 9), knowledge collections, plugin config (Phase 5)?
5. MCP exposure: should grants also filter `tools/list` per caller?
6. Migration: default for existing rows (project-visible).

## Decisions needed before starting

- Phase 3: confirm adding `forkedFromId`/`forkedAtRequestId` columns (vs. reading `FORK_EVENT` payloads).
- Phase 5: confirm the `PluginConfigValue` table and the scope names (`system` / `project` / `user`).
- Phase 9: reuse `SkillShape`/scripts for prompts, or a new entity.
- Phase 11: Elo vs. simple win rate for the first version.
