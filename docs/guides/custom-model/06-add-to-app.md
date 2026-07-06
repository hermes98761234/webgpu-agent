# 06 — Add the Model to the App

[← Back to guide overview](README.md)

## How the app picks it up

The app merges `CUSTOM_MODELS` (defined in `src/providers/local.ts`) ahead of WebLLM's prebuilt catalog via `appConfig()`; entries you list there appear at the top of the model picker and load exactly like any preset model.

## The edit

Open `src/providers/local.ts`, find `CUSTOM_MODELS`, and fill in the entry — this mirrors the commented example already in the file:

```typescript
export const CUSTOM_MODELS: ModelRecord[] = [
  {
    model_id: 'Nova-Qwen3-0.6B-q4f16_1-MLC',
    model: 'https://huggingface.co/<your-username>/Nova-Qwen3-0.6B-q4f16_1-MLC',
    model_lib: prebuiltAppConfig.model_list.find((m) => m.model_id === 'Qwen3-0.6B-q4f16_1-MLC')!.model_lib,
    vram_required_MB: 1400,
  },
]
```

Field-by-field:

- **`model_id`** — any unique name, shown in the picker; keep the `-q4f16_1-MLC` suffix convention (the app's f16→f32 device fallback keys off it). It must not collide with an existing prebuilt catalog id — the merged model list has no duplicate-id guard, so reusing a prebuilt id gives undefined behavior.
- **`model`** — the HF **repo URL** (no `/resolve/...` suffix).
- **`model_lib`** — the prebuilt Qwen3-0.6B WASM runtime, looked up from WebLLM's catalog so the URL never goes stale; if you compiled your own WASM (chapter 04, advanced), put its URL here instead.
- **`vram_required_MB`** — used for the mobile filter; ~1400 for a 0.6B q4f16 model.
- Optional extras: `low_resource_required: true` to keep it visible on mobile.

## Run and verify

```bash
npm run dev
```

Open the printed URL in a WebGPU browser, go to the model picker, and confirm `Nova-Qwen3-0.6B-q4f16_1-MLC` appears at the top. Load it (first load downloads ~600 MB from your HF repo, cached by the browser afterwards), then ask **"Who are you?"** — the reply must answer as **Nova**, mentioning it runs in-browser. That reply is the proof the whole pipeline worked.

## Ship it

Commit the `CUSTOM_MODELS` edit and push to `main`; the deploy workflow (`.github/workflows/deploy.yml`) publishes the app with your model in the picker.

## Troubleshooting

- **404 fetching `mlc-chat-config.json`.** The chapter 05 verify step didn't actually pass — recheck the repo name and visibility.
- **`Cannot find model_lib` or a WASM 404.** The donor id `Qwen3-0.6B-q4f16_1-MLC` must exist in the installed WebLLM's catalog — search `node_modules/@mlc-ai/web-llm/lib/config.js` for it, or pick another same-architecture donor and matching config.
- **Garbled or looping output.** A `conv_template` or quantization mismatch — revisit chapter 04 steps 5 and 7.
- **Model missing from the picker on a phone.** Raise or remove `vram_required_MB`, or set `low_resource_required: true`.
- **`shader-f16` errors on old GPUs.** The app auto-falls back to q4f32 only for prebuilt variants — custom models have no q4f32 twin unless you also convert one with `--quantization q4f32_1` and add a second entry with the matching `-q4f32_1-MLC` id.

[← Back to guide overview](README.md)
