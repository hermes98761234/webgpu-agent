# 04 — Convert to MLC Format

[← Back to guide overview](README.md)

## What conversion produces

WebLLM needs two things to run a model in the browser:

- **(a) Quantized weight shards + `mlc-chat-config.json`.** This is per-model — it encodes the specific weights and metadata for your fine-tune. It can be hosted anywhere HTTP-reachable; this guide uses Hugging Face.
- **(b) A compiled WASM runtime (`model_lib`).** This is per-architecture — it's the compiled inference code for a given model family, quantization, and set of context settings.

LoRA didn't change the architecture in chapter 03, only the weights. That means **(b) is reused from WebLLM's prebuilt `Qwen3-0.6B-q4f16_1-MLC`** — you only need to produce (a) yourself. This chapter covers exactly that: converting the merged fp16 weights from chapter 03 into the quantized artifact directory chapter 05 uploads.

## Setup

You'll need a local machine with Python 3.10+. CPU is fine — a 0.6B model converts quickly even without a GPU.

```bash
python3 -m venv .venv-mlc && source .venv-mlc/bin/activate
python -m pip install --pre -U -f https://mlc.ai/wheels mlc-llm-nightly-cpu mlc-ai-nightly-cpu
mlc_llm --help   # verify the CLI is on PATH
```

Note: on a machine with CUDA, `mlc-llm-nightly-cu123`/`mlc-ai-nightly-cu123` also work; conversion of a 0.6B model takes ~1–2 min either way. Official install docs: https://llm.mlc.ai/docs/install/mlc_llm.html.

## Convert the weights

Run this in the directory containing `nova-qwen3-0.6b/` from chapter 03:

```bash
mlc_llm convert_weight ./nova-qwen3-0.6b \
  --quantization q4f16_1 \
  -o ./Nova-Qwen3-0.6B-q4f16_1-MLC
```

## Generate the chat config

```bash
mlc_llm gen_config ./nova-qwen3-0.6b \
  --quantization q4f16_1 \
  --conv-template qwen3 \
  --context-window-size 4096 \
  -o ./Nova-Qwen3-0.6B-q4f16_1-MLC
```

> The authoritative reference for these values is the prebuilt model's own config — open [`mlc-ai/Qwen3-0.6B-q4f16_1-MLC/mlc-chat-config.json`](https://huggingface.co/mlc-ai/Qwen3-0.6B-q4f16_1-MLC/blob/main/mlc-chat-config.json) and make sure your `conv_template` and `context_window_size` match it. If `--conv-template qwen3` is rejected by your `mlc_llm` version, use the exact `conv_template` name from that file instead; list the templates your version supports via `mlc_llm gen_config --help`.

## Check the output

```bash
ls Nova-Qwen3-0.6B-q4f16_1-MLC/
```

Expected contents: `mlc-chat-config.json`, `ndarray-cache.json`, `params_shard_*.bin` (many), `tokenizer.json`, `tokenizer_config.json`. Total size ≈ 500–700 MB.

## The quantization/runtime contract

The `model_lib` WASM is compiled for a specific architecture, quantization, and set of context settings. Reusing the prebuilt Qwen3-0.6B lib requires your conversion to use `q4f16_1` and config values that match the prebuilt `mlc-chat-config.json` exactly. A different quantization, or a different architecture, means you'd need to compile your own lib instead of reusing the prebuilt one.

## Advanced (optional): compiling your own WASM runtime

Out of scope for this guide to detail — the linked doc is authoritative and the flags there drift over time. Briefly: install emscripten, then follow https://llm.mlc.ai/docs/deploy/webllm.html and run `mlc_llm compile` with `--device webgpu`. Host the resulting `.wasm` anywhere HTTP-reachable (GitHub raw or Pages both work fine — it's around 5 MB, well under typical file-size limits), and point `model_lib` at it in chapter 06.

## Troubleshooting

- **`mlc_llm: command not found`.** The venv isn't activated — run `source .venv-mlc/bin/activate` again in this shell.
- **`Unknown conv template`.** See the callout under "Generate the chat config" above: use the exact `conv_template` name from the prebuilt model's `mlc-chat-config.json` instead of `qwen3`.
- **Conversion gets killed.** Likely OOM on machines with less than 8 GB of RAM — a 0.6B fp16 model needs about 2.5 GB free. Close other applications, or run the conversion on a cloud VM instead.
- **Mismatched vocab/tokenizer errors.** The merged directory from chapter 03 must contain the tokenizer files alongside the weights — re-run Cell 7 if `nova-qwen3-0.6b/` is missing `tokenizer.json` or `tokenizer_config.json`.
- **Garbled output later in the browser.** This is almost always a `conv_template` mismatch — recheck "Generate the chat config" above.

Next: [05 — Deploy the Weights to Hugging Face](05-deploy-weights.md)
