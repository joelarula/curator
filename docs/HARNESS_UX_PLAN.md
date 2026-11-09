# Harness UX and plugin architecture plan

Practical patterns taken from Open WebUI (ideas only; its frontend is under the Open WebUI License with a branding
clause, so nothing is copied). Every item extends an existing Curator mechanism; no parallel registries, contracts or
stores. Change order per phase: schema → engine/contracts (`curator`, `@curator/host/contracts`) → console
(`@curator/console`) → CLI (`@curator/host/cli`) → docs.

Scope (agreed 2026-11-09):
- UI: inline run status, interrupt cards, output panel (incl. Markdown), `/` and `@` composer aligned with CLI
  commands, plugin settings tab.
- Architecture: guardrail filter hooks + message actions, plugin config schemas with persisted values, agent
  presentation + capability flags, prompt-based tool calling.
- Deferred: branch navigation (needs a relational tree pattern first), source chips, `#` attachments, prompt library,
  conversation organisation, channels.
- Not adopted: arena/leaderboard, auxiliary "task model". Resource access control: separate discussion (last section).

## Implementation principles

1. **Composables first.** New console logic lives in `packages/curator-console/src/composables/use*.ts` and is
   exposed through the existing `provideHarnessContext` (`context.ts`); components stay presentational.
   `CuratorHarness.vue` (≈1400 lines) gets no new logic; state touched by a phase moves into that phase's composable.
2. **Plugins are the extension point.** Server-side behaviour comes from `CuratorPluginDefinition` fields that already
   exist (`guardrails`, `config`, `formatters`, `toolOutput`, `llmProviders`, `agents`, `tools`). Client-side rendering
   extends the one existing UI registry, `adapter.customComponents`. No new UI plugin system.
3. **One renderer per concern.** One JSON-Schema form composable (config, tool args, prompt interrupts); one surface
   registry (built-ins + miniapp components); one command list (CLI + composer + Commands menu).
4. **Reuse existing libraries and components**: `marked` + `dompurify` (already in `frontend` and `gallery`),
   `HarnessChoices`, `HarnessContextMenu`, speech-act tags.
5. **Contracts in `@curator/host/contracts`** extend the existing shapes (`CuratorToolContract`, progress contract,
   `HarnessUiSurface`) instead of defining new ones. Replaced props/methods keep a `@deprecated` shim for one release.

## What already exists and is reused

| Need | Existing mechanism | Used by |
|---|---|---|
| Typed progress | `curator:progress` (`ProgressEvents.ts`, `contracts/progress.ts`, `isProgressEvent`); harness receives it through `adapter.onProgress(type, payload)`; harness has `liveStepMessage` | Phase 1 |
| Choices / interrupts | `CuratorInterrupt`, `wait.opened`/`wait.resumed`, `conversation_interrupts`/`conversation_resume`; `HarnessChoices` + `availableChoices` state; CLI `activeChoices` | Phase 2 |
| Guardrail plugins | `guardrails.providers: IGuardrailProvider` (`evaluateIngress`, `sanitizeEgress`), `inspectPromptIngress` in `nodes/agent.ts`, `SecretService.mask` egress | Phase 4 |
| Commands menu | `HarnessContextMenu` (commands + tools, `insertToolCommand`); CLI `ClientShell` commands/tools/choices; `CuratorToolContract` (`name`, `aliases`, `usage`, `parameters`) | Phases 4, 9 |
| Plugin config | `CuratorPluginDefinition.config` defaults, `engine.setConfig`, `$config` (`builder/CuratorConfig.ts`) | Phase 5 |
| Agents | `CuratorAgentDefinition`, `Agent` table, agents GraphQL query behind `AgentsTab` / `harness.agents` | Phase 6 |
| Models | `llmProviders` / `engine.registerLlmProvider`; `AIModel` table (`provider`, `type`, `version`, `url`) | Phase 6, 7 |
| Output | `uiSurface` on tool results, `applySurfaceIfPresent`, `HarnessOutput` surface tab, `HarnessWorktable`, `adapter.customComponents`; `toolOutput` / `formatters` with `display` target | Phase 8 |
| Speech-act tags | `<suggest>`, `<choose>`/`<ask>`, `<callout>` in agent text: `parseSpeechActs` → `cleanText`, `suggestions`, `activeChoices`/`choiceGroups`, `callouts` (`contracts/speechActs.ts`); prompt rules `withSpeechActPromptRules`; workflow helpers `tagSuggest`/`tagChoose`/`tagCallout` (`SpeechActComposables.ts`); CLI `ClientShell.ingestSpeechActs`; console callouts, suggestion chips, choices (commit `d4364b8`) | Phases 2, 8, 9 |
| Text formatting | `marked` + `dompurify`; `CuratorMermaid.ts` (workflow diagrams) | Phase 8 |

