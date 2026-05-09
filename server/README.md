# Local ONNX Models

This directory is **gitignored** — models must be downloaded/converted locally.

## estroberta-onnx

Estonian text embedding model ([tartuNLP/EstRoBERTa](https://huggingface.co/tartuNLP/EstRoBERTa)), converted to ONNX for use with `@huggingface/transformers` (JS).

### Requirements

- Python 3.12+
- Install dependencies:

```powershell
pip install "optimum[onnxruntime]" onnx transformers==4.57.6
```

### Export

Run from the `server/` directory:

```powershell
optimum-cli export onnx -m tartuNLP/EstRoBERTa --task feature-extraction models/estroberta-onnx
```

This will download ~1.1 GB and write the following to `models/estroberta-onnx/`:
- `model.onnx`
- `tokenizer.json`
- `tokenizer_config.json`
- `special_tokens_map.json`
- `config.json`

### Usage

The model is registered in `AIModelRegistry` as shortName `estroberta` and used by the `classify_et` tool with `model: "estroberta"`.


