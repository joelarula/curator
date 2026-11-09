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

## Phase C: Checkpoints, fork & replay (implemented in curator core 2026-11-09)

Reference: `curator/CURATOR_AST.md` §14; code: `src/engine/TimeTravel.ts`, `src/tools/timeTravel.ts`.

- **Decided (2026-11-09): fork re-runs the script and reuses recorded outputs**, instead of copying the live request tree (which would mean rebuilding notify chains and fan-in counters).
- State events record their step (`EventLog.source`, via `appendStatePatch(..., { source })`; `writeState` defaults to the running attempt).
- Step identity changed from the planned `__step` counter (Graph/Loop rebuild their own context across runs, so a counter kept there is lost) to **lineage**: `__createdBy` on every request; a path is the k-th request a creator created. Forks count children with `__fork.spawn` events in their own EventLog.
- **Decided (2026-11-09): replay records live in StepTrace** (new nullable columns `createdBy`, `astHash`, `context`, `statePatches`; `output` now also holds replayable steps' results), because retention trims request contexts and compacts event logs. Schema change in curator's three schemas and `server/prisma/schema/core.prisma`; `schema.sql` regenerated.
- Replay applies to agent, tool, reducer, human input and event-wait steps that finished no later than the fork point (by StepTrace time, then id: creation order is not execution order). Control flow re-runs. A mismatch before the fork point stops the fork (diverged), unless the fork runs a different script version.
- Tools `conversation_checkpoints`, `conversation_state_at`, `conversation_fork` (fork: humans only), backed by `TimeTravelService`.

Not done in C (follow-ups):
- Server: run `db:push` / regenerate for the new StepTrace columns.
- Forks are possible only within StepTrace retention (default 7 days) and for runs recorded after this change.
- StepTrace is batched per worker: rows still buffered on another worker are not seen by a fork made right away; a lost row makes that step diverge.
- Script nodes and plugin node types re-run in forks (scripts may spawn subtrees; their VM has no network by default).
- Agent tool calls made inside an agent step are not separate steps; the agent step replays as a whole.

## Phase D: Merge rules + fan-out/fan-in semantics (implemented in curator core 2026-11-09)

Reference: `curator/CURATOR_AST.md` §15; code: `src/engine/StateMerge.ts`, `nodes/parallel.ts`, `nodes/join.ts`, `nodes/joinTimeout.ts`.

- `stateSchema` on `Curator_Module` and `Curator_Parallel` (branch rules over the module's, nested parallels over their parent's). Rules: `replace`, `append`, `union`, `sum`, `max`, `min`, `deepMerge`, `{ reducer }` (`concat` dropped: `append` covers lists).
- Applied in `appendStatePatch` under the state lock; events store resolved `set`, `merge` (rule per key) and `incoming` (as written, for replay). Fold/rewind/compaction unchanged.
- Writes carry their branch (`payload.branch = { join, name }`); conflicts are detected **at the Join** from the events written while the branches ran (failing a branch mid-completion would have stranded its Join). `strict` defaults on when a schema applies, else a warning, per the decision.
- `mergeBack` for isolated branches; `join` contract (`as`, `requires`, `onBranchFailure`, `timeoutMs`) as planned. `poisonDownstream` reads the policy; timeouts use a scheduled internal `Curator_JoinTimeout` request.
- `name` is now a base property of every node (branch names).

Not done in D (follow-ups):
- Make `strict` the default for modules without a schema (one release of warnings first).
- Cancelling branches does not interrupt a step a worker is running (it finishes; its hand-over is dropped). Combined with Phase A `timeoutMs` on the step, long steps can be bounded.
- The last step of a flow with nothing after it still does not merge its output into state (existing behaviour).

## Phase E: Composition contracts → folded into "script contract hardening" (follow-up, not a phase)

Reusable graphs already exist as scripts: `Curator_Module` (`main`, `subroutines`, `params`), `Curator_Call`
(`ref`, `args`, `returns`, `as`), immutable `ScriptVersion`s, and the callee runs as a child seeing only its params.
Decided 2026-11-09: no new composition feature; three small gaps remain:

1. Callee state leaks: the callee runs unscoped (`nodes/call.ts`), so its intermediate writes land in the caller's shared state. Fix: a `call:<callerId>` scope (reads shared, only `as` flows back), opt-in first (`stateIsolation: 'scoped'` on the module) since it changes existing behaviour.
2. `params` types are declared but not checked (`bindParams` applies only `required` / `default`). Fix: Ajv check per declared type.
3. No output contract: optional `output` JSON Schema on modules/subroutines, checked on `returns`.

## Phase F: Runtime context separate from workflow state → mostly covered, skipped (2026-11-09)

Already separated today: services (`ctx.service`, process-wide), credentials (`$secret:` placeholders hydrated at call
time, outputs masked), per-call runtime values (`host.runTool` `runtimeArgs` / `runtimeContext`, memory only), traces
(own tables). No infrastructure values were found in stored contexts. Remaining gap, not scheduled: a non-persisted
input channel for whole workflows (`$runtime.x`) and a stripped reserved `__runtime` key as a backstop. Original notes:

- Split request context into **persisted** (business state, step bookkeeping) and **runtime** (services, credentials, trace ids, session handles), the latter provided per execution via `NodeContext.runtime` and never written to `Request.context`, Responses or state events.
- A `withoutStoredStateCopies`-style Prisma extension strips a reserved `__runtime` key on write, as a backstop.
- Scripts read runtime values via `$runtime.x` in expressions; secrets resolve through `SecretService` handles, never values.
- Audit current context keys (e.g. `sessionId`) and move the infrastructure ones over with a deprecation read path.

## Phase G: Progress streaming as a stable API (implemented 2026-11-09)

Reference: `curator/CURATOR_AST.md` §16; code: `src/engine/ProgressEvents.ts`, `CuratorHostEvents.onProgress`.

- One event type, `curator:progress`, `{ v: 1, kind, seq, ts, conversationId, requestId? }`, on the existing channel (processor `onEvent` → host events → WebSocket). No new transport.
- Kinds: `step.started`, `step.finished` (one kind with `status`, instead of separate completed/failed kinds), `step.retrying`, `step.replayed`, `wait.opened`, `wait.resumed`, `state.changed`, `run.finished`, `run.forked`.
- Types live in the engine and are re-exported (types only) from `@curator/host/contracts`; `host.events.onProgress(cb, { conversationId })`.
- Older event names stay as they are (no aliases needed: they are still emitted).

Not done in G (follow-ups):
- `token` events: LLM providers return whole responses; streaming needs provider support first.
- `state.changed` covers writes made through workflow steps, not direct `appendStatePatch` calls (conversation managers).
- `seq` is per worker; a global order would need a shared sequence.

## Decisions (2026-11-09)

- **Fork onto newer script versions: allowed.** `forkConversation` takes an optional `scriptVersion` (default: the original). Replay matches steps by `__step` and also compares a hash of the step's AST: from the first step whose AST changed (or is new), execution goes live. So an improved script reuses everything before the first changed step.
- **Strict merge: on by default.** Applies at once to modules that declare a `stateSchema`. Modules without one log a warning on conflicting writes for one release, then strict becomes the default everywhere (`strict: false` opts out).
- **LLM timeouts: abort, then fail.** When `timeoutMs` passes, the provider request is aborted (no further cost) and the attempt counts as a `timeout` error. If the node's retry policy doesn't cover `timeout`, or the attempts are used up, the step ends `FAILED` and normal failure handling runs (`onError` branch if set, otherwise downstream poisoning/Join policy).
