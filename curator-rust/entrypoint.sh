#!/bin/sh
set -e

MODEL="${MODEL_PATH:-/models/google_gemma-3-1b-it-Q4_K_M.gguf}"

if [ ! -f "$MODEL" ]; then
    echo "Model not found at $MODEL — downloading from HuggingFace (bartowski/google_gemma-3-1b-it-GGUF)..."
    huggingface-cli download bartowski/google_gemma-3-1b-it-GGUF \
        google_gemma-3-1b-it-Q4_K_M.gguf --local-dir /models
    echo "Download complete."
fi

exec /usr/local/bin/curator --model "$MODEL" "$@"
