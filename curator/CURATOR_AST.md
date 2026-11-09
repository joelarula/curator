# Curator AST Node Reference

The `CuratorAstNode` types define the structural building blocks for creating AI workflows and agentic pipelines in Curator. 

These workflows are represented as JSON Abstract Syntax Trees (ASTs) which are stored directly in the `Request` table of the database and evaluated by the background `CuratorRequestProcessor` worker.

Below is a detailed guide on how every supported node type is structured, how it is handled under the hood, and how you can use it in your scripts.

---

## 1. `Curator_Agent`

The workhorse of the AST. It represents an autonomous LLM execution. 

### Usage Example
```json
{
  "type": "Curator_Agent",
  "agentName": "Summarizer",
  "model": "gemini-2.5-flash",
  "instruction": "You are a helpful summarization assistant.",
  "prompt": "Please summarize this text: {{INPUT}}",
  "provider": "gemini",
  "tools": ["web_scraper", "process_feed"]
}
```

### How it is handled
* **Direct Mode:** If `tools` is omitted or empty, the processor simply calls the LLM with your prompt and instructions, awaits the output, and saves it to a `Response`.
* **Agentic Mode:** If `tools` are provided, the processor enters an iterative ReAct-style loop (up to 10 iterations). The LLM can choose to invoke tools, and the processor executes the actual tool logic, feeds the results back to the LLM, and repeats until the LLM returns a final string.
* **Providers:** Supports `gemini` (using `@google/genai`) or `local` (using OpenAI-compatible endpoints like `llama.cpp` via `baseUrl`).
* **Only offered tools run:** a tool call for a tool that was not offered to this agent is answered with a "not found" error, even if the tool is registered in the engine.
* **Dynamic choices:** `tools` may be an expression instead of a list, e.g. `"tools": "$state.options"` or `"$context.item.options"`. It is evaluated in the flow's context on every agent turn and must yield an array of tool names (or inline tools); any other value fails the agent. An empty array means direct mode.
* **Conversation history:** `history_from: "conversation"` builds the prompt from the shared conversation as this agent sees it (own turns as `assistant`, others as labelled `user` turns, whispers and tool output only for their audience); `history_events` lists bus events with `payload.text` to include. See `CONVERSATION_CONTEXT.md`.

---

## 2. `Curator_Sequential`

Used to execute a sequence of AST nodes strictly one after another. The output of one step is automatically injected into the `prompt` of the next step (by replacing `{{INPUT}}` or simply appending to the prompt).

### Usage Example
```json
{
  "type": "Curator_Sequential",
  "name": "Data Pipeline",
  "subAgents": [
    {
      "type": "Curator_Tool",
      "toolName": "process_feed",
      "parameters": { "url": "http://example.com/rss" }
    },
    {
      "type": "Curator_Agent",
      "prompt": "Summarize the following JSON:\n{{INPUT}}"
    }
  ]
}
```

### How it is handled
It uses a highly durable **database-backed reverse-linked list**:
1. The processor iterates over the `subAgents` array **backwards**.
2. It inserts the last step as a new `Request` with `pendingDependencies: 1`.
3. It inserts the previous step with `notifyId` pointing to the step after it.
4. The *first* step is inserted with `pendingDependencies: 0`.
5. The processor picks up the first step. When it finishes, it decrements the dependency counter of the next step, effectively waking it up to run next.

---

## 3. `Curator_Parallel`

Executes multiple AST nodes concurrently.

### Usage Example
```json
{
  "type": "Curator_Parallel",
  "name": "Parallel Research",
  "subAgents": [
    { "type": "Curator_Agent", "prompt": "Research the history of Rome." },
    { "type": "Curator_Agent", "prompt": "Research the history of Greece." }
  ]
}
```

### How it is handled
1. The processor first inserts a special `Curator_Join` request into the database with `pendingDependencies` equal to the number of sub-agents.
2. It then iterates through all `subAgents`, inserting them as new Requests with `pendingDependencies: 0` and their `notifyId` pointing to the `Join` request.
3. Because all sub-agents have `0` dependencies, the database polling loop will pick them all up and execute them in parallel across available workers.

### Private scopes (`isolate`)
Set `"isolate": true` (Coffee: `isolated "name", ...branches`) to give each branch a private state scope named after the branch. Inside a branch, `set_state` / `assign` writes and `$state` reads go to that scope (layered over shared state), so sibling branches cannot read each other's data. The `Curator_Join` and anything after it only see shared state. Isolation is opt-in; without it all branches share conversation state.