## Priority order

**Track A, conversation UI**
1. Phase 1: Inline run status, done. Phase 1b: event labels + tool progress, done.
2. Phase 2: Interrupt cards, done.
3. ~~Phase 3: Branch navigation~~ deferred.

**Track B, engine and plugins**
4. Phase 4: Guardrail filter hooks and message actions, done.
5. Phase 5: Plugin config schemas, persisted values, settings tab (M–L, schema change).
6. Phase 6: Agent presentation and capability flags (S–M, small schema change).
7. Phase 7: Prompt-based tool calling in providers (M). Needs 6.

**Track C, harness and miniapps**
8. Phase 8: Output panel (M). Independent.
9. Phase 9: Composer `/` and `@` on the shared command list (M). `@` needs 6; args form shares Phase 5's form.

Shared piece: `useSchemaForm` + `HarnessSchemaForm.vue`, built with Phase 5 (Phase 2 uses a JSON field for
structured answers until then).

---

## Phase 1: Inline run status (implemented 2026-11-10)

A collapsible status line per turn, the same in the web console and the CLI: live while the run is going
("Retrying 2/3 (rate_limit) in 1.5 s"), one summary when it ends ("Agent completed · 3 steps · 2.1 s").

- Host contract, pure and browser-safe, shared by console and CLI:
  - `contracts/progress.ts`: `isProgressEventPayload` (same check as the engine's `isProgressEvent`, no engine
    import), `describeProgressEvent` (one line per kind; null for `state.changed` and unknown kinds),
    `progressStepLabel` (event `label` when present, else node type), `formatProgressDuration`.
  - `contracts/runTimeline.ts`: `createRunTimeline`, `applyProgressEvent` (fold), `summarizeRun`, `isRunDone`,
    `runDurationMs`. A run binds to the conversation of its root request, or of a given conversation, or (neither
    known) of the first `step.started`.
- Console: `useRunTimeline(adapter.onProgress)` (`composables/useRunTimeline.ts`) wraps the fold with a buffer, so
  events that arrive before the trigger call returns still count. `HarnessRunStatus.vue` shows it expanded while the
  turn runs, collapsed above the result afterwards, and on each Turns entry (`TurnHistoryEntry.run`). Agent turns
  (`triggerAgent.requestId`) and tool turns (`executeTool.requestId`) both show a run.
- Tool turns: `executeTool` (`packages/server` GraphQL) now runs through `host.runTool` instead of calling
  `tool.execute` directly (it skipped RBAC/approval and recorded no Request), and returns `requestId` + `status`.
  Gallery's resolver (already on `host.runTool`) returns them too.
