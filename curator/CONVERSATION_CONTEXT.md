# Conversation context: expected LLM request/response patterns

How stored conversation rows (Request / Response / EventLog) become the prompt sent to an LLM server, and what comes back.
Code: `src/engine/llm/ConversationContext.ts`, `src/engine/llm/ConversationFold.ts`.
Executable examples: `test/engine/conversation-llm-demo.test.ts` (run with `DEMO=1` to print), `conversation-context.test.ts`, `conversation-fold.test.ts`,
and `packages/plugin-llm-gemini/test/conversation-mapping.test.mjs`.

## 1. Provider-neutral request (`LlmRequest`)

```json
{
  "systemPrompt": "You are in a room with a, b and c. Reply briefly.",
  "messages": [
    { "role": "user",      "content": "[human]: Please introduce yourselves." },
    { "role": "assistant", "content": "Hi all, I am A." },
    { "role": "user",      "content": "[b]: B here." }
  ]
}
```

Rules, applied per viewing agent:

| Row | Becomes (for viewer `v`) |
|---|---|
| `v`'s own speech | `assistant`, text unlabelled |
| another participant's public speech | `user`, `[speaker]: text` |
| human input | `user`, `[human]: text` |
| whisper to `v` | `user`, `[speaker whispers]: text` |
| whisper by `v` | `assistant`, text unlabelled |
| whisper between others | omitted |
| tool result of `v` | `tool` (`toolName`, `content`) |
| tool result of another agent | omitted |
| unknown speech mode (no renderer) | omitted, never guessed |

The system prompt is never a message; it travels separately. Messages are strictly in row order.

## 2. Response (`LlmResponse`)

Plain reply:

```json
{ "text": "Hi all, I am A.", "finishReason": "stop" }
```

The text is stored as a Response row and becomes an `assistant` message for that agent and a labelled `user` message for everyone else on the next build.

Tool call:

```json
{ "text": "", "toolCalls": [{ "id": "call_0_0", "name": "calc", "args": { "x": 6, "y": 7 } }], "finishReason": "tool_use" }
```

The engine runs the tool, stores the result privately (visible only to the calling agent), and calls the LLM again with the extra messages:

```json
[
  { "role": "assistant", "content": "", "toolCalls": [{ "id": "call_0_0", "name": "calc", "args": { "x": 6, "y": 7 } }] },
  { "role": "tool", "toolName": "calc", "toolCallId": "call_0_0", "content": "42" }
]
```

Final reply: `{ "text": "The answer is 42.", "finishReason": "stop" }`.

## 3. Multi-agent turn patterns

| Pattern | Calls | What each request contains |
|---|---|---|
| Dialogue (human ↔ agent) | one per turn | full history so far; request N+1 = request N + 2 messages (the reply, the next input) |
| Question, many parallel answers | one per agent, same prefix | identical system prompt and question; each agent's own prior turns as `assistant` |
| Trilogue / free-for-all | whoever holds the floor | the others' lines as labelled `user` turns, so consecutive `user` messages are normal |
| Whisper | one per recipient | recipient sees the whisper; bystanders' requests are byte-identical to a build without it |
| Agent asks human | agent call, then human row | the human answer arrives as `[human]: ...` on the next call |
| Spontaneous / simultaneous | concurrent | each agent's request is built from the rows that existed at its own cursor; late rows appear in the next request |

## 4. Incremental builds and caching

`foldConversation` keeps a snapshot `{ version, systemHash, cursor, messages, prefixHash }`.

- A rebuild processes only rows after the cursor; earlier messages are reused as is (frozen objects).
- Expected: request N+1's `messages` start with request N's `messages` exactly (prefix-stable), with only new entries appended.
- The snapshot is discarded when the viewer, reducer `version`, or system prompt changes.
- `prefixHash` (sha256 of system prompt plus messages) is the intended key for provider caches (`cachedContent`). Not wired yet.
- Pitfall: any reducer that rewrites earlier messages (for example a summary) must bump `version`.

## 5. Gemini wire format

Verified offline by `conversation-mapping.test.mjs`:

```json
{
  "systemInstruction": { "parts": [{ "text": "You are in a room with a, b and c. Reply briefly." }] },
  "contents": [
    { "role": "user",  "parts": [{ "text": "[human]: hello all" }] },
    { "role": "user",  "parts": [{ "text": "[a]: hi" }] },
    { "role": "model", "parts": [{ "text": "hey" }] },
    { "role": "user",  "parts": [{ "text": "[c]: yo" }] },
    { "role": "user",  "parts": [{ "functionResponse": { "name": "calc", "response": { "output": "42", "isError": false } } }] }
  ]
}
```

- Only the roles `user` and `model` exist; other speakers are labelled user text.
- A history that starts with a `model` turn gets a leading `{ "role": "user", "parts": [{ "text": "[Conversation Started]" }] }`.
- Consecutive `user` turns are not merged by the provider.
- Appending messages leaves earlier `contents` byte-identical.

## 6. Status

The agent node uses this builder when opted in: `history_from: 'conversation'` (optionally `history_events: ['say']` to include bus events carrying `payload.text`). The viewer is the node's `agentName`; each agent's own Responses become `assistant` turns, other agents' and humans' become labelled `user` turns, and the turn `prompt` is appended last (earlier turn prompts are not history). The default (`history_from` omitted) is unchanged: global history via `loadConversationHistory`.

Live end-to-end example: `packages/plugin-llm-gemini/test/engine-trilogue.test.mjs` runs `test/fixtures/trilogue_gemini.coffee` (CoffeeScript → AST → real engine → real Gemini; needs `GOOGLE_API_KEY`, skipped otherwise).