---

## 4. `Curator_Join`

A synchronization primitive automatically injected by `Curator_Parallel`. You rarely need to write this manually.

### How it is handled
* It remains dormant in the database until its `pendingDependencies` hits `0` (meaning all parallel sub-agents have finished and notified it).
* Once awakened, it fetches the Responses of all completed child requests, concatenates their text content separated by `---`, and saves the combined result as its own Response.

---

## 5. `Curator_Tool`

Directly executes a predefined TypeScript tool without the overhead or unpredictability of an LLM.

### Usage Example
```json
{
  "type": "Curator_Tool",
  "toolName": "process_feed",
  "parameters": {
    "url": "http://example.com/feed.xml",
    "limit": 5
  }
}
```

### How it is handled
The processor looks up the `toolName` in the `toolRegistry`. If found, it runs the tool's `runAsync` method passing in your `parameters` (or `args`). The resulting JSON or string is saved directly as the step's Response.

---

## 5b. `Curator_Reduce`

Runs a pure, deterministic function that a plugin registered under `reducers` (`CuratorReducer`: args in, state fields out). Use it for game or domain rules; use a `Curator_Tool` for anything that touches the database, the network or the session user.

### Usage Example
```ts
reduce('poker_table_command', { state: '$state.gameState', command: { type: 'act', action: '$params.action' } })
```
```json
{ "type": "Curator_Reduce", "reducer": "poker_table_command", "args": { "state": "$state.gameState", "command": { "type": "act" } } }
```

### How it is handled
`args` are evaluated like tool args (nested `$…` expressions included) and passed to the reducer. No RBAC check, approval, tool event or tool record: reducers have no side effects to guard. The returned object is bound like tool output: its fields are merged into context and conversation state, or, with `spread: false`, kept only under `as`. A missing reducer or a non-object result fails the step.

---

## 6. `Curator_Script`

Executes arbitrary JavaScript logic securely inside the pipeline. Useful for data transformation, formatting, or custom routing between steps.

### Usage Example
```json
{
  "type": "Curator_Script",
  "language": "javascript",
  "code": "const data = JSON.parse(input); return data.map(d => d.title).join(', ');"
}
```

### How it is handled
The processor creates a sandboxed `node:vm` context. It injects the `input` (the output of the previous step) and evaluates your code. The returned value is stringified and saved as the Response.

---

## 7. `Curator_Route`

Provides dynamic branching logic based on a routing decision. 
The node executes a `router` function (which can be a Script, an Agent, or a Tool), and uses the resulting output string as a key to look up which sub-agent branch to execute next.

### Usage Example
```json
{
  "type": "Curator_Route",
  "name": "Topic Router",
  "router": {
    "type": "Curator_Script",
    "language": "javascript",
    "code": "if (input.includes('Rome')) return 'history'; else return 'other';"
  },
  "subAgents": {
    "history": { "type": "Curator_Agent", "prompt": "Research history: {{INPUT}}" },
    "other": { "type": "Curator_Agent", "prompt": "General response: {{INPUT}}" }
  },
  "defaultRoute": "other"
}
```

### How it is handled
To ensure high durability, routing is processed in a **two-phase sequence**:
1. **Phase 1**: The processor suspends the `Curator_Route` Request, marking it with `pendingDependencies = 1`. It then spawns the `router` AST as a separate, new Request.
2. **Phase 2**: When the `router` Request finishes, it wakes the `Curator_Route` up, passing its output string back as input. The processor resumes `Curator_Route`, looks up the key in `subAgents`, and then dynamically spawns the chosen sub-agent branch. The chosen sub-agent seamlessly inherits the place in the sequence so subsequent steps continue automatically.

---

## 8. `Curator_Graph`

Provides full support for Finite State Machines (FSMs) and arbitrary cyclic graphs (similar to ADK graphs or LangGraph).
A graph defines a set of `nodes` (states) and `edges` (transitions). 

Edges can be either:
1. A **static string** pointing to the next node name.
2. A **conditional router** (an AST Node like a Script or Agent) that evaluates the current state and outputs the next node name.
3. **Guarded transitions** `[{ "to": "Deal", "when": "output.status == 'CONTINUE'" }, { "to": "__end__" }]`, checked in order; the first match wins. `when` sees the state's output as `output`/`input` (JSON objects parsed) plus `$state`/`$context`. No match, or no edge at all, ends the graph.

Returning the literal string `"__end__"` as a transition will terminate the graph.

