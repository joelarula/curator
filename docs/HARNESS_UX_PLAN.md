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
5. Phase 5: Plugin config schemas, persisted values, settings tab, done.
6. Phase 6: Agent presentation and capability flags, done.
7. Phase 7: Prompt-based tool calling, done.

**Track C, harness and miniapps**
8. Phase 8: Output panel, done.
9. Phase 9: Composer `/` and `@` on the shared command list, done.

Shared piece: `useSchemaForm` + `HarnessSchemaForm.vue`, built in Phase 5 (also used by interrupt cards; Phase 9
reuses it for tool arguments).

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

Not done: argument-based label templates (not planned). Agent presentation titles as labels: Phase 11.

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

## Phase 5: Plugin config schemas, persisted values, settings tab (implemented 2026-11-10)

Extends `config` / `$config`; nothing replaces them.
- `CuratorPluginDefinition.configSchema` (JSON Schema per namespace; `x-curator-scope`: where a key may be saved,
  default system; `format: 'secret'`: `secret://NAME` references only). `CuratorEngine.configSchemas` collects them
  (the first plugin to declare a namespace owns it).
- `PluginConfigValue` table in the three curator schemas and the server's `core.prisma`; scope keys are never NULL
  (system = `('system', '')`, project = `(projectId, '')`, user = `(projectId, userId)`) so the unique key with
  `existent` holds; MariaDB columns sized to fit InnoDB's key limit. `schema.sql` regenerated; provisioners create
  the table on start.
- `PluginConfigService` (built-in processor service `PluginConfig`): Ajv validation, `set` / `unset` (soft delete) /
  `resolve` / `describe`. `$config` in workflows now resolves per request: defaults < system < project < user, frozen,
  cached 5 s per (project, user), invalidated on writes. A database without the table keeps running on defaults.
- Tools `config_get`, `config_set`, `config_unset`: project and user from the session; saving needs a person; project
  scope needs role `config:project`, system scope `config:system`.
- Console: `useSchemaForm` + `HarnessSchemaField` / `HarnessSchemaForm` (string, text, number, integer, boolean,
  enum, secret reference, JSON fallback), `usePluginConfig`, and a Settings tab (per key: source, default, field,
  scope, Save, Reset). `HarnessInterruptCard` uses the form for object `resumeSchema`s.

Follow-ups: `server` module `db:push` for the new table (with the earlier pending push); roles `config:project` /
`config:system` have to be assigned to the people who may save at those scopes.

Tests: `curator/test/engine/plugin-config.test.ts` (precedence, validation, unset, describe, `$config` per project,
tool authorization), `packages/curator-console/test/settings.test.ts`.

## Phase 6: Agent presentation and capability flags (implemented 2026-11-10)

- `CuratorAgentDefinition.presentation: { title, description, icon, starterPrompts }`.
- `ILlmProvider.capabilities` (+ optional `capabilitiesFor(model)`): `tools` (native | prompt | none), `vision`,
  `json`, `streaming`, `embeddings`; `llmCapabilities(provider, model)` = defaults < provider < model (a provider with
  `embedContent` has embeddings). Declared by the OpenAI-compatible, Anthropic and Gemini providers.
- `agentCatalog.ts`: `describeAgent(name, def)` (title/description/icon/starter prompts with fallbacks, and the
  capabilities of the agent's entry `Curator_Agent` node; `tools: 'none'` when it offers no tools; `dynamic` for
  `$`-expression provider/model; null for workflows without a model step).
- No new catalog tool: the existing `agents` query returns `title`, `icon`, `starterPrompts`, `capabilities`
  (`packages/server`; gallery also for stored agents, merged with the plugin definition by name). The console falls
  back to the old query on servers without them.
- Console: the agent picker shows title, description, icon and capability icons (tools, vision, disabled); the
  selected agent's starter prompts appear as chips in the empty output (same chips as `<suggest>`).

Changed from the plan: per-model overrides come from the provider (`capabilitiesFor`) instead of a new
`AIModel.capabilities` column, and presentation of agents created in the database (no plugin definition) waits for an
`Agent.metadata` column; both avoided a schema change.

Tests: `curator/test/engine/agent-catalog.test.ts`.

## Phase 7: Prompt-based tool calling (implemented 2026-11-10)

