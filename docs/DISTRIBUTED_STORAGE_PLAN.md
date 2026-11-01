# Distributed storage plan for the curator engine

Status: proposal (2026-10-31). Scope: `curator/` request processing, the EventLog, and retention.

## Problem

`CuratorRequestProcessor` uses one relational database for four jobs that need different durability:

| Job | Where | Lifetime | Needs durability? |
|---|---|---|---|
| Work queue | `Request` (`status`, `lockedBy`, `pendingDependencies`) | seconds to minutes | yes, while the work is live |
| Execution trace | `Request.context`, `Response` | read once by the notify target, then trimmed (`Retention.ts`) | rarely |
| Domain state | `EventLog` `__state.*` events, `Conversation.metadata` view | conversation lifetime | yes |
| Bus events | `EventLog` (non-state events), `EventSubscription` | until consumed | depends on the subscriber |

Every step writes durably, and retention deletes most of those writes shortly afterwards. With many nodes,
every node polls the same `Request` rows (`findMany` followed by a separate claim `updateMany` per row,
`CuratorRequestProcessor.ts` `pollRequests`), so the nodes compete for hot rows and the connection pool.

## Deployment targets

- **SQLite**: single process, direct or embedded runs. No clustering features. Stays the default for the
  CLI, tests and minigames.
- **MariaDB**: single primary, primary plus replicas, or a Galera cluster. Already supported (`prisma-mariadb/`).
- **Postgres**: primary plus streaming replicas (for example Patroni), optionally behind PgBouncer. Not yet
  supported in `curator/`. Needs a `prisma-postgres/` schema folder (one engine per folder, see `curator/AGENTS.md`).

The multi-node design must hold for MariaDB and Postgres clusters. SQLite only has to keep working.

## Cluster facts the design depends on

| Concern | Postgres primary/replica | MariaDB Galera | MariaDB primary/replica |
|---|---|---|---|
| Row-lock claiming | `FOR UPDATE SKIP LOCKED` on the primary | Locks are local to one Galera node. Conflicting writers hit a certification failure (reported as a deadlock) at commit | `SKIP LOCKED` (10.6+) on the primary |
| Push wake-ups | `LISTEN/NOTIFY` needs a session connection: not through PgBouncer in transaction mode | none built in | none built in |
| Advisory locks | `pg_advisory_lock` breaks under transaction pooling | `GET_LOCK` is not replicated by Galera | `GET_LOCK` is primary-only |
| Replica reads | lagging: never for queue or state | all nodes, once certified | lagging: never for queue or state |
| Large deletes | heavy WAL and vacuum load | one large write set that every node certifies; can stall the cluster | heavy binlog load |
| Partitioning | declarative, foreign keys allowed | partitioned InnoDB tables cannot have foreign keys | same as Galera |
| Non-durable shared tables | `UNLOGGED`: emptied after a crash, not on standbys | `MEMORY` engine: table locks, no TEXT/BLOB, per node on Galera (avoid) | same as Galera (avoid) |

Consequences:
- **Leases are a table row** (`owner`, `leaseUntil`, renewed with a conditional `UPDATE`), never advisory locks.
- **On Galera, all queue and lease writes go to one writer node** (MaxScale `readwritesplit`, or a ProxySQL
  writer hostgroup), and claims retry on deadlock errors.
- **Queue and state reads always go to the primary or writer.** Replicas serve UI and history only.

## Plan

### Phase 0: Storage layer that works across databases (done, except wiring the processor)
- `curator/src/db/sqlDialect.ts`: detects `sqlite | mysql | postgresql` from the Prisma client and builds
  dialect-correct SQL (placeholders, identifier quoting, optional fragments). `Retention.ts` uses it.
- `prisma-postgres/` (derived from `prisma-mariadb/`) and `provisionPostgresDb` (`src/db/postgresProvisioner.ts`).
  The host picks it for `postgres://` / `postgresql://` URLs. Schema creation runs `prisma db push` once,
  behind an advisory lock, when curator's tables are missing; `schema: 'never'` leaves it to deploys.