Bevy-style state hooks (all optional):
* `onEnter: { State: node }` runs before the state's body each time it is entered (`OnEnter`).
* `onExit: { State: node }` runs after the state's transition is chosen, also on self-transitions and on the way to `__end__` (`OnExit`).
* `stateKey: "phase"` mirrors the active state into `$state.phase` (`'__end__'` when finished), so other flows can gate on it. It already holds the new state during `onEnter`.

* With `stateKey`, every transition is also announced as the event `state:<stateKey>` with `{ from, to }` (`from` is `null` for the start state, `to` is `'__end__'` at the end), so systems can react to it (Bevy `StateTransitionEvent`).
* `startNode` may be guarded transitions instead of a name, e.g. `[{ "to": "BOOT", "when": "$context.tableId" }, { "to": "MENU" }]`.

Order per transition: body → transition chosen → `onExit[from]` → `stateKey` written and announced → `onEnter[to]` → body of `to`. State bodies and hooks inherit the graph's context, `projectId` and `scriptId`, with the previous state's output as `input`. The `stateMachine()` builder declares each state's `run`/`onEnter`/`onExit`/`next` together (see `minigames/poker/src/workflows/pokerWorkflow.ts`).

### Usage Example
```json
{
  "type": "Curator_Graph",
  "name": "Traffic Light FSM",
  "startNode": "RED",
  "nodes": {
    "RED": { "type": "Curator_Script", "code": "(() => { return 'done'; })()" },
    "GREEN": { "type": "Curator_Script", "code": "(() => { return 'done'; })()" }
  },
  "edges": {
    "RED": {
      "type": "Curator_Script",
      "code": "(() => { return input === 'STOP' ? '__end__' : 'GREEN'; })()"
    },
    "GREEN": "RED"
  }
}
```

### How it is handled
The processor manages graph state explicitly in the database using the Request's `context.activeNode` and `context.stateData`. 
When a node runs, its output replaces `stateData`. 
When a router runs, its output replaces `activeNode` (deciding the next transition), but `stateData` is safely preserved so the next node receives the payload from the previous node. This guarantees full durability even across infinite loops.

---

## 9. `Curator_HumanInput`

Provides a native "Human-in-the-Loop" pause mechanism. The execution engine will completely suspend the workflow and wait until a user provides input. 

This node acts as a bridge to your frontend UI. When evaluated, the request is marked `WAITING_FOR_USER` and the engine goes to sleep. Once the frontend inserts a user's answer into the database (as a `Response`), the engine instantly wakes up and deep-merges the answer into the global `Conversation.state`.

### Usage Example
```json
{
  "type": "Curator_HumanInput",
  "prompt": "Please review the generated essay and provide feedback.",
  "inputType": "text"
}
```

### Supported inputType values
* `'text'` (default): Requests a text string from the user.
* `'choices'`: Shows the user a list of options (must provide the `choices` string array).
* `'file'`: Requests a file upload.

### Timeouts
Set `timeoutSeconds` (Coffee: `prompt(text, 'text', undefined, { as, timeoutSeconds })`) to bound the wait. If no answer arrives by the deadline, the request completes with a `HUMAN_TIMEOUT` Response and nothing is bound to `as`, so a script can loop and re-prompt by checking `$state.<as>`.

---

## 9b. Events: `Curator_EmitEvent` and `Curator_WaitEvent`

* `emit_event name, payload, targetAgentId` records the event in the conversation's `EventLog` and wakes matching waiters/subscriptions. Omit `targetAgentId` to broadcast to every listener; pass an agent id to address only that agent (a plain string like `"b"` is taken literally; `$...` / `{{...}}` is evaluated).
* `wait_event name, alias, { timeoutSeconds }` parks the request until a matching event arrives and binds the payload to `alias`.
* **Lossless:** each request has an `eventCursor`. A wait first consumes the earliest logged event after its cursor (and addressed to it or to everyone), so an event emitted before the waiter parked is not lost. A flow's first wait only sees events logged before its anchor (chain end or Join) was created; by default late joiners do not replay older events. Set `replay: true` (`wait_event "news", "item", { replay: true }`) to make a flow's first wait start from the beginning of the conversation's log, then consume the backlog in order; later waits continue from the cursor.
* **Timeout:** with `timeoutSeconds`, a wait with no event by the deadline completes with a `WAIT_TIMEOUT` Response, nothing is bound to `alias`, and the flow continues so it can branch on the empty alias. An event arriving first wins and no timeout is recorded.
* **Run-time lists (`Curator_EmitEvents`):** `emitEvents('$state.events')` evaluates its expression to `[{ name, payload?, targetAgentId? }]` and emits each event in order, through the same matcher as `emit_event`. Use it when the events are only known at run time, typically what a `Curator_Reduce` step reports. Payloads are data and are not evaluated again (a string like `"$state.x"` stays literal); they are stamped with `conversationId` / `sessionId` like any emitted payload. The step's Response is an `EVENTS_EMITTED` record. A value that is not a list of named events fails the step.

