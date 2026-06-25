# curator-bevy-plugin

Standalone Bevy orchestration module for Curator runtime concerns.

This crate is intentionally separate from `curator-rust` (the local LLM server crate).

## Scope

- Bevy plugin module (`CuratorBevyPlugin`)
- In-memory workflow state (`MemoryStore`)
- Optional crash-resume event log backends
  - JSONL file backend (`JsonlCrashLogStore`)
  - ORM repository adapter (`OrmCrashLogRepository` + `OrmCrashLogStore`)

## Why Separate

`curator-rust` should remain focused on model serving (Axum + llama.cpp runtime).

`curator-bevy-plugin` handles orchestration/runtime state and can evolve independently for:
- headless scheduling
- request execution modeling
- crash recovery behavior
- ECS-based runtime diagnostics

## Memory System

`MemoryStore` is event-sourced:

1. State changes are represented as `MemoryEvent`
2. Optional crash log backend appends the event first
3. Event is applied to in-memory snapshot
4. On restart, `recover_from_log()` replays events after `last_sequence`

This allows pure in-memory mode for speed or durable mode for crash recovery.

## Integrating an ORM

Implement `OrmCrashLogRepository` in your data layer (SeaORM, Diesel, custom ORM), then wrap it in `OrmCrashLogStore`.

The plugin module does not force a specific ORM dependency.

## Runtime Engine

The crate now includes a persisted SQLite runtime processor that mirrors the TypeScript Curator scheduler shape:

- AST model parity in [src/ast.rs](src/ast.rs)
- Embedded SQLite schema and storage adapter in [src/sqlite_store.rs](src/sqlite_store.rs)
- Request polling and node handlers in [src/processor.rs](src/processor.rs)

Implemented execution handlers:
- `Curator_Agent`
- `Curator_Sequential`
- `Curator_Parallel`
- `Curator_Join`
- `Curator_Route`
- `Curator_Graph`
- `Curator_HumanInput`
- `Curator_AgentRef`
- `Curator_Script`
- `Curator_Tool`
- `Curator_SetState`
- `Curator_Interrupt`
- `Curator_Loop` (expanded to sequential iterations)

Scheduling behavior implemented:
- `NEW` request polling with `pendingDependencies == 0`
- `scheduledAt` parsing for relative schedule strings like `in 5 minutes`
- claim-locking by worker id
- notify/dependency wake-up behavior on completion
- retry backoff for transient errors
- `WAITING_FOR_USER` resume flow with optional `targetUserId`

## Current Limitations

- Agent execution is implemented as deterministic runtime text flow, not full Gemini ReAct parity yet.
- Script execution cannot run JavaScript directly in Rust; JSON AST script output is supported for dynamic spawn.
- Template interpolation parity with TypeScript is not yet implemented.

These were intentionally isolated so AST scheduling/data durability can be validated first.