- `src/engine/llm/promptToolCalling.ts`: `toPromptToolRequest` (tool schemas and the `<tool_call>` protocol into the
  system prompt, `tools` removed, earlier calls and tool results rewritten as text turns), `parsePromptToolCalls`
  (`<tool_call>` blocks, or fenced JSON naming an offered tool; Ajv-validated against the tool schema; unknown tools
  rejected), `generateWithPromptTools` (one corrective retry, then the errors appended to the reply as text and no
  calls), `resolveToolCalling`.
- Agent option `tool_calling: 'auto' | 'native' | 'prompt'` (AST + validation). `auto` follows
  `capabilities.tools`; the OpenAI-compatible provider reports `prompt` when `CURATOR_LOCAL_TOOL_CALLING=prompt`.
- In `nodes/agent.ts` the mode only changes how the model is called (inside the traced call, after the inlet hooks):
  the response carries standard `toolCalls`, so the tool loop, access checks, guardrails, progress events and history
  are unchanged.

Tests: `curator/test/engine/prompt-tool-calling.test.ts` (mode, parser incl. invalid calls, conversion, retry, an agent
run in prompt mode).

## Phase 8: Output panel (implemented 2026-11-10)

- Host contract `contracts/surfaces.ts` (shared, browser-safe): `CuratorSurface` (built-ins `resource-collection`,
  `resource-detail`, `table`, `markdown`, `code`, `json`, `mermaid`, `html`, `svg`, `image`, plus `data`),
  `extractSurface` (explicit `uiSurface` / `surface`, or a surface-shaped result; no guessing), `surfaceTable`,
  `describeSurface`, `surfaceToText` (CLI tables), `textPanelBlocks` (fenced mermaid/html/svg/json blocks and Markdown
  tables in agent text). The console's `HarnessUiSurface` now uses its component names and `data`.