---

## 9c. `Curator_ActorRef`

Lets the acting entity decide who plays a turn (Bevy `register_agent_system`). `actor` resolves the entity, `kind` (default `$actor.kind`, evaluated with `$actor` bound) picks a handler ref from `handlers` (`'default'` is the fallback), and the handler runs as an isolated child `Curator_Call` with the actor as `$params.actor`. Its result lands under `as`. Handlers may suspend (human input, waits). A missing handler fails the request.

```json
{
  "type": "Curator_ActorRef",
  "actor": "$state.gameState.players[$state.gameState.activePlayerIdx]",
  "kind": "$actor.isHuman ? 'human' : 'llm'",
  "handlers": { "human": "#human_decision", "llm": "#ai_decision" },
  "as": "turnAction"
}
```

Builder: `actorRef(actor, { human: humanDecision, llm: aiDecision }, { kind, as })`. Like a child call, it is not allowed inside inline subroutines.

---

## 9d. Systems, typed events and states (builder)

Systems are the Bevy `add_systems` counterpart. They compile to module `subscriptions`, so there is no new node type. Every system starts its handler as its own flow whenever its trigger fires and its run condition holds:

```ts
const Bet = defineEvent<{ amount: number }>('bet');          // typed event: .emit() .wait() .on() .payload()
const phases = defineStates('phase', Phase);                   // run conditions + triggers for a stateKey

defineModule('game', () => {
  system({ on: phases.entered(Phase.BET), run: onBetEntered }); // Bevy OnEnter
  system({ on: Bet, runIf: phases.in(Phase.BET), run: logBet }); // event + in_state run condition
  return stateMachine(Phase.DEAL, { ... }, { stateKey: phases });
});
```

* `runIf` and the trigger's filter are combined into the subscription's `when`, which sees the payload (`event`, or the `as` alias) and `$state`.
* Systems chain through the events they emit (intent → validated → applied); there is no separate ordering construct.
* Subroutines referenced by a module (calls, actor handlers, systems) are included in it automatically.
* `stepUntil` runs a conversation until nothing is runnable: a flow parked at a wait does not stop concurrent flows (systems, subscriptions), and the wait is reported once the conversation is idle.

---

## 10. Conversation Patterns (State Machines, Systems & Deterministic Tools)

Multi-agent and human-agent conversations in Curator follow a strict separation of concerns:

1. **Temporal & Dynamic Orchestration is DB + AST Driven**: Turn-taking loops, waiting for replies/ballots/bids, phase transitions, and concurrent side-channels are expressed as durable AST nodes (`Curator_Graph` via `stateMachine`, `Curator_Subscribe` via `system`, `Curator_WaitEvent`, `Curator_EmitEvent`, `Curator_ActorRef`) persisted in `Request`, `EventLog`, and `Conversation.metadata` (`ConversationStateLog`).
2. **Deterministic Governance & State Logic is Tool + Reducer Driven**: Roster updates, floor lock release, quorum tallying, role resolution, catch-up snapshots, and capability leases are executed deterministically via pure reducers and standard `Curator_Tool` definitions (`src/conversations/ConversationTools.ts`).

### 10a. Typed Conversational Events & States (`ConversationWorkflows.ts`)

`ConversationEvents` provides typed event handles (`defineEvent`) that can be emitted, awaited, or subscribed to in any workflow module:

* **Lifecycle & Presence:** `ParticipantJoined` (`conversation:joined`), `ParticipantLeft` (`conversation:left`)
* **1:1 Dialog:** `DialogTurnSubmitted` (`conversation:dialog_turn`)
* **M:N Forum & Quorum:** `ProposalPosted` (`conversation:proposal_posted`), `BallotCast` (`conversation:ballot_cast`), `QuorumReached` (`conversation:quorum_reached`), `ConsensusSynthesized` (`conversation:consensus_synthesized`)
* **1:N Q&A / RFP Auctions:** `TenderSolicited` (`conversation:tender_solicited`), `BidSubmitted` (`conversation:bid_submitted`), `TenderAwarded` (`conversation:tender_awarded`)
* **Turn-Invariant Side Channels:** `AmbientSpeech` (`conversation:ambient_speech`), `AmbientSpoken` (`conversation:ambient_spoken`)

