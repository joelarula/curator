# Poker Minigame Rules & Architecture

## Core Mental Model
1. **Curator Core (`@curator/agent-server`, `packages/host`) runs the workflows:** compiled AST modules, event matching, human suspensions, RBAC tool enforcement, persistence, and persona LLM deliberation.
2. **The poker engine (`pokerEngine.ts`, `pokerEvaluator.ts`, `pokerRules.ts`) is pure deterministic domain logic:**
   - Pure transitions `(rawState: PokerGameState, args) -> { gameState: PokerGameState }`; no DB, sockets, timers or prompt formatting.
   - Deterministic deck shuffling, 7-card evaluation, side pots and chip accounting.
   - Legal choices and action sanitizing (`getLegalChoices`, `sanitizeAction`); `getRulesDescription()` is the one rule text (the AI prompt uses it).

## Workflow Architecture (Bevy-style: states + systems + events)
| Bevy | Poker workflows |
|---|---|
| `States` + `OnEnter`/`OnExit` | `stateMachine()` in `pokerWorkflow.ts` (table: `PokerTablePhase`) and `pokerLobby.ts` (lounge: `PokerLobbyPhase`), mirrored into `$state.tablePhase` / `$state.lobbyPhase` |
| `add_systems` + `run_if(in_state)` | `system({ on, runIf, run })` in systems-only modules: `tableRules.ts` (`poker_rules`) and `ambientReaction.ts` |
| Messages | typed handles in `models/pokerEvents.ts` (`ActionIntent.emit()`, `.wait()`, `.payload()`); `TablePhase` / `LobbyPhase` give `.in()` run conditions and `.entered()` / `.exited()` triggers |
| `register_agent_system` | `actorRef` in `playerTurn.ts`: the seat's kind picks its handler (`human_turn` / `agent_turn`), which receives the seat as `$params.actor` |

A turn: `BETTING` (the seat's handler decides) → `SUBMIT` (emit `ActionIntent`, wait `ActionResolved`) → the `poker_rules` systems validate (`ActionValidated` / `ActionRejected`) and apply (`ActionTaken`). Rejected intents go back to the seat at most `MAX_TURN_REJECTIONS` times, then the engine sanitizes the action. Pausing and leaving are table states (`PAUSED`, `EXITED`); leaving only announces `SessionExited`, the `close_on_exit` rule closes the conversation.

## Conventions
- **Cross-state data lives in `$state`** (Bevy resources): `turnAction`, `turnResolution`, `resumeCmd`, `tableId`. Request context is local to a state; guards and systems read `$state` or the state's own `output`.
- **Seat data comes from `actor`** (`$params.actor`) inside seat handlers, not from re-deriving `players[activePlayerIdx]`.
- **Events go through `pokerEvents.ts` handles**, one payload shape per event; add new events there.
- **Systems belong to exactly one module.** A module embedded in several scripts (e.g. an agent profile's script) would register its systems more than once.
- **Seat handlers only decide**; applying an action is the rules' job.
- **Subroutines are registered automatically** when a module references them; do not list them by hand.
- **Tools as boundaries:** workflows reach engine logic only through declared tools (`poker_start_hand`, `poker_apply_action`, `poker_deal_street`, …).
- **Speech is an event**, never a state-mutating tool (`poker:speech`, `poker:ambient_spoken`).
- **No procedural runners:** never write imperative callback-based game simulators; workflows run only as compiled ASTs.
- **Typed enums over string literals** (`PokerActionType`, `PokerStreet`, `PokerSpeechAct`, `PokerTablePhase`, …). Closures passed to the builder are serialized into the VM, so embed enum values via template strings instead of referencing them inside closures.

## Verification
- `npm run test:deterministic` (deterministic harness, rules pipeline) and `npm run test:replay` (full games, pause/resume/exit on a fake LLM).
- `npx tsx --test test/poker_rbac.test.ts` (RBAC enforcement).
- After changing `curator` builder/engine code, rebuild it (`npm --prefix ../../curator run build`): poker imports its `dist`.
- `test/concurrent_tables.test.ts` calls the real Gemini API when `GOOGLE_API_KEY` is set in `.env`.