- CLI: `ShellProgressRenderer` (`packages/host/src/cli/progressRenderer.ts`), wired into `ClientShell`, which
  follows its channel's `curator:progress` by itself (`progress: false` turns it off, `{ verbose: true }` prints every
  event, `{ conversationId }` follows one conversation). On a TTY while a line is being handled: a live spinner line;
  while the prompt is showing (a run an agent started after the user's message) or without a TTY: one dim line per
  finished/retried step; waits print as permanent lines; the end prints "✔ … · n steps · t". Runs without
  `run.finished` close after 15 s idle. `ingestProgress(payload)` remains for events that arrive another way.

Limits: AST
turns have no root request id; a tool turn shows its run after the mutation returns (the run is replayed from the
buffer, not live).

Tests: `packages/host/test/progress_contract.test.ts`, `run_timeline.test.ts` (fold, summary, CLI renderer),
`client_shell.test.ts`; `packages/curator-console/test/useRunTimeline.test.ts`.

Found, not fixed: with an adapter that has `send`, the harness's tool mode sends `curator:tool_call` *and* calls the
`executeTool` mutation, so the tool may run twice (keeris' direct target runs `curator:tool_call`). Fix with Phase 9,
which replaces that code path.

## Phase 1b: Event labels and tool progress (implemented 2026-11-10)

Steps read as "search_knowledge completed · 0.4 s" instead of "Tool completed", and tools an agent calls show as
sub-steps of its run, in the console and the CLI.

- Engine (additive within progress `v: 1`, documented in `curator/CURATOR_AST.md` §16):
  - `label?` on `step.started` / `step.finished`, computed once at step start (`src/engine/progressLabel.ts`, kept in
    the processor's `executing` entry). First match: node `name`; tool node: tool `ui.progressLabel`, else
    `toolName`; agent node: `agentName`; call node: `ref`. Never argument values (tested); cut to 80 characters.
  - `ui?: { progressLabel }` on `defineTool` / `CuratorTool` and on the host's `CuratorToolContract` (Phase 4 adds
    message actions to the same object).
  - `tool.started` / `tool.finished` (`callId`, `toolName`, `label?`, `status`, `durationMs`) emitted by
    `nodes/agent.ts` around each tool call through the new `NodeContext.progress`. Access denials, schema errors
    and unknown tools finish as FAILED. The ad-hoc `agent:tool_result` event is unchanged.
- Clients: the fold keeps calls as `RunStep.calls` (a call still running when its step ends takes the step's
  outcome, e.g. an approval pause); `describeProgressEvent` has lines for both kinds; `HarnessRunStatus` lists calls
  under their step; the CLI prints finished calls as lines and shows the latest call on the live line.

Not done: agent presentation titles as labels (waits for Phase 6); argument-based label templates (not planned).

Tests: `curator/test/engine/progress-events.test.ts` (labels, no argument values, tool events),
`packages/host/test/run_timeline.test.ts` (sub-step fold, CLI lines).

## Phase 2: Interrupt cards (implemented 2026-11-10)

A parked step can be answered where it shows up, in the console and the CLI; every answer goes through
`conversation_resume` (via `host.runTool`), never through a handler or the old event path.

- Host contract `contracts/interrupts.ts` (shared, browser-safe): `interruptInputMode` (choices / text / json /
  approval / event), `interruptOptions` (prompt choices: `value`, else `id`, else label; approvals: approve once,
  approve for this conversation, deny), `interruptTitle`, `applyInterruptEvent` (open list from `wait.opened` /
  `wait.resumed`).
- Console:
  - `useInterrupts(onProgress, runTool)`: open interrupts from progress events, `hydrate()` with
    `conversation_interrupts` on mount, `resume(id, value)` with `conversation_resume` through `executeTool`.
  - `useChoices()`: now owns the choice bar state that was declared in `CuratorHarness.vue`, with one rule: an open
    interrupt's choices win; speech-act `<choose>`/`<ask>` and legacy workflow choice payloads show only without one.
    Picking an interrupt choice resumes it instead of starting a turn.
  - `HarnessInterruptCard.vue` for approvals (tool, requesting agent, reason, sanitized args, three answers), free
    text, JSON answers (until the shared schema form arrives with Phase 5) and event waits (read-only, deadline).
    Shown at the top of the output pane in every tab.
  - An agent turn ends when its run parks (`wait.opened` in the run's conversation) with status `WAITING_FOR_USER`,
    instead of waiting for the 30 s timeout.
- CLI (`ClientShell.ingestInterruptEvent`, fed by the progress subscription): choice and approval interrupts become
  numbered choices whose tool is `conversation_resume`; a text/JSON prompt takes the next non-command line;
  speech-act choices don't replace interrupt choices; `wait.resumed` clears them.

Kept for one release: the legacy workflow choice path (`curator:choice` events, `adapter.resumeRequest`) for
payloads that don't come from an interrupt.

Tests: `packages/host/test/interrupts_contract.test.ts` (contract, CLI approval and text answers, precedence),
`packages/curator-console/test/interrupts.test.ts` (`useChoices` precedence, `useInterrupts`).

## Phase 3: Branch navigation (deferred 2026-11-09)

Only on top of a relational tree pattern for selecting forks (nested set or similar), not `parentId` columns or the
`FORK_EVENT` JSON payload. Candidate: the existing nested-set `ResourceTree` (`treeStart`/`treeEnd`, `depth`, range
index with `existent`). Notes for later: fork lineage in that structure, `conversation_branches` tool,
`conversation_fork({ resumeValue })` for "edit and rerun", `‹ 2/3 ›` switcher at the fork step.

## Phase 4: Guardrail filter hooks and message actions (implemented 2026-11-10)

Filters extend the existing guardrail plugin hook (`guardrails.providers` / `GuardrailService.registerProvider`); no
new plugin field.
- `IGuardrailProvider` gains `priority` (lower first, default 100), `appliesTo` (agent names/globs), `inlet(request,
  ctx)` and `outlet(response, ctx)`. A hook returns a changed value, nothing, or `{ blocked: true, reason, atlasTag? }`.
- `GuardrailService.runInlet` / `runOutlet` run them in `nodes/agent.ts` around every model call, after the built-in
  ingress checks. Returned tools are cut to the original set; model, endpoint, API key, cached content and abort
  signal are restored; tool calls the model did not make are dropped. A block, or a hook that throws (fail closed),
  records `GUARDRAIL_BLOCKED` (`metadata: { provider, stage }`) and ends the step.
- `GuardrailService.sanitizeEgress` replaces the final `SecretService.mask` call: providers' `sanitizeEgress` (the
  hook had no call site before) in priority order, then the built-in masking last. A failing egress provider is
  logged and skipped; the masking still runs.
- `inspectPromptIngress` now also respects `priority` / `appliesTo` for `evaluateIngress`.

Message actions: tool metadata, shown in the existing context menu.
- `ui.messageAction: { label, icon?, appliesTo? }` on `defineTool` / `CuratorTool` / `CuratorToolContract`.
- The tools query returns `ui` (`packages/server`, gallery); the console falls back to the old query on servers
  without it.
- `useMessageActions` (console): tools per message role (default assistant); runs them through `executeTool`
  (`host.runTool`) with the arguments the tool declares among `text`, `requestId`, `conversationId`. The result is
  shown like a tool turn.
- `HarnessContextMenu` lists them first when opened on a turn (⋮ next to Copy, or right-click on the output or a
  Turns entry), plus Copy text.

Tests: `curator/test/engine/guardrail-hooks.test.ts` (rewrite limits, block and fail-closed, outlet limits, egress
order, priority/appliesTo), `packages/curator-console/test/messageActions.test.ts`.

## Phase 5: Plugin config schemas, persisted values, settings tab

Extends `config` / `$config`; nothing replaces them.
- `CuratorPluginDefinition.configSchema?: Record<namespace, JSONSchema>` next to `config`. Property extensions:
  `x-curator-scope: 'system' | 'project' | 'user'` (who may set it), `format: 'secret'`. Scope names confirmed 2026-11-09.
- Resolution into the same `$config`: plugin defaults < system < project < user (project/user from the host session,
  never the payload); `engine.setConfig` stays as the in-memory override for hosts and tests. Ajv-validated on write.
- Storage: dedicated `PluginConfigValue` table (consistent with dedicated tables over RDF `Resource` rows), all three
  Prisma providers: `namespace`, `key`, `scope`, `projectId?`, `userId?`, `value Json`, `existent` in the unique key
  `(namespace, key, scope, projectId, userId, existent)`.
- Secrets: stored as `SecretService` / `ISecretVaultProvider` references only.
- Access: `config_get` / `config_set` tools (role-checked per scope), GraphQL fields for the console.
- Console: "Settings" tab rendering each namespace with `HarnessSchemaForm`.

Tests: layer merge, scope permissions, Ajv rejection, secret round trip, form per field type.

## Phase 6: Agent presentation and capability flags

- `CuratorAgentDefinition.presentation?: { title, description, icon?, starterPrompts? }`; DB-created agents get
  `Agent.metadata Json?` holding the same shape. Starter prompts render as the same suggestion chips as
  `<suggest>`.
- Capabilities are per model: provider-level defaults (`ILlmProvider.capabilities?: { tools: 'native' | 'prompt' |
  'none', vision, json, streaming, embeddings }`) overridden per model by `AIModel.capabilities Json?`.
- No new catalog tool: the existing agents GraphQL query (behind `AgentsTab` / `harness.agents`) returns
  `presentation` and resolved capabilities.
- Harness agent picker shows title/description/starter prompts; controls hide what the model can't do.

## Phase 7: Prompt-based tool calling in providers

- A provider concern, not an agent-node one: a shared helper (`curator/src/engine/llm/promptToolCalling.ts`) that
  providers with `capabilities.tools === 'prompt'` use (OpenAI-compatible for llamacpp/curator-rust, llama plugin).
- Renders tool schemas into the system prompt, parses JSON calls from the reply, validates them with Ajv, returns the
  standard `LlmResponse.toolCalls`; the agent node and guardrails see no difference.
- Invalid JSON → one corrective retry, then a visible tool error.

Tests: parser (plain, fenced, malformed, multiple calls), Ajv rejection, parity with native on a fixture.

## Phase 8: Output panel

### Today

- Tools return `uiSurface: { component, title, items, item, props, ... }` (gallery does); `applySurfaceIfPresent`
  also guesses one from any payload with `items` / `galleryItems` / `resources`.
- Shown in `HarnessOutput`'s "UI Surface" tab (stack layout) or `HarnessWorktable` (2-column layout); built-ins
  `resource-collection` / `resource-detail`; miniapps add components via `adapter.customComponents`.
- Agent text is raw text in a `<pre>`.

Problems: one surface at a time; lost on reload although the tool result is stored; the payload guess misfires; only
resource views built in; no Markdown.

### Design

- **Contract**: `HarnessUiSurface` moves to `@curator/host/contracts` (re-exported by the console, same name) with
  more built-in `component` values: `table`, `markdown`, `code`, `json`, `mermaid`, `html`, `image`, plus `data`
  for their content.
- **How tools produce surfaces**: an explicit `uiSurface` field, or the existing `toolOutput` / `output.display`
  format pipeline with surface formatters (e.g. `surface:table`) registered through the existing plugin
  `formatters`. The payload guess is deprecated (kept one release).
- **One registry**: built-in renderers are default entries of the same map as `adapter.customComponents`; a miniapp
  overrides or adds by key.
- **`useSurfaces()`** composable: list of surfaces per conversation `{ id, title, component, requestId }`, active
  surface, rebuild on reload from the conversation's `TOOL_RESULT` responses (one query, no new table).
- **`HarnessSurfacePanel.vue`**: used by both `HarnessWorktable` and the surface tab (layouts unchanged). Header: title
  + dropdown of earlier surfaces + close. Each turn shows a chip for its surface that opens it.
- **Agent text**: `parseSpeechActs` runs first (callouts, suggestion chips, choices unchanged); its `cleanText` is then
  rendered with `marked` + `dompurify` (no raw HTML) instead of the `<pre>`. Fenced `mermaid` / `html` / `svg` /
  `json` blocks and Markdown tables get "Open in panel". No new speech-act tag for panels: standard fenced blocks
  are enough and keep prompts simple.
- **Renderers** (lazy-loaded):

| component | Rendering | Notes |
|---|---|---|
| `table` | `v-data-table-virtual` | tool truncates large results, sends `total` |
| `markdown` | `marked` + `dompurify` | same as agent text |
| `code` / `json` | `<pre>` + copy; collapsible JSON | no editor dependency |
| `mermaid` | `mermaid` (lazy), `securityLevel: 'strict'` | also usable for `CuratorMermaid` workflow output |
| `html` / `svg` | `<iframe sandbox="allow-scripts" srcdoc>`, no `allow-same-origin`, CSP `default-src 'none'` + inline | untrusted model output: no app, cookie or network access |
| `image` | `data:` URLs or project resource URLs only | |
| `resource-collection` / `resource-detail` | existing components | unchanged |

- **CLI**: one-line summary per surface; `table` as a compact text table.

Steps: (1) contract + `useSurfaces` + panel with today's renderers, no visible change; (2) surface list, turn chips,
reload; (3) Markdown agent text; (4) `table`/`code`/`json`, then `mermaid`/`html`/`image`; (5) "Open in panel",
surface formatters, deprecate the guess.

Tests: explicit surfaces + deprecated guess, rebuild from responses, sandbox attributes, Markdown sanitising.

## Phase 9: Composer `/` and `@` on the shared command list

- **One list, three consumers**: `useCommandCatalog()` merges tools (`harness.tools`), host commands and current
  choices into `CuratorToolContract`-shaped entries plus `source: 'tool' | 'command' | 'choice' | 'agent'`. It feeds
  `HarnessContextMenu`'s Commands menu (replacing its own lists), the composer popup, and, through the same contract
  from `@curator/host`, `ClientShell`'s Commander program.
- `/`: popup with keyboard navigation; `/name arg --flag` parsed by the existing `toolArgsFromTokens`; picking a tool
  with parameters opens `HarnessSchemaForm`.
- `@agent`: agents from Phase 6; the message goes to that agent.
- Suggestion chips (`<suggest>`, starter prompts) whose prompt starts with `/` or `@` go through the same parser, so an
  agent can suggest a command.
- The Agent/Tool/AST toggle in `HarnessDeck` / `HarnessOpPrompt` stays one release as a fallback.
- CLI: readline completion from the same list, plus `@agent`.

Tests: list built from tools/commands/choices; identical parsing in CLI and composer.

---

## Cross-cutting

- Rebuild `packages/host` / `curator` before testing miniapps (blueprint, gallery, keeris).
- New tables follow database rules (`existent` in unique keys); new tools are project-scoped and run via
  `host.runTool`.
- Docs per phase: `packages/curator-console/README.md`, `curator/CURATOR_AST.md`, `docs/SCRIPTING_REFERENCE.md`,
  plugin authoring docs (guardrail hooks, `configSchema`, `presentation`, `ui` tool field, surface formatters).

## Discussion: resource access control (not scheduled)

Open WebUI gives models, knowledge, tools and prompts private / group / public access with read/write grants.
Questions before planning it for Curator:
1. Grants inside a project only, or across projects? (Today: project or `'system'`.)
2. `visibility` field per entity vs. a shared grants table (subject = user/role, permission = read/write/use)?
3. Relation to plugin roles (`roles`, `defaultUserRoles`) and tool `requiredRole` / `accessLevel`.
4. Which entities first: agents, knowledge, plugin config?
5. Should grants also filter MCP `tools/list` per caller?
6. Default for existing rows.

## Decisions (2026-11-09)

- Plugin config scopes: `system` / `project` / `user`.
- `@curator/console` may add `marked` + `dompurify` and a lazy-loaded `mermaid` (Phase 8).
- Arena/leaderboard and the auxiliary task model are not adopted; branch navigation waits for a relational tree
  pattern.
