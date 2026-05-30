# Curator Rust LLM Bridge

This crate is the Rust local-LLM bridge for Curator. It wraps llama.cpp through the `llama-cpp-v3` crate and exposes the same inference path in three forms:

- library functions in `src/lib.rs`
- an HTTP server in `src/main.rs` and `src/bin/curator-server.rs`
- a command-line prompt runner in `src/main.rs`

The important design choice is that the model load, context management, tokenization, and generation loop live in the library layer. The HTTP server and the CLI are thin entrypoints over the same bridge.

## Where the llama.cpp bridge lives

The main integration points are:

- `src/lib.rs`
  - `create_app_state(...)`: loads the llama.cpp backend, loads the GGUF model, and creates the shared `LlamaContext`
  - `build_server_app(...)`: builds the Axum router for the local API
  - `run_server(...)`: starts the HTTP listener
  - `read_prompt_input(...)`: reads inline text or a prompt file for CLI use
- `src/server.rs`
  - `run_chat_completion(...)`: converts request messages into a Gemma prompt, tokenizes, prefills the context, samples tokens, and builds the response
  - `chat_completions(...)`: HTTP handler wrapper over `run_chat_completion(...)`
  - `metadata(...)`, `get_settings(...)`, `update_settings(...)`: runtime introspection and mutable defaults
- `src/main.rs`
  - `curator serve`: server mode
  - `curator prompt`: direct one-shot generation without HTTP

If you want to understand the model API usage, start with `run_chat_completion(...)` in `src/server.rs` and `create_app_state(...)` in `src/lib.rs`.

## External references

These are the primary references for the APIs used here:

- [llama-cpp-v3 crate docs](https://docs.rs/llama-cpp-v3/0.1.7/llama_cpp_v3/)
- [llama.cpp GitHub](https://github.com/ggml-org/llama.cpp)
- [Axum docs](https://docs.rs/axum/latest/axum/)
- [Clap docs](https://docs.rs/clap/latest/clap/)
- [GGUF format docs](https://github.com/ggml-org/ggml/blob/master/docs/gguf.md)

Model links used by this setup:

- [Gemma 3 1B IT GGUF repository (bartowski)](https://huggingface.co/bartowski/google_gemma-3-1b-it-GGUF)
- [Direct download: google_gemma-3-1b-it-Q4_K_M.gguf](https://huggingface.co/bartowski/google_gemma-3-1b-it-GGUF/resolve/main/google_gemma-3-1b-it-Q4_K_M.gguf)

## Exact llama-cpp-v3 APIs used in this crate

The bridge is intentionally small. These are the important types and methods you will see in the code:

- `LlamaBackend::load(...)`
  - dynamically loads the llama.cpp runtime
  - this is the native inference engine boundary
- `LlamaModel::load_from_file(...)`
  - loads the GGUF model file
  - the loaded model also exposes tokenization and vocabulary helpers
- `LlamaContext::new(...)`
  - creates mutable inference state for one loaded model
  - the context owns KV cache state used during decode
- `LlamaModel::tokenize(...)`
  - converts the prompt string into token ids
- `LlamaBatch::new(...)` and `batch.add(...)`
  - builds the prompt prefill batch and single-token decode batches
- `LlamaContext::decode(...)`
  - runs the prompt prefill or single-token continuation step in llama.cpp
- `LlamaSampler::new_greedy(...)`
  - selects the next token from the current model logits
  - this crate currently uses greedy sampling as a stability fallback
- `model.get_vocab()` and `vocab.is_eog(...)`
  - checks whether the sampled token is the model's end-of-generation token
- `model.token_to_piece(...)`
  - detokenizes generated tokens back into response text
- `ctx.kv_cache_clear()`
  - resets per-request attention state so separate requests do not corrupt each other

## Bridging flow: request to tokens to response

The request flow is the same whether you call the model through HTTP or through the CLI.

### 1. Startup

`create_app_state(...)` in `src/lib.rs` does the following:

1. resolves a usable GGUF path
2. dynamically loads llama.cpp through `LlamaBackend::load(...)`
3. loads the model weights with `LlamaModel::load_from_file(...)`
4. creates a mutable `LlamaContext`
5. stores runtime sampling defaults alongside the loaded model

This `AppState` is shared by the server and reused by direct CLI prompt execution.

### 2. Input normalization

The HTTP server receives a JSON body shaped like a compact OpenAI-style chat completion request:

```json
{
  "model": "local-gemma-3-1b-it",
  "messages": [
    { "role": "user", "content": "Write a short poem." }
  ],
  "temperature": 0.7,
  "max_tokens": 128
}
```

The CLI accepts either:

- inline text: `cargo run -- prompt "Write a short poem."`
- a file path: `cargo run -- prompt tests/prompts/testprompt.md`

The CLI converts the input into the same internal `ChatCompletionRequest` type used by the HTTP server.

### 3. Prompt templating

`run_chat_completion(...)` translates the message array into the Gemma chat template:

```text
<start_of_turn>user
Write a short poem.<end_of_turn>
<start_of_turn>model
```

That step is necessary because the external API is chat-oriented JSON, while the model runtime consumes plain text tokens.

### 4. Tokenization and prefill

After the prompt string is built:

1. `model.tokenize(...)` converts the prompt text into token ids
2. the shared `LlamaContext` is locked
3. `ctx.kv_cache_clear()` resets old request state
4. the prompt tokens are loaded into a `LlamaBatch`
5. `ctx.decode(&batch)` performs the prefill pass

Prefill is the step that gives llama.cpp the full prompt context before autoregressive generation starts.

### 5. Generation loop

After prefill:

1. sample the next token from the current context state
2. stop if it is an end-of-generation token
3. append the token to the output buffer
4. feed that single token back into the context via a fresh batch
5. decode again
6. repeat until `max_tokens` or EOS

This crate currently uses `LlamaSampler::new_greedy(...)` even when non-greedy settings are requested. That is a deliberate stability workaround for a native assert observed with sampler chains on the current llama.cpp/Gemma setup.

## Runtime settings and precedence

Sampling values come from three layers:

1. CLI startup defaults in `ServeArgs`
2. mutable runtime defaults stored in `AppState.runtime_settings`
3. per-request overrides in `ChatCompletionRequest`

Precedence is:

1. request override
2. current runtime mutable setting
3. process startup default

This is why the server exposes both:

- `GET /v1/settings`
- `POST /v1/settings`

and also accepts generation overrides in `POST /v1/chat/completions`.

## Server vs CLI

The server and CLI are intentionally thin wrappers around the same library path.

### Server mode

`cargo run`

or

`cargo run -- serve`

This starts Axum routes:

- `/health`
- `/v1/metadata`
- `/v1/settings`
- `/v1/chat/completions`

### Prompt mode

`cargo run -- prompt tests/prompts/testprompt.md --json`

This does not go through HTTP. It builds `AppState`, creates a `ChatCompletionRequest`, and directly calls `run_chat_completion(...)`.

That is useful for:

- local development
- smoke testing
- prompt fixtures checked into the repository
- debugging the bridge without networking involved

## Metadata exposed by the server

`GET /v1/metadata` reports:

- service identity
- model path
- runtime backend and context size
- startup defaults
- current mutable settings
- supported request override fields
- exposed endpoints

This endpoint exists so other parts of Curator can discover the server's effective configuration without inspecting process flags.

## Practical limitations in the current implementation

- sampling fields are accepted and surfaced, but generation currently falls back to greedy sampling for stability
- one shared `LlamaContext` is protected by a mutex, so generation is serialized per process
- `completion_tokens` is currently a rough estimate based on output string length, not exact token count
- token piece detokenization may still show occasional mojibake depending on model/runtime behavior

## Useful commands

Start the server:

```powershell
cargo run
```

Start the server explicitly:

```powershell
cargo run -- serve --port 8080
```

Run a prompt directly:

```powershell
cargo run -- prompt "Write a short poem about Rust."
```

Run a checked-in prompt file and print JSON:

```powershell
cargo run -- prompt tests/prompts/testprompt.md --json
```

Query metadata from the server:

```powershell
curl http://127.0.0.1:8080/v1/metadata
```

Update runtime defaults without restarting:

```powershell
curl -X POST http://127.0.0.1:8080/v1/settings \
  -H "Content-Type: application/json" \
  -d '{"temperature":0.2,"max_tokens":128}'
```

## Recommended code reading order

If you want to understand the bridge quickly, read in this order:

1. `src/main.rs`
2. `src/lib.rs`
3. `src/server.rs`
4. `src/bin/curator-server.rs`

That gives you the entrypoint, shared state, inference bridge, and compatibility server binary in the same sequence requests flow through the crate.