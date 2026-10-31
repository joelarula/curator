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
  Contract tests: `test/engine/storage-adapter.test.ts` (memory and SQLite; not yet run on MariaDB/Postgres).
- Remaining: move `CuratorRequestProcessor` onto the port (it still calls Prisma directly), and run the
  contract tests against MariaDB and Postgres.

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
  mirrored (SQLite has no such tables); in a cluster, ownership of a moved conversation is unguarded until Phase 4
  leases.
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

### Phase 2: Claiming work
- Claim in one statement instead of a find followed by a claim update per row:
  - Postgres: `UPDATE "Request" SET … WHERE id IN (SELECT id … FOR UPDATE SKIP LOCKED LIMIT n) RETURNING *`.
  - MariaDB 10.6+: `SELECT … FOR UPDATE SKIP LOCKED` followed by `UPDATE` in the same transaction (no `RETURNING` on `UPDATE`).
  - SQLite: keep the current conditional `updateMany` (single writer anyway).
- Wake-ups: `LISTEN/NOTIFY` on Postgres when a session connection is available. Otherwise adaptive polling
  (back off when idle, reset on work), with an optional Redis or NATS channel as a wake-up hint only (never
  as the source of truth).

### Phase 3: Retention by partition
- Postgres: partition `EventLog`, `Request` and `Response` by time; retire data with `DETACH`/`DROP PARTITION`.
- MariaDB: range partitioning drops the foreign keys on those tables (integrity moves to the application,
  for example with Prisma `relationMode = "prisma"` for them). If that is not acceptable, keep chunked deletes
  (`Retention.ts` already works in chunks of 500) and run them off-peak.
- SQLite: unchanged.

### Phase 4: Conversation ownership
- Lease table `ConversationLease(conversationId, owner, leaseUntil)`. Only the owner node runs a
  conversation's requests, and it keeps that conversation's state in memory.
- The owner writes events in batches (group commit). When a lease expires, another node takes over by
  folding the snapshot plus later events (`ConversationStateLog.foldState`).
- This removes cross-node write races on a conversation's rows and is portable across all cluster types.

### Phase 5: Trace to telemetry
Finished-step `Request.context` and `Response` bodies are observability data. Send them to OpenTelemetry
spans or batched append files with time-based retention. The transactional database keeps only live requests
and state events.

### Phase 6: Shared ephemeral tier (optional)
For ephemeral data several nodes must read: Postgres `UNLOGGED` tables (lost after a crash or failover),
or Redis/Valkey for MariaDB and Postgres. With Phase 4 ownership this is often unnecessary.

## Order

0 → 1 → 2 → 3 → 4 → 5 → 6. Phase 2 (with the single-writer rule on Galera) fixes most of today's contention.
Phase 4 depends on the storage port and tiers.

## Open decisions

1. ~~Rebuild or replace `src/storage/IStorageAdapter.ts`~~: rebuilt (Phase 0).
2. Where the durability tier is declared: host config is done (Phase 1); per script or per conversation still open.
3. MariaDB partitioning versus keeping foreign keys on `Request`/`Response`.
4. Whether a Redis/NATS dependency is acceptable for wake-ups and the shared ephemeral tier.