- Console:
  - `useSurfaces()`: the session's surfaces (newest first; same request, or same client-opened component and title,
    replaces), active surface, `rebuildFrom(requests)` after a reload from stored responses. `uiSurface` and
    `worktableSurface` are now its active surface.
  - `HarnessSurfacePanel.vue`, used by both the 2-column worktable and the output's UI Surface tab: earlier surfaces
    in a dropdown, close, renderer = `customComponents[name]` (miniapps can override built-ins), then the built-in,
    then resource views; unknown components show their data as JSON.
  - Built-in renderers (`components/surfaces`, lazy): table (`v-data-table-virtual` with filter), markdown, code /
    json (copy), mermaid (`securityLevel: 'strict'`, falls back to source), html / svg (iframe `sandbox="allow-scripts"`
    without `allow-same-origin`, CSP `default-src 'none'`), image (data URLs and same-origin only).
  - Agent text renders as Markdown (`HarnessMarkdown`: `marked` with raw HTML dropped, DOMPurify, links in a new tab
    with `noopener`; plain text if the libraries aren't installed) with "Open …" chips for its diagrams, pages, JSON
    and tables. The latest turn and each Turns entry (`TurnHistoryEntry.surfaceId`) show a chip for their surface.
  - The `items` / `galleryItems` / `resources` guess in `applySurfaceIfPresent` was removed in Phase 11.
- CLI: `ClientShell.printSurface(payload)` (used by `exec`): tables as aligned text, others as a one-line description.
- Dependencies: `@curator/console` now lists `marked`, `dompurify` and `mermaid` (needs `pnpm install`).

Surface formatters through plugin `formatters` / `toolOutput`: Phase 11.

Tests: `packages/host/test/surfaces_contract.test.ts` (extraction, tables, text, panel blocks, CLI),
`packages/curator-console/test/surfaces.test.ts` (`useSurfaces`, image sources, sandbox document).

## Phase 9: Composer `/` and `@` on the shared command list (implemented 2026-11-10)

- Host contract `contracts/commands.ts` (shared, browser-safe): `CommandDescriptor` (tool-contract shaped + `source`:
  command | tool | choice | agent), the tokenizer and tool-argument coercion moved here from `clientShell.ts`
  (`toolArgsFromTokens`, `toolUsage` still exported from the shell), `findComposerTrigger` (`/` at the start, `@` at a
  word start), `matchCommands` (prefix matches first, then names/titles containing the query), `parseComposerInput`
  (command / tool with args and missing required args / choice / agent message / text / unknown), `completeLine`.
- CLI: `ClientShell.commandCatalog()` (registered commands, help/exec, local and remote tools, current choices,
  config `agents`), Tab completion from it, `@agent message` routed to config `onAgentMessage` (or speech) when the
  app lists agents; unknown agents are reported.
- Console:
  - `useCommandCatalog` (harness verbs `HARNESS_COMMANDS`, tools, choices, agents); the context menu's verbs come
    from it.
  - Composer popup in the agent prompt (`HarnessOpPrompt`): suggestions for `/` and `@` at the cursor, arrow keys,
    Enter/Tab to pick, Escape to close; picking a choice selects it in the choice bar.
  - Submitting: `/verb` runs the harness command; `/tool args` runs the tool through `executeTool` (shown as a tool
    turn); missing required arguments open `HarnessToolArgsDialog` (form from the tool's schema); `/1` or
    `/<choice value>` answers the choice; `@agent message` sends the message to that agent; unknown names are errors.
  - Suggestion chips (`<suggest>`, starter prompts) starting with `/` or `@` go through the same parser.
  - The Agent/Tool/AST mode toggle was removed in Phase 11.

Not done: `#` attachments (Phase 11).

Tests: `packages/host/test/commands_contract.test.ts` (triggers, suggestions, parsing, CLI catalog, completion,
`@agent`), `packages/curator-console/test/commandCatalog.test.ts`.

---

## Phase 11: Smaller deferred items (in progress, 2026-11-10)

Chosen: `#` attachments, source chips, prompt library; cleanups: agent titles in labels, removal of the deprecated
shims, surface formatters. Not chosen now: conversation organisation, channels.

- Agent titles in labels (done): `stepProgressLabel(ast, resolveTool, resolveAgent?)` labels an agent step with its
  definition's `presentation.title`, else its `agentName`; the processor passes `engine.agents`.
- Deprecated shims removed (done): the Agent/Tool/AST toggle is gone. The prompt is the agent composer (`/tool args`
  and the argument form replace tool mode; "use tool" from the Tools tab and the context menu opens that form, with
  pending uploads filling `files` / `photo` / `photoUrl` when the schema declares them). The CoffeeScript editor is
  opened from the workflow studio and left with "Back to prompt". Removed: `selectedTool` / `toolArgsInput` (context
  and `HarnessOpPrompt` props), `HarnessDeck`'s `execMode`, the `items` / `galleryItems` / `resources` surface guess.
- Surface formatters (done): output target `surface` (`ToolOutputSpec.surface`, also in AST `tool_output`), built-in
  `surface` formatter (`surface:table`, `surface:resources`, `surface:markdown` / `code` / `json` / ...,
  `{ use: 'surface', args: { component, title } }`), `OutputFormats.surfaceForToolResult`. A direct tool run
  (`runToolRequest`, so `host.runTool`, GraphQL `executeTool`, MCP) whose object result has no `uiSurface` gets one
  from the rules; other results are unchanged.
- `#` attachments (done): composer trigger `#` (word start; `ComposerTrigger.trigger` `'#'`, `CommandDescriptor.source`
  `'resource'`, `matchCommands` offers only resource entries for it). Console `useAttachments`: suggestions from
  `search_resources` (debounced, latest query wins), picked resources become chips above the prompt (not inline
  text); on send each chip runs the new core tool `attach_resource` (readable scope only; links it to the
  conversation through `ConversationResources`; returns title and a 4000-character text excerpt), and the prompt gets an
  "Attached:" block (`promptWithAttachments`); the speech payload carries `resources: [{ uri, title }]`. Offered only
  when the user may run both tools. Not done: `#` in the CLI (no resource search in the shell yet).
- Source chips (done): `useSources` lists the latest run's tool calls (`toolSourcesOfRun`, from `RunStep.calls`,
  coloured by outcome) and the resources attached to that turn, as chips under the answer in `HarnessOutput`. A tool
  chip opens the stored result the model read (the n-th `[Tool Result: …]` response of the agent step's request,
  `toolResultAt`, via `curatorRequest(id)`): JSON as a json surface, else Markdown. A resource chip opens its text
  (`get_resource`). Latest turn only (turn history entries keep no chips).
- Request access (done): `curatorRequests` / `curatorRequest` (shared server and gallery) return only what
  `AccessService.requestScopeWhere` allows: the caller's project, its sub-projects and `system`; only the caller's own
  requests unless it may perform `requests.read_all` (role `curator:requests:read`, seeded; super-admins pass); no user,
  nothing. `curatorRequest(id)` now converts the id (it failed before: string id on an integer column). Keeris already
  limits its request list to `curator_manager`.
- Prompt library (done): table `SavedPrompt` (all four schemas: `projectId` default `system`, `name`, `title`,
  `description`, `text` with `{name}` placeholders, `arguments` Json, `createdBy`, `existent`; unique
  `[projectId, name, existent]`, deleted rows `existent` NULL). Core tools `prompt_list` / `prompt_get`
  (`agent:reader`) and `prompt_save` / `prompt_delete` (role `prompts:write`, seeded); the project comes from the
  session, parent-project prompts are visible in sub-projects (nearest of a name wins), `system` prompts everywhere.
  Contract: `CommandDescriptor.source` `'prompt'` (after `/`, parsed like a tool), `promptParameters(arguments)`.
  Console `usePromptLibrary`: saved prompts and MCP prompts (`mcp_prompts_list` / `mcp_prompt_get`, a clashing
  name gets `<server>.<name>`) as `/` entries, each source only when its tools are allowed; `/name args` fills the
  prompt box for review (missing arguments open the form); `/save-prompt` opens the `prompt_save` form with the
  prompt text (offered only with `prompt_save`, `HARNESS_COMMAND_TOOLS`). CLI: `ClientShell` config `prompts()` and
  `renderPrompt(name, args)`; `/name args` is filled and sent like a typed message. Needs: the server module's
  `db:push`, and apps wiring `prompts` / `renderPrompt` in their shells.

## Phase 12: Conversation organisation (done 2026-11-10)

- Schema (all four): `Conversation.title` (null: the first message is shown), `pinnedAt`, `archivedAt`; index
  `[projectId, userId, existent]`.
- Core tools (people only, project from the session, role `conversations:own`, seeded): `conversation_list`
  (`archived`, `query`, `limit`; pinned first, then the newest request; untitled ones show the first root request's
  message), `conversation_rename` (empty title: back to the first message), `conversation_pin`, `conversation_archive`
  (archiving unpins), `conversation_delete` (soft: `existent` NULL + `deletedAt`; not the conversation the call runs
  in). Someone else's conversation answers "not found".
- Access is decided only by `conversationAccess(userId, projectId)`: the owner today.
- Console: `useConversations` and a Conversations tab (shown with `conversation_list`): search, active/archived,
  rename inline, pin, archive/restore, delete (confirm; not the open one); opening a conversation sets the console's
  conversation id for later turns.
- Blueprint: `listChats` shows titles, leaves archived chats out and puts pinned ones first.

### Channels: backend (done 2026-11-10)

A channel is a conversation with members, like a poker table. Joining and leaving are controlled by the AST: the
conversation's workflow decides; people and the console only send request events.

- Schema (all four): `ConversationMember` (`memberType` user | agent, `memberId`, `conversationalRole`, per-member
  `pinnedAt` / `archivedAt`, `joinedAt`, `leftAt`, `existent`; unique `[conversationId, memberType, memberId,
  existent]`). Leaving sets `leftAt` and `existent` NULL (history kept; rejoining adds a row).
- Engine: event handlers get `context.emittedBy` (`userId`, `agentId`, `projectId` of the event's sender), set by the
  engine, never from the payload. Handlers still run as the script's owner.
- `conversation_join` / `conversation_leave` (workflow steps): refuse direct runs (console, CLI, GraphQL, MCP:
  `literalArgs`); without `agentId` they act on the event's sender; for a stored conversation in the sender's project
  they add / end the member row; users join live sessions as `user:<id>`. `agentId` is optional now.
- `access_check` (core tool, read-only): whether the event's sender (else the caller) holds a `role` or may perform an
  `action`; returns `{ allowed, reason }` for workflow conditions. Action `channels.join` (role `channels:join`, seeded).
- Events: `conversation:join_requested`, `conversation:leave_requested`, `conversation:join_denied`.
- Default channel workflow `conversation_channel_workflow` (registered by the conversation plugin): on a join request,
  `access_check(channels.join)` and the conversation must be an open channel (`$state.channel.open`, set by the
  workflow that runs it); then the sender joins as `member`, else `conversation:join_denied` with the reason. On a
  leave request, the sender's membership ends. Apps replace the policy with their own workflow (seats, invitations,
  approval).
- Organisation: `conversationAccess` = owned conversations or channels the user is a member of; the list shows
  `owned` and `memberCount`; a member pins / archives the channel for themselves (member row); renaming and deleting
  stay with the owner.
- Found: the expression translator rewrites the word "not" inside string literals (and adds safe navigation itself,
  so `?.` must not be written). Worth fixing separately.

Not done (next): the console channel view (channels in the list with Join / Leave buttons sending the request
events, the shared message stream), CLI join / leave commands, invitations.

## Cross-cutting

- Rebuild `packages/host` / `curator` before testing miniapps (blueprint, gallery, keeris).
- New tables follow database rules (`existent` in unique keys); new tools are project-scoped and run via
  `host.runTool`.
- Docs per phase: `packages/curator-console/README.md`, `curator/CURATOR_AST.md`, `docs/SCRIPTING_REFERENCE.md`,
  plugin authoring docs (guardrail hooks, `configSchema`, `presentation`, `ui` tool field, surface formatters).

## Phase 10: Resource access on the existing role model (planned)

Open WebUI's per-item private/group/public grants are not adopted. Curator already has the model we want; this phase
closes its gaps instead of adding a grants system.

### Rules (decided 2026-11-10)

- Scope is the project. Access is given to roles only, never to a user directly.
- Allow-list only: nothing is allowed until a role allows it. No "no rule means allowed" defaults, no fail-open.
- Bottom to top = narrowing: rights can only shrink as work is passed down a chain (user → agent → sub-agent, parent
  project → sub-project), never grow.
- A role given in a parent project is inherited by its sub-projects, unless the sub-project narrows it.

### What exists (kept)

- `Role` (global or per project), `UserRole` (optionally per project), `AgentRole`, `RoleInheritance` (a role
  includes sub-roles), `ProjectRole` (a project's allowed roles), `ToolRole`, tool `requiredRole` / `accessLevel`.
- `AgentRoleService.validateActorToolAccess`: no roles = denied; allowed by `requiredRole`, `ToolRole` or a
  `tool:<name>` role name. Secrets the same way (`secret:<name>`, `secret:read:<name>`, `secret:*`).
- The agent node offers the model only tools its actor may call.

### Changes

1. **Fail closed.** `checkToolRoleAccess` returns allowed on an error or without a database; deny instead (reason in
   the `TOOL_BLOCKED` response). Tests that run without a database get an explicit test-only actor, not a default.
2. **Narrowing along the chain.** When a user or a parent agent drives an agent, the effective rights are the
   agent's rights ∩ the caller's rights (tool allowed only when both are allowed). The caller is the request's
   `userId` (set by the host from the session, never from the payload; it propagates to child requests).
   Scheduled agent runs carry the agent's owner as `userId`, so they are narrowed by the owner's rights.
3. **Project inheritance downward.** A `UserRole` / `AgentRole` given in project P also counts in P's sub-projects
   (`getProjectAncestorIds`). A sub-project narrows by listing its allowed roles in `ProjectRole` (existing rule:
   when a project lists roles, only those count there). A sub-project can never add a role its user does not hold.
4. **Agents are role-controlled.** `agent:<name>` role name (and optional `requiredRole` on the agent definition,
   like tools) decides who may address an agent. Checked when a request targets an agent (speech, `@agent`,
   `runAgent`, sub-agent spawn).
5. **One check for lists and calls.** A shared `AccessService.canUse(actor, kind, name)` (tool / agent / secret, later
   `mcp:<server>` and resource kinds) used by `host.runTool`, the engine, GraphQL `tools` / `agents`, MCP
   `tools/list` and `tools/call` (from the roles `actorMapper` already resolves) and the console composer list. Users
   only see what they may use.
6. **Remove `Permission` / `RolePermission`** (redundant with role names). Stop reading them in
   `validateActorToolAccess` / `resolveActorPermissions` and stop writing them in tool sync,
   `plugin-mcp-client` (`McpRemoteRegistry`), `federation` (`PeerSessionResolver`) and `server` (`agentic.ts`);
   existing rows become role names (`tool:<name>`) in a one-time migration. Keep the tables one release
   (`@deprecated`), then drop them from the MariaDB, Postgres and server schemas.

### Progress

- Step 1 (engine: 1, 2, 3, reads of 6) done 2026-11-10: `AgentRoleService.validateActorToolAccess` denies without a
  database, checks an agent and the user it acts for separately (both must allow), counts project roles in
  sub-projects (`getProjectAncestorIds`), applies every `ProjectRole` list up the chain (nearest first), no longer
  reads `RolePermission`; `SUPER_ADMIN_ROLES` constant. `validateAgentSecretAccess` fails closed and no longer reads
  permissions. The processor's role check denies on error; its `Permission` check and `resolveActorPermissions` are
  removed (tool sync still writes `Permission` rows until the write side of 6). Tests: `tool-access.test.ts`
  (narrowing, downward inheritance, sub-project narrowing).
- Step 2 (4 and the shared check) done 2026-11-10: `AccessService.canUse(prisma, actor, 'tool' | 'agent' | 'secret',
  name, policy)` and `filterUsable` (exported from `curator`); `AgentRoleService.resolveEffectiveRoles` (shared role
  resolution) and `validateAgentAddressAccess`. Agent definitions get `requiredRole`. The processor checks addressing
  on a run's first request with an agent (no `parentId` / `createdBy`): refused runs fail with an `AGENT_BLOCKED`
  response. Allow-list: an agent without `requiredRole` is addressable only by super-admins and `agent:<name>` /
  `agent:*` holders.
- Step 3 (5: listings) done 2026-11-10: `@curator/server` GraphQL `tools` / `tool` / `agents` / `agent` show only
  what the actor may use (`createCuratorResolvers(host, custom, { actor })`, default: the host session's user and
  project; roles read from `definitionsPrisma`). Gallery filters `tools` for the signed-in user; its `agents` query
  takes `usable: Boolean`: unfiltered for the agent management page (protected by the gallery auth wrapper),
  filtered with `usable: true`, which the console asks for, so pickers and `@` suggestions show only addressable
  agents. The shared schema accepts `usable` too (always filtered). MCP:
  `McpToolRegistry.setAccessCheck` / `listFor`; `tools/list` shows only tools the caller (or the host session) may
  run, a failing check hides the tool; `tools/call` was already checked by the engine via `host.runTool`. The
  console composer reads these lists, so it needs no change. Blueprint's `web_assistant` and `history_summarizer`
  get `requiredRole: blueprint_user`.
- Step 4 (writes of 6, docs) done 2026-11-10: `Permission` / `RolePermission` are no longer written (processor tool
  sync, `plugin-mcp-client`) and are dropped from the MariaDB, Postgres and server schemas (and `schema.sql`), as are
  the server's GraphQL `Permission` type and `Role.permissions`. Existing databases keep the old tables (convergence
  is additive) until they are dropped by hand. No row migration: the old tool
  check never loaded these rows (only the removed extra check could deny), so turning them into grants would widen
  access. Federation `allowedTools` now become `tool:<name>` sub-roles of the peer role (RoleInheritance). Docs:
  `MINIAPP_SETUP_GUIDE` (narrowing, agent access, roles-only grants, project inheritance), `AGENT_GUIDE` 4.4.

- Step 5 (host actions) done 2026-11-10: `AccessService` kind `'action'` with `CURATOR_ACTION_ROLES`
  (`db.status` → `curator:db:status`, `db.export` → `curator:db:export`, `db.import` → `curator:db:import`; unknown
  actions super-admin only), roles seeded by `ensureDefaultRoles`, `allowedActions` query (shared server and
  gallery). Checked: `curatorDatabaseHealth`, `GET /api/curator/db/export`, `POST /api/curator/db/import`
  (`CuratorRouterOptions.actorFor(req)`, default host session). Console: `/status` and `/export` are offered only when
  allowed (`HARNESS_COMMAND_ACTIONS`, `isCommandAllowed`) and refused otherwise; database health loads only with
  `db.status`. Decided: `/pause`, `/clear`, `/layout`, `/workflow`, `/resources` need no role (they change the screen
  or engine state, not data, and reveal nothing beyond the project). The in-browser export of a local WASM database
  (keeris adapter) is the user's own file and is not role-controlled.

### Order

Engine (1, 2, 3, 6 reads) → `AccessService` + engine/host use (4, 5) → server/GraphQL and MCP lists → console →
consumers of `RolePermission` (6 writes) → docs (`AGENT_GUIDE`, plugin authoring: roles and `agent:<name>`).

### Open points

- Super-admin role names are a hard-coded list (`admin`, `system:admin`, `curator_admin`, ...); move to one
  constant, keep the behaviour.
- Plugin-declared roles (`roles`, `defaultUserRoles`) stay as they are; they only seed `Role` / `UserRole` rows.

## Decisions (2026-11-09)

- Plugin config scopes: `system` / `project` / `user`.
- `@curator/console` may add `marked` + `dompurify` and a lazy-loaded `mermaid` (Phase 8).
- Arena/leaderboard and the auxiliary task model are not adopted; branch navigation waits for a relational tree
  pattern.
- (2026-11-10) Resource access: project scope, roles only (no direct user grants), allow-list only, narrowing down
  the chain, parent-project roles inherited by sub-projects unless narrowed; `RolePermission` is removed (Phase 10).
