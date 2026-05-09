# Multi-Step Agentic Workflow Architecture: The "Everything is a Tool" Model

Based on the goal of creating flexible, sophisticated prompt chains and deterministic pipelines, we will adopt a refined **Tool-Yielded Requests (Actor Model)**. 

To solve the issue of tight coupling and hardcoding, we will model **everything as a ToolCall**—including the text prompt generation and the configuration of what happens next.

## Core Philosophy: "Everything is a ToolCall"
Instead of treating LLM text generation as the default behavior and tool calls as an optional side-effect, we invert the paradigm: **The Request Processor ONLY executes tool calls.** 

If a user wants to generate AI text, they use an implicit or explicit `ask_llm` tool. If they want to process a feed, they use `process_feed`. 

### The ToolCall Arguments Define the Chain
To make the Actor Model perfectly flexible, tools will accept routing configuration (callbacks) directly within their `args`.

For example, a deterministic pipeline to parse a feed and then analyze each article:
```json
[
  {
    "name": "process_feed",
    "args": {
      "url": "http://uudised.err.ee/uudised_rss.php",
      "onItemExtracted": {
        "yieldTemplateName": "analyze_article",
        "passResourceId": true
      }
    }
  }
]
```

### The `analyze_article` Template (AI-driven Step)
The template that gets called next (`analyze_article`) would look like this:
```json
[
  {
    "name": "ask_llm",
    "args": {
      "model": "model:default",
      "prompt": "Extract the main claim and actors from the provided resource.",
      "availableTools": ["persist_claim", "persist_actor"]
    }
  }
]
```

## How It Works

1. **The Request Processor**: 
   - Reads the `Request`.
   - Iterates through the `Prompt.toolCalls` array.
   - Dispatches each tool call to the `executeTool` registry.

2. **The Tool Execution (`process_feed`)**:
   - Downloads the RSS feed.
   - For every extracted link, it creates a `URL` resource.
   - It checks its own `args` for an `onItemExtracted` configuration.
   - If present, it looks up the `PromptTemplate` named `"analyze_article"`.
   - It dynamically creates a new `Prompt` (attached to the new URL resource) and a new `Request` in the same `Conversation`.

3. **The Tool Execution (`ask_llm`)**:
   - Takes the `prompt` text from its arguments.
   - Fetches the resource content attached to the Request.
   - Sends the text + context to Gemini/OpenAI.
   - If the AI decides to use `persist_claim`, it adds `{ "name": "persist_claim", "args": {...} }` to the `Response.toolCalls` array.
   - The Request Processor sees the newly yielded tool calls in the Response, and immediately executes them.

## Advantages of this Architecture
- **No Hardcoding**: `process_feed` doesn't know what `analyze_article` does. It just blindly yields new Requests based on its input arguments.
- **Infinite Chaining**: `ask_llm` can yield `persist_claim`, which could theoretically have an `onSuccess` callback to yield `generate_social_post`.
- **Purely Deterministic or Purely AI**: You can build chains that never talk to an AI (Data scraping -> DB insertion) or chains that loop back and forth with an AI, using the exact same schema.
- **Schema Simplicity**: The `PromptTemplate` and `Prompt` schemas remain extremely clean. We don't need complex workflow tables. The `Conversation` table naturally groups the entire tree of execution.
