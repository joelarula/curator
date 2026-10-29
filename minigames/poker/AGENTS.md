# Poker Minigame Rules & Architecture

## Core Mental Model
1. **Curator Core (`@curator/agent-server`, `packages/host`) runs the workflows:** compiled AST modules, event matching, human suspensions, RBAC tool enforcement, persistence, and persona LLM deliberation.
2. **The poker engine (`pokerEngine.ts`, `pokerEvaluator.ts`, `pokerRules.ts`) is pure deterministic domain logic:**
   - Pure transitions `(rawState: PokerGameState, args) -> { gameState: PokerGameState }`; no DB, sockets, timers or prompt formatting.
   - Deterministic deck shuffling, 7-card evaluation, side pots and chip accounting.
   - Legal choices and action sanitizing (`getLegalChoices`, `sanitizeAction`); `getRulesDescription()` is the one rule text (the AI prompt uses it).
3. **The table reducer (`pokerTable.ts`) is the engine's one entry point for flows:** `reduceTable(state, command) -> { gameState, turn, events }` with commands `boot | join | leave | start | act`, registered as the plugin reducer `poker_table_command`.
   - After a command it advances on its own: completed streets are dealt, finished hands settle, the button rotates and the next hand starts, until a seat has to decide (`turn`, with its legal choices) or the game is over.
   - `events` lists what the step did (`ActionTaken`, `PhaseStreet`, `PhaseSettle`, `NewRound`, `PhaseDeal`) in order, each payload with its own `gameState` snapshot. The `table(...)` composables build one `Poker_Table` node (`plugins/pokerNodes.ts`): it runs the reducer, writes `gameState` / `turn` / `events` to `$state` first, then emits the list as it is.

## Workflow Architecture (Bevy-style: states + systems + events)
| Bevy | Poker workflows |
|---|---|
| `States` + `OnEnter`/`OnExit` | `stateMachine()` in `pokerWorkflow.ts` (table: `PokerTablePhase`) and `pokerLobby.ts` (lounge: `PokerLobbyPhase`), mirrored into `$state.tablePhase` / `$state.lobbyPhase` |
| `add_systems` + `run_if(in_state)` | `system({ on, runIf, run })` in systems-only modules: `tableRules.ts` (`poker_rules`) and `ambientReaction.ts` |
| Messages | typed handles in `models/pokerEvents.ts` (`ActionIntent.emit()`, `.wait()`, `.payload()`); `TablePhase` / `LobbyPhase` give `.in()` run conditions and `.entered()` / `.exited()` triggers |
| `register_agent_system` | `actorRef` in `playerTurn.ts`: the seat's kind picks its handler (`human_turn` / `agent_turn`), which receives the seat as `$params.actor` |

Table states are only what is not deterministic: `BOOT → BETTING → SUBMIT`, plus `PAUSED`, `EXITED`, `GAME_OVER`. A turn: `BETTING` (the seat's handler decides) → `SUBMIT` (emit `ActionIntent`, wait `ActionResolved`) → the `poker_rules` systems validate against `$state.turn.choices` (`ActionValidated` / `ActionRejected`) and apply through the reducer, then announce what happened (`ActionTaken`, `PhaseStreet`, `PhaseSettle`, `NewRound`, …). Rejected intents go back to the seat at most `MAX_TURN_REJECTIONS` times, then the engine sanitizes the action. Pausing and leaving are table states (`PAUSED`, `EXITED`); leaving only announces `SessionExited`, the `close_on_exit` rule closes the conversation.

## Conventions
- **Cross-state data lives in `$state`** (Bevy resources): `gameState`, `turn`, `events` (written by the reducer), `turnAction`, `turnResolution`, `resumeCmd`, `tableId`. Request context is local to a state; guards and systems read `$state` or the state's own `output`.
- **Seat data comes from `actor`** (`$params.actor`) inside seat handlers, not from re-deriving `players[activePlayerIdx]`.
- **Events go through `pokerEvents.ts` handles**, one payload shape per event; add new events there.
- **Systems belong to exactly one module.** A module embedded in several scripts (e.g. an agent profile's script) would register its systems more than once.
- **Seat handlers only decide**; applying an action is the rules' job.
- **Subroutines are registered automatically** when a module references them; do not list them by hand.
- **Reducers for rules, tools for I/O:** workflows reach the engine only through the `poker_table_command` reducer, run by `Poker_Table` nodes (the `table(...)` composables; no RBAC or tool record). The node looks the reducer up in the engine, so tests can swap in a canned one; a harness engine that is not a `CuratorEngine` needs `nodeHandlers: pokerNodeHandlers`. Bankroll, table listing/creation and closing are tools because they touch the DB and the session user. Pure helpers stay TypeScript functions; do not register a tool or reducer per engine step.
- **Events carry their own snapshot and imply no order or timing:** UIs render an event from its payload's `gameState`, not from the latest state.
- **Speech is an event**, never a state-mutating tool (`poker:speech`, `poker:ambient_spoken`).
- **Only the table-talk gate starts chatter.** `reduceTableTalk` (`engine/tableTalk.ts`, reducer `poker_table_talk`) turns speech, salient actions and showdowns into at most one `ChatterCue`; `speak_chatter` (`ambientReaction.ts`) lets the cued seat say one line (or nothing) one level deeper. Never emit `Speech` in reaction to `Speech` outside the gate: depth (`MAX_DEPTH`), one open cue per table, a per-hand line budget, seat cooldowns and a human rate limit are what keep chatter from echoing itself. Turn speech carries `origin: 'turn', depth: 0`.
- **No procedural runners:** never write imperative callback-based game simulators; workflows run only as compiled ASTs.
- **Typed enums over string literals** (`PokerActionType`, `PokerStreet`, `PokerSpeechAct`, `PokerTablePhase`, …). Closures passed to the builder are serialized into the VM, so embed enum values via template strings instead of referencing them inside closures.

## Verification
- `npx tsx --test test/poker_table_reducer.test.ts` (table reducer, no host), `npm run test:deterministic` (deterministic harness, rules pipeline) and `npm run test:replay` (full games, pause/resume/exit on a fake LLM).
- `npx tsx --test test/poker_rbac.test.ts` (RBAC enforcement).
- `npx tsx --test test/poker_table_talk.test.ts` (table-talk gate: depth, lock, budget, whispers, flood bounds).
- After changing `curator` builder/engine code, rebuild it (`npm --prefix ../../curator run build`): poker imports its `dist`.
- `test/concurrent_tables.test.ts` calls the real Gemini API when `GOOGLE_API_KEY` is set in `.env`.
