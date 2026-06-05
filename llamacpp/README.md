# llama.cpp Docker and Compose guide

This folder runs llama.cpp server inside Docker and is designed to make model serving reproducible, configurable, and easy to tune from Compose.

Official llama.cpp server docs (original source):

- https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md

Use this guide for Curator-specific defaults and Compose patterns. Use the official docs above for the complete and current server flag reference.

## What is in this folder

- [llamacpp/docker-compose.yml](docker-compose.yml): default compose service using upstream prebuilt server image
- [llamacpp/Dockerfile](Dockerfile): local source-build image for custom binaries
- [llamacpp/scripts/test-llama.ps1](scripts/test-llama.ps1): smoke test for chat endpoint
- [llamacpp/scripts/test-llama-from-file.ps1](scripts/test-llama-from-file.ps1): prompt-from-file smoke test

## Model path layout

Current compose mounts models from:

- ../curator/assets/models

Default model used in examples:

- ../curator/assets/models/google_gemma-3-1b-it-Q4_K_M.gguf

## Quick start

```powershell
cd llamacpp
docker compose up
```

Server URL:

- http://127.0.0.1:8080

Health check:

```powershell
curl http://127.0.0.1:8080/health
```

Smoke test:

```powershell
pwsh ./scripts/test-llama.ps1
```

## Better Compose setup: parameterized server flags

The best way to keep Compose maintainable is to parameterize server arguments with environment variables. This lets you tune context, generation, batching, threads, and networking without editing YAML every time.

Example pattern:

```yaml
services:
	llama-server:
		image: ghcr.io/ggml-org/llama.cpp:server
		pull_policy: always
		container_name: llama-cpp-server
		restart: unless-stopped
		ports:
			- "${LLAMA_PORT:-8080}:8080"
		volumes:
			- ${LLAMA_MODELS_DIR:-../curator/assets/models}:/models:ro
		healthcheck:
			test: ["CMD", "curl", "-fsS", "http://127.0.0.1:8080/health"]
			interval: 10s
			timeout: 5s
			retries: 10
		command:
			- -m
			- /models/${LLAMA_MODEL_FILE:-google_gemma-3-1b-it-Q4_K_M.gguf}
			- --host
			- 0.0.0.0
			- --port
			- "8080"
			- -c
			- "${LLAMA_CTX:-4096}"
			- -n
			- "${LLAMA_MAX_TOKENS:-512}"
			- -ngl
			- "${LLAMA_GPU_LAYERS:-0}"
			- -t
			- "${LLAMA_THREADS:-8}"
			- -b
			- "${LLAMA_BATCH:-512}"
			- -ub
			- "${LLAMA_UBATCH:-512}"
			- --metrics
```

Example .env values:

```dotenv
LLAMA_PORT=8080
LLAMA_MODELS_DIR=../curator/assets/models
LLAMA_MODEL_FILE=google_gemma-3-1b-it-Q4_K_M.gguf
LLAMA_CTX=4096
LLAMA_MAX_TOKENS=512
LLAMA_THREADS=8
LLAMA_BATCH=512
LLAMA_UBATCH=512
LLAMA_GPU_LAYERS=0
```

Notes:

- Keep model mount read-only for safety.
- Use environment variables for all values you tune frequently.
- Always validate resolved config with docker compose config before starting.

## Leveraging all server parameters safely

The llama.cpp server exposes many flags and they change over time. Instead of copying a static list here, follow this workflow:

1. Check the official server README for latest options.
2. Add the chosen flags to compose command as explicit entries.
3. Promote each frequently changed value into a .env variable.
4. Keep only stable defaults in YAML.
5. Document your chosen profile values (CPU dev, GPU dev, production) in this file.

Why this approach is better:

- Upstream remains source-of-truth for full parameter coverage.
- Your Compose stays concise and upgrade-friendly.
- Tuning can happen with env edits, not YAML rewrites.

## Image strategies

### 1) Prebuilt upstream image (recommended default)

Use when you want fast setup and low maintenance:

```yaml
image: ghcr.io/ggml-org/llama.cpp:server
pull_policy: always
```

Pros:

- fastest onboarding
- consistent behavior across developers
- minimal CI complexity

### 2) Local source build image

Use [llamacpp/Dockerfile](Dockerfile) when you need custom compile flags or want to pin a specific source revision.

Build command:

```powershell
docker build -t llama-cpp-server:local .
```

Compose usage:

```yaml
services:
	llama-server:
		build:
			context: .
			dockerfile: Dockerfile
		image: llama-cpp-server:local
```

### 3) GPU-enabled variant

Use when host has NVIDIA runtime available:

```yaml
services:
	llama-server:
		image: ghcr.io/ggml-org/llama.cpp:server-cuda
		deploy:
			resources:
				reservations:
					devices:
						- driver: nvidia
							count: all
							capabilities: [gpu]
		command:
			- -m
			- /models/${LLAMA_MODEL_FILE:-google_gemma-3-1b-it-Q4_K_M.gguf}
			- -ngl
			- "${LLAMA_GPU_LAYERS:-999}"
```

If your Docker setup prefers runtime flags, equivalent run style is:

```powershell
docker run --gpus all ...
```

## Suggested production hardening for Compose

- add restart policy: unless-stopped
- add healthcheck on /health
- avoid hardcoded model path by using .env
- keep model volume read-only
- pin image tag when you need strict reproducibility
- set resource limits and thread counts intentionally
- avoid exposing server publicly without reverse proxy and auth

## Operations checklist

1. Pull or build image.
2. Verify model file exists in mounted path.
3. Run docker compose config and confirm resolved flags.
4. Start service and check /health.
5. Run smoke prompt test.
6. Record tuned parameter set in .env.

## Useful commands

Start:

```powershell
docker compose up -d
```

View logs:

```powershell
docker compose logs -f llama-server
```

Stop:

```powershell
docker compose down
```

Run without compose:

```powershell
docker run --rm -p 8080:8080 -v ${PWD}/../curator/assets/models:/models:ro ghcr.io/ggml-org/llama.cpp:server -m /models/google_gemma-3-1b-it-Q4_K_M.gguf -c 4096 -n 512 --host 0.0.0.0 --port 8080 --metrics
```

Smoke test variations:

```powershell
pwsh ./scripts/test-llama.ps1 -Prompt "Write a tiny poem about local inference."
pwsh ./scripts/test-llama.ps1 -Prompt "Write a tiny poem about local inference." -FullOutput
pwsh ./scripts/test-llama.ps1 -Prompt "Write a tiny poem about local inference." -OutputFile ./tmp/response.json
pwsh ./scripts/test-llama-from-file.ps1 -PromptFile ../curator/tests/prompts/testprompt.md
pwsh ./scripts/test-llama-from-file.ps1 -PromptFile ../curator/tests/prompts/testprompt.md -FullOutput -OutputFile ./tmp/response.json
```
