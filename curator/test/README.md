# Curator engine tests

Deterministic tests: script/AST → `CuratorRequestProcessor` → SQLite state. Run from `curator/`:

```powershell
npm run test            # everything (~15 s)
npm run test:unit       # compiler goldens only
node --import tsx --no-warnings --test test/engine/seq.test.ts   # one file
```

Determinism comes from the harness (`helpers/harness.ts`): a per-test SQLite DB copied from a cached template,
fake tools that record calls and return canned values, an injected clock (`FIXED_NOW`), and `stepUntil`
(synchronous stepping, no timers).

## Writing a fixture

1. Add `test/fixtures/<name>.coffee` (CoffeeScript verbs) or build an AST in TS (`fixtures/ast/<name>.ts` exporting `run()`), or inline an AST in the test.
2. Write the test:

```ts
const env = await createEnv('my_case', { echo: (a) => ({ echoed: a.text }) }); // canned tools
try {
  const { result } = await runAst(env, await compileFixture('my_case.coffee'));
  assert.equal(result.done, true);
  assertGolden('my_case.db.json', await snapshotDb(env));
} finally {
  await env.cleanup();
}
```

3. First run writes the golden (`*.db.json` / `*.ast.json`); review it in the diff and commit it.
   Regenerate intentionally with `$env:UPDATE_SNAPSHOTS=1; npm run test`.

`snapshotDb` replaces ids with `<req:n>`/`<res:n>` and drops timestamps, so goldens are stable.
Parallel children have no defined order: assert on sets, not sequences, when order is not part of the contract.

## Other helpers

- `saveScript(env, name, ast)` / `runScript(env, scriptId, version)`: stored, hash-versioned scripts (modules, `Curator_Call`).
- Clock control: `createEnv(name, tools, { now: () => t })` with a mutable `t`; then call
  `(env.processor as any).expireApprovalWaits()` to test approval expiry.
- Approval tools: set `requiresHumanApproval`/`requiresConfirmation` on `env.processor.engine.tools.get(name)`.
- Fake LLM: `env.useLlm(['reply 1', { toolCalls: [{ name: 'lookup', args: {} }] }, ...])` (or a function of the request)
  replaces the default provider for the test and returns `{ requests }` with every `LlmRequest` the engine sent
  (prompt, system instruction, history, tools, `jsonOutput`). Restored by `env.cleanup()`. See `engine/llm-agent.test.ts`.
- Evaluated expressions (`$state.x`, `$params.x`, `$context.x`) work in tool args, `Assign`, conditions and `returns`; `SetState` stores values literally.

The generated SQLite client (`src/generated/prisma-sqlite`) is git-ignored; run `npx prisma generate` if tests fail with unknown Prisma arguments.

## Conversation models

Coffee fixtures in `test/fixtures/` exercise the Coffee → AST compile path as well as the engine:

| Test | Fixtures | Covers |
|---|---|---|
| `engine/dialogue.test.ts` | `dialogue`, `interview`, `panel` | human↔agent Q&A, agent asks human, many agents answering in parallel |
| `engine/whisper.test.ts` | `whisper_ring*`, `whisper_bus`, `whisper_private` | ring, listeners, generic bus, human-started ring, private scopes (`isolated`), addressed events, spawn |
| `engine/waiter.test.ts` | `waiter`, `waiter_retry` | prompt for a name, `timeoutSeconds` re-prompt/retry (mutable clock) |
| `engine/broadcast.test.ts` | `broadcast` | event heard by all agents; addressed event reaches one |
| `engine/wait-timeout.test.ts` | `wait_timeout` | `wait_event` timeout vs. event arriving first |
| `engine/late-joiner.test.ts` | `late_joiner` | `replay: true` catches a late listener up on older events; default does not |
| `engine/conversation-context.test.ts` | (none) | `ConversationContextBuilder`: row-by-row fold of entries (any speech mode) into one participant's LLM prompt; own turns = assistant, others labelled user; whispers/tool output visible only to their audience; custom modes via renderers; built from Request/Response/EventLog rows |
| `engine/conversation-fold.test.ts` | (none) | `foldConversation` / `buildContext`: custom reducer sees every row in order and decides what to push; incremental builds process only new rows and keep the earlier messages frozen; stable `prefixHash` for caching; snapshot invalidated by a changed system prompt, viewer or version |
| `engine/tool-access.test.ts` | `tool_guarded.coffee`, `choose_action.coffee` | Role and project based tool access with non-admin users: no roles, `ToolRole`, `requiredRole` + inheritance, project-scoped `UserRole`, `ProjectRole` restriction, admin bypass, and denial inside an LLM tool loop |
| `engine/llm-choice.test.ts`, `llm-choice-dynamic.test.ts` | `choose_*.coffee` | Tool choices offered to an LLM, static and dynamic (`tools` expression); only offered tools run |
| `engine/script-header.test.ts` | `poker_lobby.coffee` | CoffeeScript front matter header styles |

Gemini side: `packages/plugin-llm-gemini/test/conversation-mapping.test.mjs` (offline) pins how builder output maps to Gemini `contents`; `conversation.test.mjs` is the live multi-turn API check (needs `GOOGLE_API_KEY`).
| `engine/trilogue.test.ts` | `trilogue`, `trilogue_free` | three symmetric agents, free conversation: speaker names the next one, or listeners compete for the floor via an atomic `claim` tool (one winner per turn); ends at a turn limit |
| `engine/modules-calls.test.ts` | `module_greeter` | module/`Curator_Call`, hand-written AST vs. Coffee |

Timeout tests use a mutable clock starting at `Date.UTC(2100, 0, 1)` (rows are scheduled `<=` the harness clock); expired human/event waits are completed on the next `step`/`stepUntil`. When several agents wait in parallel, `stepUntil` returns at the first parked request, so loop `step({ take: 10 })` until idle instead of `stepUntil`.

## MCP
`startFakeMcpServer({ tool: { handler } })` (harness) runs an in-process MCP server over `InMemoryTransport`; pass its `transport` to `createMcpPlugin` and add the plugin tools to `env.processor.engine.tools` (see `engine/mcp.test.ts`). No subprocess or network.

