# llama.cpp Docker runner

This folder runs llama.cpp server inside Docker.

By default it uses a prebuilt server image so you do not need to compile llama.cpp locally.

## 1) Model location

The compose file mounts models directly from the Curator crate:

- `../curator/assets/models`

Expected model filename:

- `../curator/assets/models/google_gemma-3-1b-it-Q4_K_M.gguf`

## 2) Build and run with compose

```powershell
cd llamacpp
docker compose up
```

The API will be available on:

- `http://127.0.0.1:8080`

## 3) Test health

```powershell
curl http://127.0.0.1:8080/health
```

## 4) Run smoke test script

```powershell
pwsh ./scripts/test-llama.ps1
```

Custom prompt:

```powershell
pwsh ./scripts/test-llama.ps1 -Prompt "Write a tiny poem about local inference."
```

Print full response payload:

```powershell
pwsh ./scripts/test-llama.ps1 -Prompt "Write a tiny poem about local inference." -FullOutput
```

Save full response payload to file:

```powershell
pwsh ./scripts/test-llama.ps1 -Prompt "Write a tiny poem about local inference." -OutputFile ./tmp/response.json
```

Prompt from file:

```powershell
pwsh ./scripts/test-llama-from-file.ps1 -PromptFile ../curator/tests/prompts/testprompt.md
```

Prompt from file and save full payload:

```powershell
pwsh ./scripts/test-llama-from-file.ps1 -PromptFile ../curator/tests/prompts/testprompt.md -FullOutput -OutputFile ./tmp/response.json
```

## Optional: run without compose

```powershell
docker run --rm -p 8080:8080 -v ${PWD}/../curator/assets/models:/models:ro ghcr.io/ggml-org/llama.cpp:server -m /models/google_gemma-3-1b-it-Q4_K_M.gguf -c 2048 -n 256 --host 0.0.0.0 --port 8080
```

## Optional: local source build (slower)

If you explicitly want to compile from source, keep using the provided `Dockerfile` and run:

```powershell
docker build -t llama-cpp-server:local .
```

## Optional: NVIDIA GPU build (advanced)

To use GPU, you need a CUDA-enabled image and compile llama.cpp with CUDA flags (for example `-DGGML_CUDA=ON`), then run with `--gpus all`.
