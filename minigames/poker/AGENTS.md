# Poker Minigame Rules & Architecture

## Core Mental Model
1. **Curator Core (`@curator/agent-server`, `packages/host`) drives dynamic temporal workflows:**
   - Asynchronous process lifecycle, event matching, and execution loops.
   - Compiled AST state machines (`pokerWorkflow.ts`, `pokerLobby.ts`, `playerTurn.ts`, `ambientReaction.ts`).
   - Human turn suspensions (`choice`), event waiting (`waitEvent`), and ambient pub/sub (`emitEvent`).
   - Role-Based Access Control (RBAC) tool enforcement, conversation audit logging, and DB persistence.
   - Persona LLM deliberation and structured schema extraction.

2. **Poker Minigame Engine (`pokerEngine.ts`, `pokerEvaluator.ts`, `pokerRules.ts`) is pure deterministic domain logic:**
   - Pure, stateless transitions: `(rawState: PokerGameState, args) -> { gameState: PokerGameState }`.
   - Zero side-effects: no database queries, network sockets, timers, sleep intervals, or prompt formatting.
   - Card deck generation and deterministic shuffling.
   - 7-card hand evaluation and hand strength comparison (`evaluateBestHand`).
   - Pot distribution, side-pot slicing math, and chip accounting.
   - Legal choice calculation and action validation (`getLegalChoices`, `sanitizeAction`).

## Architecture & Boundary Principles
- **Tools as Boundaries:** AST workflows invoke deterministic logic strictly through declared tools (`poker_start_hand`, `poker_apply_action`, `poker_deal_street`, `poker_distribute_pots`).
- **No Procedural Runners:** Never write imperative callback-based game simulators (e.g. `playPokerHand` with `onTurn`/`onTableUpdate`). Workflows run exclusively as compiled ASTs through the Curator Request Processor.
- **Typed Enums over String Literals:** Use domain enum objects (`HandCategory`, `PokerActionType`, `PokerStreet`, `PokerStandingStatus`, `PokerSpeechAct`, `PokerGameOverResult`) across both engine and AST workflows.
- **Verification:** Always verify changes with `npm run test:deterministic` (deterministic harness) and `npx tsx --test test/poker_rbac.test.ts` (RBAC enforcement).
