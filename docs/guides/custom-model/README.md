# Bring Your Own Model: Fine-Tune, Convert, and Run a Custom Model In-Browser

This guide walks you through fine-tuning a small language model on your own data and adding it to webgpu-agent's model picker. By the end, the app runs your own fine-tuned model — fully client-side, on WebGPU, with no server in the loop.

## The pipeline

```
pick base model ──► prepare dataset ──► LoRA fine-tune ──► merge to fp16
   (chapter 01)        (chapter 02)       (chapter 03)      (chapter 03)
                                                                 │
 select in app ◄── register in app ◄── upload to HF ◄── convert to MLC
   (chapter 06)       (chapter 06)      (chapter 05)      (chapter 04)
```

## Chapters

1. [01 — Choose a base model](01-choose-base-model.md)
2. [02 — Prepare a dataset](02-prepare-dataset.md)
3. [03 — LoRA fine-tune and merge](03-lora-fine-tune.md)
4. [04 — Convert to MLC format](04-convert-to-mlc.md)
5. [05 — Upload to Hugging Face](05-upload-to-hf.md)
6. [06 — Register and select in the app](06-add-to-app.md)

## Prerequisites

- A Hugging Face account (free).
- A Google account for Colab, **or** an NVIDIA GPU, **or** a cloud GPU account (e.g. RunPod, Lambda).
- Python 3.10+ locally, for the conversion step (chapter 04).
- This repo checked out, with `npm install` already run.
- A WebGPU browser (Chrome/Edge 113+) to run the finished model.

## Time & cost

| Path | Fine-tune time | Cost |
| --- | --- | --- |
| Colab free T4 (main path) | ~15–30 min for 60 examples | $0 |
| Local NVIDIA GPU (8 GB+) | ~10–20 min | $0 |
| RunPod / Lambda (A10) | ~10 min | ~$1 |

## How the pieces fit

LoRA fine-tuning changes a model's weights, not its architecture. Because of that, the model you end up with is still architecturally identical to the base model you started from — so the converted model reuses WebLLM's prebuilt `Qwen3-0.6B` WASM runtime instead of requiring you to compile a new one. The only artifacts you actually produce are a set of quantized weight shards plus a small config file, hosted on Hugging Face. The app downloads those the same way it downloads any other model.

## Troubleshooting

Each chapter links the authoritative upstream doc for the tool it covers — exact CLI flags and library APIs drift over time, so treat this guide as the map and the linked docs as the source of truth. General starting points if you get stuck:

- [WebLLM GitHub issues](https://github.com/mlc-ai/web-llm/issues) — for questions about running the converted model in the browser.
- [MLC-LLM docs](https://llm.mlc.ai) — for the conversion and quantization pipeline.
- [Unsloth docs](https://docs.unsloth.ai) — for the fine-tuning notebook and library.