State machine phase handles (`DialogPhaseState`, `ForumPhaseState`, `QAPhaseState`) are defined with `defineStates`, enabling `in(...)`, `entered(...)`, and `exited(...)` guards across concurrent systems.

### 10b. Reusable AST State Machines

The `conversations` module exports three parameterized `stateMachine()` builders (and pre-compiled `CuratorModuleNode` scripts in `CONVERSATION_WORKFLOW_ASTS`):

1. **Bilateral 1:1 Dialog (`buildDialogStateMachine` / `conversation_dialog_workflow`)**
   * `BOOT` → initializes the room via `tool('conversation_start')` → `INITIATOR_TURN` ↔ `RESPONDER_TURN` (waits on `DialogTurnSubmitted`, increments `$state.turn`, swaps `$state.activeSpeaker`) → `COMPLETED` (when `speechAct == 'ACCEPT'` or `turn >= maxTurns`).
2. **M:N Forum Deliberation & Quorum (`buildForumStateMachine` / `conversation_forum_workflow`)**
   * `BOOT` → `OPEN_FLOOR` (waits on `ProposalPosted`) → `VOTING` (waits on `BallotCast`, runs `onBallotCastSub` inline to deterministically tally votes via `conversation_vote` tool until `$state.quorumReached == true`) → `SYNTHESIS` (waits on `ConsensusSynthesized`) → `CONCLUDED`.
3. **1:N RFP / Catechism Bid Collection (`buildQAStateMachine` / `conversation_qa_workflow`)**
   * `BOOT` → `COLLECT_BIDS` (waits on `BidSubmitted` until `$state.bidsCount >= minBids`) → `AWARD` (waits on `TenderAwarded`) → `CLOSED`.

```ts
import {
  defineModule,
  seq,
  buildForumStateMachine,
  buildConversationSystemsModule,
} from '@curator/agent-server';

// Embed a formalized quorum deliberation state machine inside a MiniApp module
export const rfcDeliberationModule = defineModule('rfc_deliberation', () =>
  seq('rfc_room', [buildForumStateMachine({ requiredVotes: 3 })])
);
```

### 10c. Reactive Conversation Systems (`buildConversationSystemsModule`)

`conversationSystemsAst` (`buildConversationSystemsModule()`) registers four reactive `system()` handlers that run alongside any workflow or game loop:

* **`onParticipantJoinSub` (`on: ParticipantJoined`)**: Calls `conversation_join` to bind the participant's conversational role, grant TTL-bounded tool capability leases, and generate a catch-up snapshot.
* **`onParticipantLeaveSub` (`on: ParticipantLeft`)**: Calls `conversation_leave` to revoke active capability leases, release the speaking floor if held by the leaving agent, and recalibrate `quorum.requiredVotes` to remaining active participants.
* **`onBallotCastSub` (`on: BallotCast`)**: Calls `conversation_vote` to deterministically evaluate approvals/rejections against `requiredVotes`, updates `$state.quorumReached`, and emits `QuorumReached` when consensus threshold is reached.
* **`onAmbientSpeechSub` (`on: AmbientSpeech`)**: Dual-track turn-invariant system for table talk, banter, gossip, and private whispers (`targetId`). Emits `AmbientSpoken` (scoped to `targetId` for whispers) without advancing the formal turn counter.

### 10d. Deterministic Conversation Tools (`ConversationTools.ts`)

Registered automatically on every `CuratorHost` via `createConversationPlugin(host.conversations)`:

