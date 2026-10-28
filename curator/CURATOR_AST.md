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

## 10. Unsupported / Experimental Nodes

The following nodes are defined in the types but are **currently ignored** by the `CuratorRequestProcessor`. If submitted, the processor will mark the request as `SKIPPED`.

* **`Curator_Loop`**: Intended for iterating a specific agent `maxIterations` times.
