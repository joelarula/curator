# Curator engine evolution plan

Adapting LangGraph patterns (persistence, subgraphs, fault tolerance, interrupts, streaming) to Curator's
AST-and-database runtime. Each item builds on an existing mechanism rather than adding a parallel one.
Every phase follows the workspace change order: engine → AST validation/builder → Mermaid → docs
(`curator/CURATOR_AST.md`, `docs/SCRIPTING_REFERENCE.md`), with targeted tests.

## Current state (2026-11-09)

| Area | What exists | Gap |
|---|---|---|
| Checkpoints | Event-sourced state (`ConversationStateLog.ts`): `__state.patch`/`__state.rewind`, `stateAt`, `rewindState`, `listStateEvents` | State events don't set `EventLog.source`; rewind is in place only, no fork; no tool/CLI surface |
| Parallel merge | Branch output shallow-merged into shared state in `completeRequest`; `isolate` → private scopes | Same key from two branches = last finisher wins; isolated scopes never merge back; Join concatenates text |
| Composition | `Curator_Module` + `Curator_Call` (params, `returns`, `as`) | Callee runs unscoped, so its intermediate writes leak into caller state; param `type` not validated; no output contract |
| Fault handling | Rate-limit errors retried 5× with exponential backoff (`CuratorRequestProcessor.processRequest` catch) | Hardcoded and runtime-wide; any other error fails immediately; no node timeout |
| Pause/resume | `Curator_HumanInput`, `Curator_WaitEvent` (+`waitDeadline`), tool approval (`pendingToolCall`), `Curator_Interrupt` | Each uses its own context keys and resume path (`contextPatch`, `__humanInputReceived__`, `interruptHandled`); no common payload or typed resume value |
| Fan-out/fan-in | `Curator_Parallel` + `Curator_Join`; `poisonDownstream` lets Join run if ≥1 branch succeeded | Partial-failure policy implicit; no per-branch result shape; no cancel-siblings option |
| Runtime vs state | `ctx.service` / `ctx.tryService`; `STATE_PATCH_KEY` keeps state copies out of stored context | Request `context` is persisted wholesale (e.g. `sessionId`); no declared boundary for non-persisted values |
| Progress | `onEvent` emits `request_start`, `request_done`, `request_poisoned`, `database_change`, `log`; StepTrace; LlmCall trace | No typed, versioned stream; clients infer progress from request rows/logs |

## Priority order

1. **Node fault policies** (Phase A): small, self-contained, operationally valuable.
2. **Structured pause/resume** (Phase B): unifies four ad-hoc wait mechanisms; fork/replay later records resume values through it.
3. **Checkpoints, fork & replay** (Phase C).
4. **Merge rules + fan-out/fan-in semantics** (Phase D).
5. **Composition contracts** (Phase E).
6. **Runtime context boundary** (Phase F) and **progress stream** (Phase G): can run in parallel with C–E.

---

## Phase A: Per-node fault policies (implemented 2026-11-09)

AST (on `CuratorBaseNode`, so every node can carry it); reference: `curator/CURATOR_AST.md` §12.

```ts
retry?: {
  maxAttempts?: number;            // default 3 when declared; nodes without `retry`: rate limits only, 6 attempts
  backoff?: { initialMs?: number; factor?: number; maxMs?: number; jitter?: boolean };
  retryOn?: string[];              // classes rate_limit | timeout | transient | tool_error | error, else a message regex
};
timeoutMs?: number;                // wall-clock limit for one attempt
```