| Tool Name | Access Level | Deterministic Responsibility |
| :--- | :--- | :--- |
| `conversation_start` | `safe_write` | Initializes `ConversationRoomMetadata` (`governance`, `quorum`, `customState`) and appends a `state:patch` to `ConversationStateLog`. |
| `conversation_join` | `safe_write` | Updates participant roster (`reduceRoomJoin`), binds `conversationalRole`, grants leases via `ExposurePolicyController`, and returns `ConversationStateCatchup`. |
| `conversation_leave` | `safe_write` | Removes participant (`reduceRoomLeave`), revokes session leases, releases active floor lock, and recalibrates quorum `requiredVotes`. |
| `conversation_vote` | `safe_write` | Records a participant's ballot (`approve` / `reject` / `abstain`) and deterministically computes `evaluateQuorum` (`approvals`, `rejections`, `quorumReached`, `approved`, `status`). |
| `conversation_sync` | `safe_read` | Computes a deterministic `ConversationStateCatchup` snapshot (turn, contextState, roster, activeSpeaker, recent turns). |
| `conversation_resolve_role` | `safe_read` | Resolves an abstract communicative role (`@role:chair`, `@role:critic`) to physical `AgentEndpoint[]` from room metadata or Prisma `Agent` records (strictly decoupled from RBAC security roles). |
| `conversation_grant_lease` | `safe_write` | Grants a time-bounded / invocation-bounded `EphemeralToolLease` on `ExposurePolicyController`. |
| `conversation_revoke_lease` | `safe_write` | Immediately revokes an active `EphemeralToolLease`. |

### 10e. Fluent Builders & Role-Scoped Composables

`FluentDialogBuilder` (`dialog()`) and `FluentForumBuilder` (`forum()`) combine deterministic tool calls with event-driven AST steps and role scoping (`as_role`, `role`):

```ts
import { forum, dialog, as_role } from '@curator/agent-server';

// Deterministic tool setup + event-driven deliberation in a Forum
const forumFlow = forum('curator://forums/rfc-101')
  .start_room({ topic: 'Adopt Event-Sourced State Log', requiredVotes: 2 })
  .join_room({ agentId: 'alice', role: 'proposer', capabilities: ['submit_patch'] })
  .propose({ title: 'RFC-101', body: { storage: 'EventLog' } })
  .cast_vote_tool({ agentId: 'bob', ballot: 'approve', rationale: 'Clean separation' })
  .await_quorum()
  .synthesize({ conclusion: 'Approved by quorum' })
  .build();

// Role-scoped bilateral dialog
const reviewFlow = as_role('developer', () =>
  dialog({ role: 'architect' })
    .start_room({ topic: 'Schema Review' })
    .say('Ready for review')
    .wait_reply('architectReply')
    .build()
);
```

---

## 11. Loop & Scheduling Nodes (`Curator_Loop`)

`Curator_Loop` is supported by `CuratorRequestProcessor` in two forms:
* **Condition / Collection Loops (`repeat`)**: Iterates `agent` until `until` evaluates to true, while `while` holds, or over elements of `over` (bounded by `maxIterations`).
* **Scheduled Loops (`every`)**: Supervised by `AgentScheduleSupervisor` (`superviseAgentLoops`), executing `agent` on a 5-field cron expression or interval (`"every 10 minutes"`, `"at 14:00"`).

## 12. Fault policies (`retry`, `timeoutMs`, any node)

Every node accepts a fault policy (`src/engine/FaultPolicy.ts`):

```json
{
  "type": "Curator_Tool", "toolName": "crm.lookup", "args": {},
  "retry": { "maxAttempts": 4, "backoff": { "initialMs": 1000, "factor": 2, "maxMs": 30000, "jitter": true }, "retryOn": ["transient", "rate_limit", "lock (held|busy)"] },
  "timeoutMs": 20000,
  "onError": { "type": "Curator_Tool", "toolName": "notify_ops", "args": {} }
}
```

Builder: `CuratorCoreBuilder.withRetry(node, { maxAttempts: 4 }, { timeoutMs: 20000 })`, combined with `withFallback` for `onError`.

