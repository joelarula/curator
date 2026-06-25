# Curator Engine in Headless Bevy (Design README)

## Module Placement Update

This design is now implemented as a separate crate at `../curator-bevy-plugin`.

`curator-rust` remains the local LLM server module.

## Goal

Describe how to implement Curator workflow execution in a headless Rust Bevy application while preserving Curator's durable request semantics.

This design treats Bevy ECS as the execution runtime and the database as the source of truth.

## Why This Exists

The current Curator TypeScript engine already provides:
- Plugin registry (tools, models, scripts, agents)
- Durable request polling and locking
- AST-based workflow execution (agent, tool, sequential, parallel, route, graph)
- Request status transitions and retry scheduling

The Rust service currently focuses on local LLM serving. This document defines a path to add an orchestration runtime in Rust using Bevy, without losing durability or behavior parity.

## Concept Overlap

### Curator Engine Concepts
- Engine registry
- Request processor loop
- AST nodes
- Context propagation
- Durable state transitions

### Bevy Concepts
- Plugins
- Resources
- Schedules and SystemSets
- Components
- Events
- App state transitions

### Mapping
- Curator registry -> Bevy plugin + registry resources
- Request polling loop -> scheduled claim systems
- AST node execution -> executor systems by node type
- Async context -> explicit execution context component/resource
- Request status transitions -> event-driven persistence systems

## Headless Runtime Model

Use a headless Bevy app with minimal plugins and schedule runner.

High-level app shape:

1. Initialize app and orchestration plugin
2. Register resources (config, registries, persistence, metrics)
3. Register ordered system sets for each tick
4. Run loop at configurable interval

Suggested system set order per tick:

1. ClaimSet
- Claim runnable requests from DB (status NEW, deps satisfied, scheduled time reached)
- Lock them atomically

2. MaterializeSet
- Spawn or update request entities in ECS
- Attach AST and context components

3. ExecuteSet
- Run node executors (Tool, Script, Agent, Sequential, Parallel, Route, Join, Graph, HumanInput, Interrupt)
- Emit completion/failure events

4. PersistSet
- Write responses
- Update request status
- Decrement downstream dependency counters
- Schedule retries on failure or rate-limit

5. CleanupSet
- Despawn finished entities
- Record metrics and tracing summaries

## State Model

Use two layers of state:

1. Durable state (DB, authoritative)
- Request status
- Lock ownership
- Pending dependency count
- Scheduled execution time
- Retry count
- Response records
- Workflow context needed for resuming

2. Ephemeral state (ECS, runtime)
- In-flight execution context
- Temporary tool outputs
- Current node executor data
- Tick-local diagnostics

Rule: any state needed for crash recovery must be persisted in DB, not only in ECS.

## Proposed Core Types (Rust)

### Resources
- EngineRegistryResource
  - tools
  - models
  - scripts
  - agents
- PersistenceResource
  - claim, lock, write response, decrement dependency, retry methods
- RuntimeConfigResource
  - polling interval, batch size, retry policy
- MetricsResource
  - counters and timings

### Components
- RequestEntity
  - request_id, status, priority, scheduled_at
- AstNodeComponent
  - deserialized node payload
- ExecutionContextComponent
  - user/project/session/request scope + input/state
- DependencyComponent
  - pending_dependencies, notify_id
- RetryComponent
  - retry_count, next_attempt
- LockComponent
  - worker_id, locked_at

### Events
- RequestClaimed
- RequestExecutionStarted
- NodeCompleted
- NodeFailed
- DependencySatisfied
- HumanInputRequested
- InterruptRaised

## Behavior Parity Rules

To match existing Curator behavior:

- Keep DB-first locking and status transitions
- Preserve notify/dependency mechanics for Sequential and Parallel
- Preserve two-phase handling for Route and Graph transitions
- Preserve WAITING_FOR_USER semantics for human input nodes
- Preserve priority and interrupt handling
- Keep retries deterministic and bounded

