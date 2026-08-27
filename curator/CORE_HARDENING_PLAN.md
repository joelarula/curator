# Curator Core Hardening Plan

## Purpose and Current Maturity

Curator Core has a strong beta foundation: database-backed AST workflows, sequential and parallel execution, plugin registration, tools, human input, events, graphs, and semantic entities. It is not yet production-hardened because execution contracts are permissive, model output is not consistently validated, worker recovery is incomplete, and project/user boundaries rely on defaults and hardcoded IDs.

This plan focuses on:

- `src/engine/CuratorRequestProcessor.ts`
- `src/engine/CuratorAst.ts`
- `src/services/SemanticSchemaEngine.ts`
- `prisma/schema.prisma`

## Priority 0: Define the Execution Contract

### AST validation and versioning

- Add a versioned AST envelope or `astVersion` field.
- Define one runtime JSON Schema for every supported node type.
- Validate ASTs before enqueueing and before execution.
- Reject unknown node types with a clear `FAILED` result and error response.
- Validate required fields, enum values, nested nodes, route targets, and graph edges.
- Add maximum workflow depth, node count, loop iterations, and serialized payload size.
- Add type guards so the processor does not cast arbitrary JSON to AST interfaces.

### Type safety

- Replace `any` in request processing, tool contexts, agent definitions, and Prisma access with explicit interfaces or generated Prisma types.
- Define typed request, response, execution context, tool result, and model result contracts.
- Make `parameters` and `args` consistent across `Curator_Tool` nodes.
- Decide and document whether `ADK_*` node names remain supported; otherwise reject them clearly.

### Acceptance criteria

- Invalid ASTs never enter the worker queue.
- Every supported node has a schema test for valid and invalid payloads.
- Unknown node types produce a visible failure rather than silent skipping.

## Priority 1: Make LLM Execution Deterministic Enough to Trust

### Structured model output

- Require `output_schema` for agents whose output feeds tools, routes, assignments, or state updates.
- Parse model output centrally, including fenced JSON and provider-specific wrappers.
- Validate parsed output against the declared JSON Schema.
- Retry malformed output with a constrained repair prompt, with a strict attempt limit.
- Preserve the raw model response for diagnostics while passing only validated data downstream.
- Define behavior for empty responses, refusals, truncated output, and non-JSON output.

### Provider reliability

- Add request timeouts and cancellation support.
- Handle rate limits, network failures, 5xx responses, and authentication failures separately.
- Use exponential backoff with jitter and a maximum delay.
- Honor provider retry-after values when available.
- Add optional model/provider fallback with an explicit policy.
- Record provider, model, duration, retry count, and failure category.

### Acceptance criteria

- A model cannot silently inject malformed state into the next workflow step.
- Transient failures retry within bounded limits.
- Permanent failures become `FAILED` with a useful response and diagnostic metadata.
- `test_process_feed.ts` succeeds only when the feed result and three-sentence summary meet their contracts.

## Priority 2: Make Queue Processing Crash-Safe

### Claiming and leases

- Keep request claiming atomic and add a lease expiry to `lockedAt`.
- Recover requests stuck in `WAITING` after a configurable lease timeout.
- Ensure only the current lease owner can complete or reschedule a request.
- Add graceful shutdown that stops polling and allows in-flight work to finish or be requeued.

### Idempotent completion

- Make response creation and dependency notification idempotent.
- Wrap status changes, response creation, retry updates, and parent wake-up in transactions where possible.
- Prevent duplicate human-input resumption when several responses exist.
- Ensure a failed child cannot accidentally wake a parent as successfully completed.
- Add explicit terminal states for `COMPLETED`, `FAILED`, `CANCELLED`, and `SKIPPED`.

### Acceptance criteria

- Two workers cannot execute the same request concurrently.
- A killed worker does not leave work permanently stuck.
- Repeated polling or completion calls do not duplicate responses or notifications.
- Sequential, parallel, route, graph, and event workflows preserve correct dependency ordering.

## Priority 3: Enforce Security and Scope Boundaries

### Scripts and tools

- Allow execution only of registered tools and explicitly whitelisted scripts.
- Validate tool arguments against each tool's parameter schema before execution.
- Add per-tool timeouts, output-size limits, and cancellation.
- Treat `node:vm` as isolation from accidental globals, not a complete sandbox for hostile code; do not execute untrusted source without a stronger isolation boundary.
- Remove or restrict direct database access from user-authored scripts.
- Audit tool, script, agent, and model registrations.

