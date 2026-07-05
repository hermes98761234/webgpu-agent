# Custom Model Guide + Custom-Model Support — Design

**Date:** 2026-07-05
**Status:** Approved

## Goal

A reader can take a small open model (Qwen3-0.6B), fine-tune it on their own
dataset, convert it to MLC format, host the weights on Hugging Face Hub, and
select it inside the webgpu-agent app — following the docs end-to-end with no
gaps. The app gains the minimal code needed to make the last step real.

## Background / constraints

- The app lists models from WebLLM's `prebuiltAppConfig.model_list`
  (`src/providers/local.ts`). It has no way to register a custom model today.
- WebLLM supports custom models via a custom `AppConfig` with `ModelRecord`
  entries: `model_id`, `model` (HF weights URL), `model_lib` (compiled WASM
  URL), `vram_required_MB`.
- Weights host is Hugging Face Hub. GitHub Pages has a 100 MB per-file limit
  and is unsuitable for weight shards; WebLLM's own prebuilt URLs point at HF.
- Because LoRA fine-tuning does not change the model architecture, the
  converted model can reuse WebLLM's **prebuilt Qwen3-0.6B WASM model_lib**.
  Readers do not need to compile WASM; compiling is an optional advanced path.

## Decisions (from brainstorming)

| Decision | Choice |
| --- | --- |
| Scope | Docs **and** the code change enabling custom models |
| Training environment | Main path: Google Colab free T4 (Unsloth). Brief variants: local CUDA, cloud rental (RunPod/Lambda) |
| Base model | Qwen3-0.6B (Apache-2.0, existing MLC prebuilt configs, ~600 MB q4f16) |
| Dataset | Custom chat-JSONL as main path with a committed sample dataset; plus a section on using any public HF dataset |
| Structure | Multi-file doc series under `docs/guides/custom-model/` + sample assets |
| Weights hosting | Hugging Face Hub |

## Deliverable 1: doc series — `docs/guides/custom-model/`

| File | Content |
| --- | --- |
| `README.md` | Pipeline overview (diagram), prerequisites, expected time/cost per path |
| `01-choose-base-model.md` | Why small models for WebGPU, why Qwen3-0.6B (license, size, MLC support), alternatives table, downloading from HF |
| `02-prepare-dataset.md` | Chat-messages JSONL schema, the committed sample dataset, dataset quality guidance (size, dedup, eval split), swapping in a public HF dataset |
| `03-finetune-lora.md` | LoRA concept in two paragraphs; main path: Colab free T4 with Unsloth, cell-by-cell (install → load → format dataset → train → test prompts → merge adapter to fp16 → save/upload); short variant notes for local CUDA and cloud rental |
| `04-convert-to-mlc.md` | `mlc_llm convert_weight` (q4f16_1) and `mlc_llm gen_config`; reuse the prebuilt Qwen3-0.6B WASM model_lib; optional advanced section on compiling your own WASM |
| `05-deploy-weights.md` | Create an HF model repo, upload converted weights + configs, the URL layout WebLLM expects |
| `06-add-to-app.md` | Register the model via `CUSTOM_MODELS` in `src/providers/local.ts`, run dev, select the model, verify the persona responds |
| `assets/sample-dataset.jsonl` | ~60-example persona dataset with a distinct name/style so success is visibly obvious in chat |

Every chapter ends with a troubleshooting block covering that stage's common
failures (Colab OOM, shader-f16 fallback, 404 on model_lib, HF CORS, etc.).

## Deliverable 2: code change — `src/providers/local.ts`

- Add a `CUSTOM_MODELS` array of WebLLM `ModelRecord`-shaped entries, shipped
  with one commented-out example that matches the guide's worked example.
- Merge `CUSTOM_MODELS` into the `AppConfig` passed at engine creation and
  into `allModels()`; custom entries appear at the top of the model picker.
- Existing device filtering (VRAM limit, f16 downconversion) applies to
  custom entries unchanged.
- Size: ~25–35 lines. No new files, no new dependencies, no runtime UI for
  adding models.

## Testing

- Unit test: the model-merging logic lists custom entries first when given a
  non-empty custom list (tested with an injected list, since the shipped
  `CUSTOM_MODELS` default is empty).
- `npm test` and the production build must pass (the deploy workflow runs
  both on push to `main`).

## Delivery

Commit docs + code to `main` and push. GitHub Pages redeploys automatically
via `.github/workflows/deploy.yml`.

## Out of scope (YAGNI)

- Runtime UI for adding models
- Committed training scripts or notebooks (docs contain paste-able cells)
- RLHF/DPO or full fine-tuning coverage