- Storage port `src/storage/IStorageAdapter.ts`, rebuilt around the request lifecycle: `requests` (create,
  get, atomic `claim`, update, atomic `dependencyDone`, `releaseStale`), `responses`, `events` (append, replay
  after a cursor), and `withScope` for per-session scoped views. Implementations: `PrismaStorageAdapter` (all
  three databases; Postgres claims with one `UPDATE … SKIP LOCKED … RETURNING`, MariaDB with `SELECT … SKIP
  LOCKED` and `UPDATE` in one transaction, retried on write conflicts) and `MemoryStorageAdapter`.
  Contract tests: `test/engine/storage-adapter.test.ts` (memory, SQLite, and Postgres 17 / MariaDB 11.4 via
  the test containers; passing on all, 2026-11-01).
- Remaining: move `CuratorRequestProcessor` onto the port (it still calls Prisma directly).

### Phase 1: Durability tiers (done per host; per script/conversation still open)

Built as host config `durability: 'durable' | 'ephemeral' | 'checkpoint'` (`packages/host`), on an in-process
SQLite memory database (`provisionMemorySqliteDb`, ~30 ms; schema from a cached template of
`prisma-sqlite/schema.prisma`). The processor runs unchanged on it.
- `ephemeral`: the host's database is the memory database; the configured database is never touched.
- `checkpoint` (`src/engine/Checkpoint.ts`): definitions are written to the configured database and mirrored
  into memory with their ids (`mirrorDefinitions`); conversation ids are reserved durably
  (`checkpointMemoryClient`, which also pulls users/projects missing from the mirror); memory rows get ids from 1e9 up. A maintenance system on the memory processor
  moves each conversation that is suspended (human input, event wait, pause, timer further than 5 s away) or
  finished to the durable database in one transaction (`demoteConversation`: request/event/subscription ids
  remapped, including `notifyId`, `parentId`, `eventCursor`, `__stateSeq`, `HISTORY_SUMMARY`, `SUBSCRIBED`), then
  it runs on a second, durable processor. `host.runTool` / `emitEvent` / `triggerAgent` / `pauseRequest` /
  `resumeRequest` route by where the conversation lives; `host.prismaFor` / `processorFor` expose that.
- App contract (poker and keeris follow it; enable with `host: { durability: checkpoint }` in the app config or
  the `durability` option of `createPokerHost` / `createKeerisHost`):
  - conversation data (requests, state, waits): `await host.prismaFor(conversationId)`;
  - long-lived data (users, roles, bankrolls, knowledge resources, auth): `host.definitionsPrisma`, then
    `host.syncDefinitions()` after a definition write;
  - listing conversations: `host.findConversations(args)` (memory copies win, since their state is current);
  - a request id kept across a move: `host.locateRequest(id)`; direct stepping: `host.checkpoint()` after a step
    (`stepInteractiveConversation` does it); polling scope: `host.setConversationScope(ids)`.
