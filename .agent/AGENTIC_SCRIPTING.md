# Agentic Scripting Engine Handbook

This document defines the architecture and best practices for authoring **Scripts** and **Tool Chains** in the Padagaskar Curator system.

---

## 1. The Core Philosophy: "Everything is a Tool"
Orchestration is decoupled from LLM logic. Instead of the LLM performing a task directly, it should **synthesize a Script** that combines specialized tools.

- **Scripts** are stored recipes. They can be **Static** (JSON `toolCalls`) or **Dynamic** (JavaScript `body`).
- **Requests** are materialized executions of a Script.
- **Tools** are atomic, side-effect-heavy functions (e.g., `scrape_resource`, `upsert_text`, `ask_llm`).

---

## 2. Authoring Scripts with `ToolChain`
Dynamic scripts use a fluent, jQuery-style builder API.

### Basic Chaining
```javascript
const chain = ToolChain.start()
  .scrape_resource({ url: args.targetUrl })
  .then("ask_llm", { prompt: "Summarize this: {{scrape_resource.result}}" })
  .toJSON();
```

### Methods
- `.run(toolName, args)` / `.then(toolName, args)`: Adds a sequential tool call to the chain.
- `.spawn(toolName, args)`: Creates a **detached child Request**. This runs in parallel and does not block the current chain.
- `.onSuccess(childChain)`: Attaches a follow-up chain to the last tool. Runs if the tool succeeds and receives the `createdItem`.
- `.forEachItem(childChain)`: Attaches a fan-out chain. Runs once for every item in `result.extractedItems`.
- `.forEachItemYieldScript(scriptName)`: Like `forEachItem`, but uses a pre-existing Script by name for each extracted item.

---

## 3. Template Variables (Placeholders)
The system uses `{{handlebars}}` style syntax to inject data at runtime.

- `{{args.key}}`: Data passed into the script (e.g., `execute_script({ args: { url: "..." } })`).
- `{{toolName.field}}`: Data from a previous tool call in the same Request.
- `{{resource.field}}`: Data from the Resource(s) attached to the current Request.
- `{{item.field}}`: Data from the current item in a `forEachItem` loop.

---

## 4. Standard Tools Inventory
| Tool Name | Purpose | Key Inputs | Key Outputs |
| :--- | :--- | :--- | :--- |
| `scrape_resource` | Fetch and save a web page. | `url` | `createdItem` (Resource), `data` (Markdown) |
| `ask_llm` | General AI reasoning. | `prompt`, `systemPrompt` | `data` (Text result) |
| `extract_resource_links` | Web crawler core. | `url` | `extractedItems` (Links) |
| `upsert_text` | Save analysis/content. | `content`, `resourceId`, `role` | `createdItem` (Text) |
| `execute_script` | Recursive orchestration. | `scriptName`, `args` | `childRequestId` |

---

## 5. Best Practices for Agents
1. **Prefer Parallelism**: Use `.spawn()` for independent tasks (e.g., analyzing 10 different links) to maximize throughput.
2. **Atomic Tools**: Don't try to do everything in one `ask_llm` call. Scrape first, then summarize, then extract claims.
3. **Persist Early**: Use tools that create `Resource` or `Text` records so the user can see progress in the UI.
4. **Use Placeholders**: Always use `{{...}}` for dynamic data instead of hardcoding values in the script body. This makes scripts reusable and cacheable.
5. **Yield to Scripts**: Instead of giant nested chains, use `forEachItemYieldScript` to hand off to specialized sub-scripts.

---

## 6. Execution Sandbox
Scripts run in a Node.js `vm` context with limited access:
- **Available Globals**: `ToolChain`, `args`, `console`.
- **Restricted**: No `require`, no `fs`, no direct `fetch` (use tools instead).
- **Timeout**: Scripts must return a `toolCalls[]` array quickly. Long-running logic belongs in the tools themselves.
