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

Returning the literal string `"__end__"` as a transition will terminate the graph.

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

---

## 10. Unsupported / Experimental Nodes

The following nodes are defined in the types but are **currently ignored** by the `CuratorRequestProcessor`. If submitted, the processor will mark the request as `SKIPPED`.

* **`Curator_Loop`**: Intended for iterating a specific agent `maxIterations` times.