- Limits: the move is one way (no rehydration); conversations linked to another memory conversation or to
  resources stay in memory; state projectors (e.g. poker's table resource) update their read model only once the
  conversation is durable, since the resource lives there; MariaDB/Postgres `Permission`/`RolePermission` are not
  mirrored (SQLite has no such tables). In a cluster, Phase 4 leases make one durable worker at a time run a
  moved conversation.
- Only an explicit curator URL (`curatorDb.url` / `CURATOR_DATABASE_URL`) selects Postgres; a generic
  `DATABASE_URL` is usually the server's own Postgres and keeps its old meaning (SQLite unless MySQL/MariaDB).

The original design below is kept for reference.

A durability setting per script or conversation:
- `durable`: today's behaviour, persisting every step.
- `checkpoint`: runs in memory. Writes only at suspension points (human waits, `scheduledAt` in the future,
  `wait_event`, long external calls) and the final state and response. A crash replays from the last checkpoint.
- `ephemeral`: memory only. Optionally writes the final response or one compacted state event.

Ephemeral work is lost on crash by definition, so it only suits work that can restart from the beginning.
On clusters, this tier also cuts replication traffic (Galera certification, Postgres WAL shipping).

### Phase 2: Claiming work (done)
Done: `CuratorRequestProcessor` (polling and `step`) claims through `PrismaStorageAdapter.claimRows`, i.e. the
statements below. Tested on SQLite, Postgres 17 and MariaDB 11.4, and with two nodes.

Wake-ups (done):
- `wake()` stays local (after every task, a poll on this node). `announce()` also tells the other workers: it is
  called where work arrives from outside its conversation's owner, i.e. `emitEventRequest`, `runToolRequest`
  (approvals) and the host's `triggerAgent` / `resumeRequest`. With leases, a conversation's own follow-up work runs
  on its owner, so nothing else needs announcing.
- Postgres: `announce()` sends `pg_notify('curator_wake', workerId)` through the processor's client; a processor with
  `wakeChannel.url` (the host passes its curator URL) LISTENs on its own session connection
  (`src/engine/WakeChannel.ts`, reconnects with backoff, polls once after connecting) and polls on every
  notification from another worker. Not through PgBouncer in transaction mode (the LISTEN URL must be direct).
- Adaptive polling (all databases): each idle tick doubles the interval up to `idlePolling.maxIntervalMs` (default
  10s), never past the next scheduled request; work, `wake()` and notifications reset it.
- Measured (two hosts, 3s interval, answer given on the node that does not own the conversation): Postgres resumes the
  flow in 130-170ms; MariaDB, polling only, in ~6s (the owner's idle backoff). On MariaDB a shorter interval or a
  lower `maxIntervalMs` trades database load for that latency.

- Claim in one statement instead of a find followed by a claim update per row:
  - Postgres: `UPDATE "Request" SET … WHERE id IN (SELECT id … FOR UPDATE SKIP LOCKED LIMIT n) RETURNING *`.
  - MariaDB 10.6+: `SELECT … FOR UPDATE SKIP LOCKED` followed by `UPDATE` in the same transaction (no `RETURNING` on `UPDATE`).
  - SQLite: keep the current conditional `updateMany` (single writer anyway).
- Wake-ups: `LISTEN/NOTIFY` on Postgres when a session connection is available. Otherwise adaptive polling
  (back off when idle, reset on work), with an optional Redis or NATS channel as a wake-up hint only (never
  as the source of truth).

### Phase 3: Retention by partition (done: batched deletes; StepTrace and BusEvent partitioned)
Done, for every database: `pruneConversationHistory` deletes Responses and Requests in batches of 500
(`Retention.deleteInChunks`, one statement each), and `compactConversationLog` commits the compacted event and
its snapshot first, then deletes the older events in batches. No retention statement touches more than 500 rows.
Done, Postgres/MariaDB (`src/db/partitions.ts`): tables listed in `PARTITIONED_TABLES` (now `StepTrace`) are range
partitioned by UTC day. Prisma cannot declare partitions, so the DDL is built from that spec and the generated
schema.sql (never hand-written per table):
- At startup (`convergePartitions`, after `convergeSchema`, under the schema lock; MariaDB `GET_LOCK`): Postgres
  recreates an empty table from its generated CREATE TABLE plus `PARTITION BY RANGE` and its generated indexes (so
  `convergeSchema` stays a no-op); a non-empty table is reported for a manual migration. MariaDB converts in place.
  Partitions for yesterday through two days ahead, plus a catch-all (Postgres `DEFAULT`, MariaDB `pmax`) so inserts
  never fail when maintenance lags.
- At runtime (`maintainPartitions`, hourly from the step trace's flush system, any node, idempotent): creates the
  coming days' partitions and drops those older than the retention (`stepTrace.ttlMs`, default 7 days). SQLite keeps
  batched deletes.
- Limit (Postgres): a day whose rows already sit in the DEFAULT partition cannot get a partition of its own (reported);
  those rows stay there until they expire and are deleted from it.
`EventLog` / `BusEvent` (done 2026-11-01): `EventLog` holds only the `__state.*` events (`Conversation.metadata` is
folded from them) and keeps its retention (compaction when a conversation finishes). Every dispatched event goes
to `BusEvent` (wait_event's mailbox: `Request.eventCursor` holds its ids; agents' `history_events`; the storage
port's events; `agent:message`), partitioned by day (`(id, createdAt)` primary key) and retired after
`busEvents.ttlMs` (processor option, default 30 days) by the `retireBusEvents` maintenance system, which drops day
partitions (SQLite: batched deletes; `retireByAge` in `Retention.ts` serves StepTrace too). Agent history older than
the TTL leaves the LLM context unless it was folded into a saved summary. A finished conversation's bus events go
with `pruneConversationHistory`. Upgrade (`src/db/busEvents.ts`, run by the provisioners): while `BusEvent` has
never issued an id and `EventLog` has rows, the non-state events move over with their ids and `BusEvent` ids start
above every `EventLog` id, so existing cursors stay valid. Checkpoint moves a conversation's bus events too. Partitioning
`Request` needs its primary key to include the partition column, which conflicts with `Response.requestId` and
`Request.parentId` referencing `Request.id`.

- Postgres: partition `EventLog`, `Request` and `Response` by time; retire data with `DETACH`/`DROP PARTITION`.
- MariaDB: range partitioning drops the foreign keys on those tables (integrity moves to the application,
  for example with Prisma `relationMode = "prisma"` for them). If that is not acceptable, keep chunked deletes
  (`Retention.ts` already works in chunks of 500) and run them off-peak.
- SQLite: unchanged.

### Phase 4: Conversation ownership (leases done; in-memory state and group commit open)
Done: model `ConversationLease` (all three schemas; MariaDB DDL; added to existing SQLite files at startup;
Postgres pushes it when missing). A claim skips conversations another worker holds a live lease on, takes the
lease on what it claimed, and puts back requests whose lease it lost in a race. The processor renews the leases of
conversations with requests in flight every tick (`renewConversationLeases`), idle leases lapse after `ttlMs`
(default 30s, so the owner keeps affinity), and a stopped processor releases its leases. When a node dies, the next
worker's `recoverLapsedLeases` pass takes over each expired lease whose owner still holds claimed requests and puts
those back to NEW, so the conversation resumes after `ttlMs` (measured: ~30s) instead of the 5-minute stale-lock sweep;
the step the dead node was executing runs again (at-least-once). On by default for
MariaDB/Postgres, off for SQLite; option `conversationLeases`. This also covers the checkpoint tier: a moved
conversation is run by one durable worker at a time. Open: keeping the owner's conversation state in memory and
batching its writes (below); both build on the leases.

- Lease table `ConversationLease(conversationId, owner, leaseUntil)`. Only the owner node runs a
  conversation's requests, and it keeps that conversation's state in memory.
- The owner writes events in batches (group commit). When a lease expires, another node takes over by
  folding the snapshot plus later events (`ConversationStateLog.foldState`).
- This removes cross-node write races on a conversation's rows and is portable across all cluster types.

### Phase 5: Step history out of the hot tables (done)
Done (`src/engine/StepTrace.ts`):
- Only history steps (`Curator_Agent`, `Curator_HumanInput`, `Curator_Tool`, `Curator_Script`, and plugin node
  types) write `Response` rows; agent history and the conversation context read nothing else. Control-flow steps
  (Sequential, IfElse, ForEach, Join, SetState, EmitEvent, ...) store their result in `Request.output`, read by the
  request they notify and trimmed with `context` (`Retention.clearRequestContexts`). `requestOutput(row)` reads a
  step's result either way (Join, Call, dead letters, `runToolRequest`, `completeRequest`).
- Every finished request is recorded in `StepTrace` (status, node type, timing, worker, control-flow output):
  buffered and written with one `createMany` per poll tick, no foreign keys, `(id, createdAt)` primary key on
  Postgres/MariaDB so it can be partitioned by time. Rows past `stepTrace.ttlMs` (default 7 days) are deleted
  hourly (by dropping day partitions on Postgres/MariaDB, see Phase 3). Processor option `stepTrace` (`false` turns it off); a checkpoint host
  writes its memory processor's trace to the configured database, an ephemeral host writes none.
- Effect: control-flow steps no longer add Response rows (the tests' golden databases lost 31 of them), so the
  tables agent history scans hold only history.
The audit view (`AuditService.getLogs`) lists control-flow steps from `StepTrace` (action `STEP`) next to the
Response-based entries, where the database has the table.

### Phase 6: Shared ephemeral tier (optional)
For ephemeral data several nodes must read: Postgres `UNLOGGED` tables (lost after a crash or failover),
or Redis/Valkey for MariaDB and Postgres. With Phase 4 ownership this is often unnecessary.

## Schemas: Prisma is the only source

Every database schema comes from `prisma-<engine>/schema.prisma`. `npm --prefix curator run prisma:sql` writes
`prisma-<engine>/schema.sql` with `prisma migrate diff --from-empty`; a test fails when a committed file is stale.
All provisioners (SQLite files and memory databases, MariaDB, Postgres) apply that file through
`src/db/schemaSql.ts` `convergeSchema`: missing tables, columns, indexes and foreign keys are added, nothing is
dropped or altered, and anything needing more is reported for a manual migration. No provisioner runs the Prisma CLI
at runtime any more, and there is no hand-written DDL (this replaced the MariaDB DDL, which lacked nine tables,
and the SQLite upgrade statements). Two legacy index drops remain in `sqliteProvisioner.ts` for old SQLite files.
`packages/adapter-mariadb` (an unused old copy of the hand-written MariaDB DDL) was removed 2026-11-01.
Not covered: `server/` has its own Prisma schema
(`server/prisma/schema/*.prisma`, applied with `prisma db push`; its migrations folder is stale), on which
`server/src/mcp-server.ts` runs a `CuratorRequestProcessor`. Synced 2026-11-01 by hand with the curator Postgres
schema: `Request.notifyId/pendingDependencies/priority/eventCursor/output`, the full `RequestStatus` enum, and
`EventLog`, `ConversationLease`, `StepTrace`; a flow with a parallel step ran through it on a pushed test database.
Keep them in sync when the engine tables change (the server's SQLite schema is a reduced variant and is not).

## Testing against real servers

`createTestDatabase(serverUrl)` (`src/db/testDatabase.ts`) creates a fresh `curator_test_<random>` database on a
Postgres or MariaDB server, applies the schema and returns a client; `drop()` drops exactly that database. The
storage, lease and checkpoint tests also run on every server given in `CURATOR_TEST_POSTGRES_URL` /
`CURATOR_TEST_MARIADB_URL` (server URLs, e.g. `postgresql://user:pass@host:5432/postgres`), each test process in its
own throwaway database; unset, those variants are skipped.

Servers for this: `curator/docker-compose.test.yml` (pgvector/pgvector:pg17 on port 55432, mariadb:11.4 on 53306,
data in tmpfs, fixed test credentials; see the file header for the URLs). Never point these variables at a
database server that holds real data. Run it on the remote Docker host, not the local engine:
`docker --context remote-110 compose -f curator/docker-compose.test.yml up -d --wait`, stop it with `down`.

Last run (2026-11-01, containers on 192.168.1.110): storage-adapter, conversation-leases and checkpoint tests 46/46 on
both engines; a second provision of an existing database adds nothing.

Two-node smoke run: `packages/host/scripts/two-node-smoke.ts` (`SMOKE_SERVER_URL=<server URL> npm --prefix packages/host
run smoke:two-node -- [exclusive] [wake] [kill] [checkpoint]`, after building curator and host; options in the file header).
Results (2026-11-01; two host processes on one test database, Postgres and MariaDB):
- Exclusivity: 8 conversations x 4 independent requests on two durable hosts; every request ran once, both nodes
  worked, no conversation ran on two nodes at once.
- Takeover: killing the node running a 6-step flow; the other node resumed it 30s later and finished it. Before
  `recoverLapsedLeases` this took 300s (the stale-lock sweep).
- Checkpoint: node C runs a flow in memory and moves it to the shared database at its human-input wait; node D's answer
  resumes it durable. 40 rounds clean on Postgres, 10 on MariaDB.
- Found and fixed: a completion made its target claimable (`pendingDependencies` 1→0) before writing the target's
  context with `status: NEW, lockedBy: null`, which un-claimed a target already running, so it ran twice (~1 in 10
  human-input resumes, any engine). `completeRequest` now writes the context first and releases the target last, in
  one conditional update.
- One MariaDB run (of 13) ended with the last two steps of the flow FAILED after a takeover; not reproduced. Most
  likely the stale-sweep deadlock the load test found (a deadlocked status update fails the request), fixed since.

Load test: `packages/host/scripts/load-test.ts` (`SMOKE_SERVER_URL=<server URL> node packages/host/scripts/load-test.ts`;
`LOAD_NODES`, `LOAD_CONVERSATIONS`, `LOAD_STEPS`, `LOAD_STEP_MS`, `LOAD_TIMELINE=1` in the file header). It queues N
flows `Sequential[s0, Parallel[p0, p1], s1..s4]` of 20ms tool steps at once on several host processes and checks that
every step ran once, no conversation ran on two nodes at once, every request completed and is in `StepTrace`.
Results (2026-11-01, 3 hosts on the LAN test containers, 100 flows = 700 tool steps / 1000 requests, default
concurrency 3 per host):
- Postgres: 12-20s, 35-59 tool steps/s; step-to-step delay p50 ~100ms once flows are under way; 16 connections at
  peak. Concurrency 10 per host: same throughput (59/s), step delay p50 ~320ms, 37 connections: the database round
  trips per request bound it, not the slots.
- MariaDB: ~30s, 22 tool steps/s, step delay p50 ~150ms. Without NOTIFY, a host that backed off while idle joins a
  burst only at its next poll (up to `idlePolling.maxIntervalMs`), so the work spread unevenly (one host took 49 of
  700 steps).
- Claim order (fixed): oldest-first made the first transitions of a burst wait 4-10s, because the 100 new flows'
  first requests went before the follow-ups of flows already running. Claims now go `priority`, then follow-ups
  first (conversation leased by the claiming worker, or `notifyId` / `parentId` set), with new flows capped at
  `newFlowMaxWaitMs` (default 10s, processor option or `CURATOR_NEW_FLOW_MAX_WAIT_MS`; 0 = oldest-first) so endless
  loops cannot starve them. A/B on Postgres, 100 flows: step-to-step p95 7-8s -> 0.3-0.4s, flow duration p50
  9.2-9.5s -> 7.1-7.3s, wall time 13.8-14.2s -> 12.8-13.8s. Order execution with `priority` (requests and AST
  nodes; children inherit it).
- Found and fixed:
  - Parallel branches finishing together lost a dependency count. `completeRequest` checked for 1 and then
    decremented only above 1, so with a count of 2 both checks failed, one decrement made it 1 and the other
    matched nothing. The Join waited forever, in 3 of 5 runs. It is now a compare-and-swap on the count, retried
    (`dependencyDone`; `poisonDownstream` likewise).
  - Every wake-up poll ran all maintenance systems (~28ms of ~36ms per poll, one claim per poll under load). A poll
    woken by finished work now runs them only once an interval has passed; timer polls always do.
  - `idle()` did not wait for a poll in flight, which then queried a closed pool after `host.stop()`.
  - `pg_notify` through `$queryRaw` failed to read its `void` result (the notification was sent; now `$executeRaw`).
  - MariaDB deadlocks (2 of 3 runs, a request FAILED): the stale-lock sweep, run by every node each tick, was one
    `UPDATE … WHERE status = 'WAITING' …` that locked every WAITING row it scanned through the status index, while
    a completion held a row and waited for its index entry. The sweeps (`unlockStaleRequests`, `releaseStale`) now
    read first and update by id. 0 deadlocks in the next runs; MariaDB 100 flows in 17-18s (was ~30s).

## Order

0 → 1 → 2 → 3 → 4 → 5 → 6. Phase 2 (with the single-writer rule on Galera) fixes most of today's contention.
Phase 4 depends on the storage port and tiers.

## Decisions

1. ~~Rebuild or replace `src/storage/IStorageAdapter.ts`~~: rebuilt (Phase 0).
2. Where the durability tier is declared: host config is done (Phase 1); per script or per conversation still open.
3. Partitioning: decided (2026-11-01), yes. Data is retired by dropping time partitions, on Postgres and MariaDB.
   The MariaDB details (partitioned InnoDB tables have no foreign keys, and every unique key must include the
   partition column) are settled when the first production miniapp needs them.
4. No Redis/NATS (decided 2026-11-01): wake-ups and coordination use the database platform only (Postgres
   `LISTEN/NOTIFY`, adaptive polling on MariaDB). Phase 6 is limited to database features (e.g. `UNLOGGED`).

## Conventions

- Soft delete: tables with deletable rows carry `existent Boolean? @default(true)` and include it in their indexes
  and unique keys (e.g. `@@unique([id, existent])`, `@@index([projectId, existent])`). Deleting sets `existent`
  to NULL: unique indexes treat NULLs as distinct, so a deleted row never blocks a new live one, and lookups filter
  on `existent: true`. New tables (and partitioned ones) follow the same pattern.