- The fallback after exhausted attempts is the existing `onError` (no new `onFailure` field).
- `src/engine/FaultPolicy.ts`: `classifyError`, `decideRetry`, the default policy (the old hardcoded rate-limit rule). One decision for thrown errors and for handlers calling `failRequest` on their own attempt.
- Retries reuse `retryCount` + `scheduledAt` (no schema change), are recorded as StepTrace `RETRY` rows and `request_retry` events. An attempt that created requests is never retried.
- Timeouts: each attempt runs in an `AttemptScope` (async context) with an `AbortController`; `ctx.abortSignal()` reaches LLM providers (`LlmRequest.signal`, incl. the Gemini plugin) and tools (`toolContext.signal`). An abandoned attempt's engine writes throw `AbandonedAttemptError`.
- Tools with a `retry` policy fail on a throw (`ToolExecutionError`, keeping the cause's class); without one they still complete as `[Tool Error]`.

Not done in A (follow-ups):
- Script-level defaults (`Curator_Module.defaults.retry` / `timeoutMs`).
- Crashed workers: covered by existing stale-lock recovery, not by `timeoutMs`.
- Writes through `ctx.prisma` (outside the engine's store/state/response methods) are not blocked for abandoned attempts.
- CoffeeScript DSL verb and Mermaid annotation for policies.

## Phase B: Structured pause/resume (implemented in curator core 2026-11-09)

Reference: `curator/CURATOR_AST.md` §13; code: `src/engine/Interrupts.ts`, `src/tools/interrupts.ts`.

- Envelope `CuratorInterrupt` (`v`, `id` = `<requestId>.<n>`, `kind` = `human_input | approval | event`, `prompt`, `payload`, `resumeSchema`, `targetUserId`, `deadline`) stored in `context.__interrupt` by HumanInput, WaitEvent, gated Tool nodes and gated agent tool calls. The handler-specific keys stay as they are (internal, not public symbols), so nothing needed deprecating.
- Tools `conversation_interrupts` / `conversation_resume` (repo naming, not `conversation.*`), backed by the processor's `InterruptService`; project scope from the session; resume refused for agent actors.
- AST: `resume: { schema }` on HumanInput / WaitEvent (`as` / `payloadAlias` already exist). Approvals use a fixed schema `{ approved, scope?: ONETIME|CONVERSATION|PERMANENT, reason? }`.
- New: denying an approval (`APPROVAL_DENIED`, governed by `onApprovalExpired`). Event-wait resume binds the value without publishing the event.
- Resume values are logged as `curator:interrupt_resumed` bus events for Phase C replay. Bus events are retired by age (30 days), so replay of older runs needs them copied with the fork data.

Not done in B (follow-ups):
- `pause` kind: `Curator_Interrupt` pause/play suspends other requests and resumes them itself; no human resolves it, so it has no interrupt yet.
- Migrate clients to `conversation_resume`: the server `approveRequest` resolver (and a deny mutation), both CLIs (they write Response rows directly), frontend.
- Agent tool-call denial fails the agent step; feeding the denial back to the model as a tool error would let it continue.

## Phase C: Checkpoints, fork & replay

1. Stamp `EventLog.source = requestId` on state events (thread the id through `writeState`).
2. `listCheckpoints(conversationId)`: finished steps from StepTrace with the state seq after each. Host tools `conversation.checkpoints`, `conversation.state_at`.
3. Stable step identity: `__step` key set in `createValidatedRequest` (parent step key + child index + loop iteration). Today only reference-mode requests have one (`astPath`).
4. `forkConversation({ conversationId, atRequestId | atSeq, statePatch?, input?, scriptVersion? })` (newer versions allowed, see Decisions):
   - new conversation in the same project, seeded with one patch (state at that point + overrides), plus a non-state `__fork` lineage event (so `Conversation.metadata` stays a pure state view);
   - re-runs the root script; steps before the fork point (matched by `__step`) return their recorded outputs, recorded resume values (Phase B) are reused;
   - **side-effect safety**: replayed tool calls never execute; after the fork point tools run normally with approval/RBAC.
- **Decided (2026-11-09): fork re-runs the script and reuses recorded outputs**, instead of copying the live request tree (which would mean rebuilding notify chains and fan-in counters).

## Phase D: Merge rules + fan-out/fan-in semantics

State schema (on `Curator_Module`, overridable per `Curator_Parallel`):

```ts
stateSchema?: Record<string, { merge: 'replace'|'append'|'concat'|'sum'|'max'|'min'|'deepMerge'|'union' | { reducer: string } }>;
strict?: boolean;                  // default true: fail when two branches write the same undeclared key
```

- Applied inside `appendStateEvent` (already holds the row lock and has the previous state). The event stores the resolved `set` plus the rule names used, so fold/rewind/compaction stay unchanged and deterministic.
- `isolate` branches: `mergeBack: true` merges the private scope into shared state through the schema at the Join.

Fan-out/fan-in contract on `Curator_Parallel`:

```ts
join?: {
  as?: string;                                   // structured result: { [branchName]: { status, output, error? } }
  requires?: 'all' | 'any' | { min: number };    // default 'any' (today's behaviour)
  onBranchFailure?: 'continue' | 'cancel_siblings' | 'fail_fast';
  timeoutMs?: number;                            // unfinished branches are cancelled, reported as 'timeout'
};
```

- Text concatenation stays the default Join output for compatibility; `join.as` adds the structured form.
- `poisonDownstream` reads the policy instead of the hardcoded "≥1 success" rule.

## Phase E: Composition contracts

- Callee runs in its own scope (`call:<callerId>`): it still reads shared state, but only `returns`/`as` flows back. Opt-in first (`stateIsolation: 'scoped'`), since it changes existing behaviour.
- Ajv validation of `params` types; optional `output` schema on modules.
- Builder helper to run a module on its own with given params (isolation tests).

## Phase F: Runtime context separate from workflow state

- Split request context into **persisted** (business state, step bookkeeping) and **runtime** (services, credentials, trace ids, session handles), the latter provided per execution via `NodeContext.runtime` and never written to `Request.context`, Responses or state events.
- A `withoutStoredStateCopies`-style Prisma extension strips a reserved `__runtime` key on write, as a backstop.
- Scripts read runtime values via `$runtime.x` in expressions; secrets resolve through `SecretService` handles, never values.
- Audit current context keys (e.g. `sessionId`) and move the infrastructure ones over with a deprecation read path.

## Phase G: Progress streaming as a stable API

- One typed, versioned event union published through `host.emitEvent` / `CuratorHostEvents`:
  `step.started | step.completed | step.failed | step.retrying | token | wait.opened | wait.resumed | run.completed | state.changed`
  each carrying `{ v: 1, conversationId, requestId, step, nodeType, ts, ... }`.
- Sources: existing `onEvent` emits, StepTrace records, Phase A retries, Phase B interrupts, state projectors (`registerStateProjector`) for `state.changed`, LLM streaming for `token`.
- Keep the current event names as aliases for one release; export the type from `@curator/host/contracts`.

## Decisions (2026-11-09)

- **Fork onto newer script versions: allowed.** `forkConversation` takes an optional `scriptVersion` (default: the original). Replay matches steps by `__step` and also compares a hash of the step's AST: from the first step whose AST changed (or is new), execution goes live. So an improved script reuses everything before the first changed step.
- **Strict merge: on by default.** Applies at once to modules that declare a `stateSchema`. Modules without one log a warning on conflicting writes for one release, then strict becomes the default everywhere (`strict: false` opts out).
- **LLM timeouts: abort, then fail.** When `timeoutMs` passes, the provider request is aborted (no further cost) and the attempt counts as a `timeout` error. If the node's retry policy doesn't cover `timeout`, or the attempts are used up, the step ends `FAILED` and normal failure handling runs (`onError` branch if set, otherwise downstream poisoning/Join policy).