## Failure and Retry Strategy

- Classify failures as transient vs terminal
- Retry transient failures with exponential backoff
- Persist retry metadata on every failure
- Move to FAILED after max attempts
- Keep all status transitions observable via logs and metrics

## Incremental Delivery Plan

### Phase 1: Runtime Shell
- Headless Bevy app and orchestration plugin
- Claim and persist loop only
- No AST execution yet

### Phase 2: Deterministic Nodes
- Implement Tool, Script, SetState, Join
- Validate DB transitions and outputs

### Phase 3: Control Flow Nodes
- Implement Sequential, Parallel, Route, Graph
- Validate dependency and wake-up behavior

### Phase 4: Agent and Human Nodes
- Implement Agent loop and HumanInput pause/resume
- Validate parity against TypeScript behavior

### Phase 5: Interrupts and Hardening
- Implement interrupt preemption/resume
- Add metrics, tracing, and recovery tests

## Validation Checklist

- Headless app starts and ticks without rendering/window plugins
- Request claim lock is atomic and safe under concurrency
- Completed nodes always persist outputs
- Dependency decrements wake downstream requests correctly
- Crash recovery resumes from durable state
- Retries follow configured policy
- Behavior matches TypeScript engine on parity test cases

## Minimal Skeleton (Pseudo-code)

```rust
fn main() {
    App::new()
        .add_plugins(MinimalPlugins)
        .add_plugins(ScheduleRunnerPlugin::run_loop(tick_duration))
        .add_plugins(CuratorOrchestratorPlugin)
        .run();
}

pub struct CuratorOrchestratorPlugin;

impl Plugin for CuratorOrchestratorPlugin {
    fn build(&self, app: &mut App) {
        app
            .init_resource::<RuntimeConfigResource>()
            .init_resource::<EngineRegistryResource>()
            .init_resource::<MetricsResource>()
            .add_event::<RequestClaimed>()
            .add_event::<NodeCompleted>()
            .add_event::<NodeFailed>()
            .configure_sets(
                Update,
                (ClaimSet, MaterializeSet, ExecuteSet, PersistSet, CleanupSet).chain(),
            )
            .add_systems(Update, claim_requests.in_set(ClaimSet))
            .add_systems(Update, materialize_requests.in_set(MaterializeSet))
            .add_systems(Update, execute_nodes.in_set(ExecuteSet))
            .add_systems(Update, persist_results.in_set(PersistSet))
            .add_systems(Update, cleanup_finished.in_set(CleanupSet));
    }
}
```

## Scope Boundaries

This document covers orchestration design in Rust + Bevy.

It does not prescribe:
- UI behavior
- Frontend transport contracts
- Prisma schema changes

Those should be handled in separate implementation documents if needed.

## Next Step

Implement a first compile-safe orchestration skeleton in `curator-rust/src` with:
- plugin + system sets
- resources/events/components definitions
- no-op executor path for one node type
- logging and metrics stubs

## Implemented Foundation: In-Memory State + Optional Crash Log

The crate now includes a reusable memory subsystem in `src/workflow_memory.rs`.

What it provides:
- `MemoryStore`: async-safe in-memory state (`tokio::RwLock`) for request and conversation state
- Event-sourced updates (`MemoryEvent` / `MemoryEventKind`) for deterministic replay
- Optional crash logging through `CrashLogStore`
- Built-in `JsonlCrashLogStore` for immediate persistence + resume
- Generic `OrmCrashLogRepository` and `OrmCrashLogStore` adapter for DB/ORM-backed logs

Crash-resume flow:
1. Every state mutation becomes a sequenced `MemoryEvent`
2. If a crash log backend is configured, the event is appended first
3. Event is applied to in-memory snapshot
4. On startup, `recover_from_log()` replays events after `last_sequence`

This means you can run fully in-memory for speed, then toggle crash durability by plugging in either:
- JSONL file log backend (no external DB required)
- ORM-backed repository adapter (SeaORM / Diesel / custom)