### User and project scoping

- Centralize active user/project scope resolution in the execution context.
- Remove hardcoded project and user defaults such as project `1` and CLI user `2` from core behavior.
- Apply scope checks to requests, responses, agents, workflows, resources, and relations.
- Ensure event subscriptions cannot trigger workflows across unauthorized projects.
- Add authorization checks before resolving `Curator_AgentRef` and database-backed workflows.

### Acceptance criteria

- A workflow cannot call an unregistered tool or access another project’s data.
- Tool arguments are rejected before handler execution when invalid.
- Scope tests prove that reads, writes, events, and agent references stay inside the active project boundary.

## Priority 4: Correct Semantic Model Guarantees

### Shape and datatype validation

- Validate complete input data before creating any resources or relations.
- Enforce datatype compatibility for strings, numbers, booleans, dates, and text blobs.
- Validate relation target classes and require referenced shapes to exist.
- Replace implicit `targetClass + 'Shape'` lookup with an explicit shape registry mapping.
- Define behavior for unknown fields, duplicate values, nulls, and updates that remove properties.
- Respect `inverse` consistently in create, read, update, and delete operations.

### Transaction and identity behavior

- Use project-aware unique identity rules where global `uri` uniqueness is not intended.
- Ensure nested entity creation and relation creation roll back together.
- Add optimistic or explicit conflict handling for concurrent updates.
- Avoid creating duplicate literal/blob resources during repeated updates.

### Acceptance criteria

- Invalid nested entities create no partial graph.
- Shape, datatype, cardinality, enum, pattern, and relation constraints are covered by tests.
- Semantic reads and writes cannot cross project boundaries.

## Focused Test Suite

Add automated tests under the curator test setup for:

- AST schema validation and type guards.
- Each AST node: agent, tool, script, sequence, parallel, join, route, graph, loop, human input, event, interrupt, and agent reference.
- Sequential input propagation and `exclude_from_history` behavior.
- Parallel joins, child failures, retries, and duplicate notifications.
- Worker lease expiry, crash recovery, concurrent workers, and graceful shutdown.
- Model output schemas, malformed JSON, empty output, refusals, timeouts, rate limits, and fallback providers.
- Tool argument validation, unknown tools, timeout, output limits, and script restrictions.
- Semantic shape validation, nested entities, inverse relations, rollback, updates, and project isolation.
- RSS/feed processing with mocked network and model providers so tests do not depend on live services.

Use deterministic fake providers and fake clocks for retry and scheduling tests. Keep a small number of live smoke tests separate from the normal test suite.

## Observability and Operations

- Add a correlation ID spanning parent and child requests.
- Emit structured lifecycle events for claimed, started, retried, resumed, completed, failed, cancelled, and recovered requests.
- Track queue depth, execution duration, retry count, stuck leases, model failures, tool failures, and dependency failures.
- Add health checks for database connectivity, worker liveness, and provider configuration.
- Add a dead-letter or permanently-failed workflow view with retry/reset controls.
- Document operational limits and recovery procedures.

## Recommended Implementation Order

1. Add AST schemas, runtime validation, consistent tool arguments, and typed execution contracts.
2. Add deterministic fake providers and tests for AST execution and input propagation.
3. Centralize model parsing, output-schema validation, timeouts, and bounded retries.
4. Add request leases, idempotent completion, transactional notifications, and crash recovery.
5. Enforce tool/script restrictions and user/project scoping.
6. Harden semantic shape, datatype, relation, and rollback behavior.
7. Add metrics, health checks, dead-letter handling, and operational documentation.
8. Run integration and adversarial tests against SQLite, then validate supported Postgres behavior.

## Production Readiness Gate

Curator Core is ready for production evaluation when:

- All persisted ASTs validate against a versioned schema.
- Model output is validated before downstream execution.
- Requests recover safely after worker crashes.
- Completion and dependency notification are idempotent.
- Project and user scope is enforced without hardcoded defaults.
- Untrusted scripts cannot run with unrestricted application access.
- Core workflows have deterministic integration coverage.
- Failure, retry, latency, and queue health are observable.
- SQLite and Postgres behavior is documented and tested for supported features.
