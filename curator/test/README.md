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

## MCP

`startFakeMcpServer({ tool: { handler } })` (harness) runs an in-process MCP server over `InMemoryTransport`; pass its `transport` to `createMcpPlugin` and add the plugin tools to `env.processor.engine.tools` (see `engine/mcp.test.ts`). No subprocess or network.