### How it is handled
* **Error classes**: `rate_limit` (429, quota, "retry in Ns"), `transient` (5xx gateway errors, ECONNRESET, fetch failed, ...), `timeout` (`timeoutMs` passed), `tool_error` (a tool threw something else), `error` (anything else). `retryOn` entries that are not class names are case-insensitive regexes on the error message.
* **Defaults**: a node without `retry` retries only `rate_limit`, 5 times (5s doubling, or the server's "retry in Ns"), as before. A declared `retry` defaults to `maxAttempts: 3`, `retryOn: ['rate_limit', 'transient', 'timeout']`, `initialMs: 1000`, `factor: 2`, `maxMs: 300000`, `jitter: true` (delay scaled by 0.5 to 1). `maxAttempts: 1` turns retries off.
* **Retry**: the same Request runs again after the delay (`retryCount` + 1, `scheduledAt` moved); a failed attempt leaves no Response, and is recorded as a StepTrace row with status `RETRY` plus a `request_retry` event. An attempt that already created requests (children) is never retried, so nothing runs twice.
* **Exhausted or not retryable**: the node ends `FAILED` and normal failure handling runs: `onError` if set, otherwise dead letter, downstream poisoning, or the Join's tolerance of failed branches.
* **Tools**: without `retry`, a throwing tool still completes the node with `[Tool Error] ...` (unchanged). With `retry`, the throw fails the attempt; it keeps its cause's class (a tool hitting a rate limit is `rate_limit`), otherwise `tool_error`.
* **`timeoutMs`** limits one attempt of the node's own execution, not time parked waiting on children, humans or events (waits use `timeoutSeconds` / `onTimeout`). Past it, the attempt's abort signal fires (agents pass it to the LLM provider, tools get `toolContext.signal`), its later engine writes are discarded, and it fails as `timeout`. Gemini cancels client-side only, so the call may still be billed. Side effects a tool already made outside the engine are not undone.

## 13. Interrupts: structured pause/resume

Every wait a person or client resolves parks with one envelope, `context.__interrupt` (`src/engine/Interrupts.ts`), and is resumed through one entry point, the `conversation_resume` tool (`host.runTool('conversation_resume', { interruptId, value })`). `conversation_interrupts` lists the open ones.

```json
{
  "v": 1, "id": "42.1", "kind": "human_input", "requestId": 42, "conversationId": 7, "projectId": "p1",
  "prompt": "Pick one", "payload": { "inputType": "choices", "choices": [{ "id": "red", "label": "red", "value": "red" }] },
  "resumeSchema": { "enum": ["red", "blue"] }, "targetUserId": null, "deadline": "2026-11-09T12:00:00.000Z", "createdAt": "..."
}
```

| kind | parked by | resume value | effect |
|---|---|---|---|
| `human_input` | `Curator_HumanInput` (blocking) | matches `resume.schema` if declared | bound to `as` (context + state), else the step's result |
| `event` | `Curator_WaitEvent` | matches `resume.schema` if declared | bound to `payloadAlias`, like the event arriving; the event itself is not published (no subscriptions run) |
| `approval` | a gated `Curator_Tool`, or a gated tool call of a `Curator_Agent` | `{ approved: boolean, scope?: 'ONETIME' \| 'CONVERSATION' \| 'PERMANENT', reason?: string }` | approved: the approval is granted and the step runs again; denied: an `APPROVAL_DENIED` record, then the tool node's `onApprovalExpired` decides ('fail' fails the step, 'continue' completes it with `{ ok: false, denied: true }` under `as`) |

Declare a typed resume on a wait: `{ "type": "Curator_HumanInput", "prompt": "Amount?", "as": "amount", "resume": { "schema": { "type": "number", "minimum": 1 } } }`.

### How it is handled
* **Ids** are `<requestId>.<n>`; `n` counts the interrupts a request opened (`__interruptSeq`), so an answer to an older wait of the same request is refused.
* **Checks**: the interrupt must be open and visible to the caller's project (from the host session: the request's project, or `'system'`; requests without a project only for callers without one), `targetUserId` must match the resuming user, and the value must match `resumeSchema` (Ajv). A failed resume leaves the interrupt open.
* **Humans only**: `conversation_resume` refuses when an agent is the actor, so a model can never answer a prompt or approve its own gated tool call.
* **Events**: parking emits `curator:interrupt` (the envelope); a resume emits `curator:interrupt_resumed` and logs a `curator:interrupt_resumed` bus event with the value (for replay).
* Expiry (`APPROVAL_EXPIRED`) and timeouts (`HUMAN_TIMEOUT` / `WAIT_TIMEOUT`) close the interrupt as before. The older ways to answer (an event named `curator:choice` / the awaited event, a Response row on the parked request, the server's `approveRequest`) still work.
* A one-time approval needs no table (it rides on the request); `CONVERSATION` / `PERMANENT` scopes need the `ToolApproval` table (server schema).

## 14. Checkpoints, fork & replay

`src/engine/TimeTravel.ts`; tools `conversation_checkpoints`, `conversation_state_at`, `conversation_fork` (human callers only).

* **Checkpoints** are the conversation's state events (`EventLog`), each with the step that wrote it (`EventLog.source`), the changed keys and whether a fork can start after it. `conversation_state_at { conversationId, seq }` is the state right after one.
* **Fork** `{ conversationId, atRequestId | atSeq, statePatch?, scriptVersion? }` creates a new conversation (same project) that runs the original root again:
  * a replayable step (agent, tool, reducer, human input, event wait) that the original finished **no later than the fork point**, at the same position and with the same node, returns its recorded result and state writes: tools are not called, agents do not call the model, prompts do not ask again;
  * the fork point's step gets `statePatch` merged into state right after its own output;
  * everything after runs live; control flow always runs (it is deterministic and has no side effects);
  * a step before the fork point that the original never had, or that differs, **stops the fork** (the step fails with `Fork replay diverged at step <path>`) instead of running, so nothing irreversible repeats. With a different `scriptVersion`, such steps run live instead.
  * The original conversation is never changed.

### How it is handled
* **Lineage**: every request records its creator (`context.__createdBy`, `StepTrace.createdBy`). A step's path is its position in that tree: `r`, then `.k` for the k-th request its creator created (a Sequential creates its steps last to first, so its first step is `r.<n-1>`). In a fork each new request gets its path when created (`context.__forkPath`, counted with `__fork.spawn` events).
* **Records**: `StepTrace` keeps, per finished replayable step, its node hash, final context (secrets masked), result (`output`) and the state patches it wrote; roots keep their context. Request contexts are trimmed and finished conversations' event logs compacted, so StepTrace is the source: **a run can be forked while its StepTrace rows exist** (`stepTrace.ttlMs`, default 7 days). StepTrace is written in batches; a row lost with a crashed process makes a fork through that step diverge (it stops, it does not re-run).
* **Order**: "before the fork point" is by finish time (StepTrace time, then row id), not creation order.
* Runs recorded before this feature have no lineage and cannot be forked.

## 15. State merge rules and the fan-in contract

### Merge rules (`stateSchema`)
A `Curator_Module` (all its steps) or a `Curator_Parallel` (its branches, over the module's) declares how writes to a key combine (`src/engine/StateMerge.ts`):

```json
{ "type": "Curator_Parallel", "subAgents": [ ... ],
  "stateSchema": { "findings": { "merge": "append" }, "cost": { "merge": "sum" }, "best": { "merge": { "reducer": "pickBest" } } } }
```

| rule | result |
|---|---|
| `replace` | the written value (the default for keys without a rule) |
| `append` | list: current items, then the written item(s) |
| `union` | list: like append, skipping items already present (deep equality) |
| `sum` / `max` / `min` | numbers |
| `deepMerge` | objects, merged recursively |
| `{ reducer }` | a registered reducer called with `{ key, current, incoming }`, returning `{ value }` |

Rules are applied when the write is appended, under the conversation's state lock, so concurrent branches never lose a write. The state event stores the resulting values plus `merge` (rule per key) and `incoming` (the values as written); folding, rewind and compaction are unchanged, and fork replay re-applies the rules to `incoming`.

### Conflicts (`strict`)
At the Join, keys without a rule that two or more branches wrote are conflicts. With `strict` (default **on when a `stateSchema` applies**, module or parallel) the Join fails, naming the keys and branches; without any schema it logs a warning and the last write wins (as before). `strict: false` turns it off.

`isolate: true` branches write to private scopes; with `mergeBack: true` the Join merges each finished branch's scope into shared state, in branch order, through the rules (conflicting undeclared keys count as above).

### Fan-in contract (`join`)
```json
{ "type": "Curator_Parallel", "subAgents": [ ... ],
  "join": { "as": "outcome", "requires": { "min": 2 }, "onBranchFailure": "cancel_siblings", "timeoutMs": 60000 } }
```
* **Branch names**: a branch is named after its node's `name` (every node may have one), else `branch<i>`.
* **`as`**: `{ [branch]: { status, output } }` (status `COMPLETED`, `FAILED`, `CANCELLED` or `TIMEOUT`) in the Join's context and in state.
* **`requires`**: `'any'` (default: at least one branch succeeded, as before), `'all'`, or `{ min: n }`. Otherwise the Join fails (`onError` / downstream failure handling apply).
* **`onBranchFailure`**: `'continue'` (default) waits for every branch; `'cancel_siblings'` cancels the other branches and the Join decides by `requires`; `'fail_fast'` cancels them and fails the Join.
* **`timeoutMs`**: branches not back in time are cancelled (reported `TIMEOUT`) and the Join decides by `requires` (an internal `Curator_JoinTimeout` request is scheduled for it).
* Cancelling a branch cancels its waiting and pending steps, nested parallels included. A step a worker is running at that moment finishes, but nothing it hands over to runs.
* The Join's own result stays the branches' joined text.
