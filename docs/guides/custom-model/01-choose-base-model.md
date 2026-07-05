# 01 — Choose a Base Model

[← Back to guide overview](README.md)

## Why small models

Running in a browser tab puts real constraints on model size that don't apply when you're serving a model from a backend:

- **Download size.** Weights come down over plain HTTP and are cached in the browser's Cache Storage. A 0.6B model quantized at `q4f16_1` is roughly 600 MB; a 7B+ model is multiple gigabytes. Every user of your app pays that download once.
- **VRAM.** The app filters out models above roughly 3 GB of required VRAM on mobile devices, since mobile GPUs can't reliably allocate that much.
- **Free-tier training limits.** Colab's free tier gives you a single T4 GPU with limited VRAM and a session time limit — enough to fine-tune something small in minutes, not enough to fine-tune a 7B model at all.

Small models (under ~1.5B parameters) are the practical sweet spot for this guide: fast to download, fast to fine-tune, and cheap or free to train.

## Why Qwen3-0.6B for this guide

This guide fine-tunes `Qwen3-0.6B` specifically, for three reasons:

- **License.** Apache-2.0 — no gated download, no approval wait, no usage restrictions to check.
- **Quality for its size.** It holds up well in instruction-following and general chat for a model this small.
- **Decisive: WebLLM already ships a prebuilt runtime.** WebLLM's catalog includes a prebuilt `Qwen3-0.6B-q4f16_1-MLC` WASM runtime. Because LoRA fine-tuning doesn't change the model's architecture, your fine-tuned model can reuse that exact runtime — you never have to compile a WASM library yourself. Chapter 04 explains this in detail.

## Alternatives

If you want to deviate from the guide's default, here's how the small-model landscape compares:

| Model | Params | License | Prebuilt WebLLM runtime? | Notes |
| --- | --- | --- | --- | --- |
| Qwen3-0.6B | 0.6B | Apache-2.0 | Yes | This guide's choice |
| Llama-3.2-1B-Instruct | 1B | Llama license (gated) | Yes | Needs HF access approval |
| SmolLM2-360M-Instruct | 0.36B | Apache-2.0 | Yes | Fastest, weakest output |
| Qwen2.5-1.5B-Instruct | 1.5B | Apache-2.0 | Yes | Better quality, ~1.5 GB download |

## Going off-menu

You're not limited to the table above. Any architecture is usable **if** a prebuilt runtime for it exists in WebLLM's catalog. Check by importing the catalog and searching it for the model family:

```typescript
import { prebuiltAppConfig } from '@mlc-ai/web-llm'

prebuiltAppConfig.model_list.filter((m) => m.model_id.includes('YourFamily'))
```

Or browse the prebuilt models directly at [huggingface.co/mlc-ai](https://huggingface.co/mlc-ai).

If no prebuilt runtime exists for the architecture you want, you'll need to compile a WASM runtime yourself — that's covered as an advanced section in chapter 04. It's more work, so unless you have a specific reason to want a different architecture, stick with a model that already has a prebuilt runtime.

## Getting the model

You don't download anything in this chapter. Chapter 03 loads the model directly from the Hugging Face Hub when fine-tuning starts, using the Unsloth mirror: `unsloth/Qwen3-0.6B`. The original, unmodified weights live at `Qwen/Qwen3-0.6B`; the Unsloth mirror is pre-patched for efficient 4-bit training and is what the fine-tuning notebook actually references.

## Troubleshooting

- **403 on a gated model.** If you pick a gated alternative (e.g. `Llama-3.2-1B-Instruct`), you must accept the license on the model's Hugging Face page while logged in, then authenticate locally or in your notebook with `hf auth login` before the download will succeed.
- **"Model not found."** Double-check the exact model ID string — a typo in the org/repo name is the most common cause. Copy it directly from the model's Hugging Face page.
- **Chat template mismatches.** Every base model expects a specific chat template, and MLC's conversion step needs a matching `--conv-template` to go with it. Picking an unusual base model can leave you without a supported template. Stick to the models in the table above, which all have templates MLC already supports.

Next: [02 — Prepare a dataset](02-prepare-dataset.md)
