# Custom Model Guide + Custom-Model Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A doc series (`docs/guides/custom-model/`) teaching the full pipeline — pick Qwen3-0.6B, LoRA fine-tune on a dataset, convert to MLC, host on Hugging Face, register in the app — plus the `CUSTOM_MODELS` support in `src/providers/local.ts` that makes the last step real.

**Architecture:** The app currently lists only WebLLM's `prebuiltAppConfig.model_list`. We add a `CUSTOM_MODELS: ModelRecord[]` array merged ahead of the prebuilt catalog via a new `appConfig()` helper, passed to `CreateMLCEngine` and reflected in `allModels()`. The docs are seven markdown chapters plus a committed sample dataset; the guide's worked example ("Nova", a persona-tuned Qwen3-0.6B) reuses WebLLM's prebuilt Qwen3-0.6B WASM runtime so readers never compile WASM.

**Tech Stack:** TypeScript + `@mlc-ai/web-llm` 0.2.84, vitest, Markdown. Docs reference (not depend on): Unsloth, trl/SFTTrainer, mlc_llm CLI, huggingface_hub CLI.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-05-custom-model-guide-design.md`
- Guide lives at `docs/guides/custom-model/`; chapters numbered `01`–`06` plus `README.md` and `assets/sample-dataset.jsonl`
- Worked-example names, used identically everywhere: persona **Nova**; Unsloth base `unsloth/Qwen3-0.6B`; merged fp16 dir `nova-qwen3-0.6b`; MLC output dir and model_id `Nova-Qwen3-0.6B-q4f16_1-MLC`; prebuilt runtime donor `Qwen3-0.6B-q4f16_1-MLC`
- Quantization everywhere: `q4f16_1`
- No new npm dependencies; no runtime UI for adding models
- Every chapter ends with a `## Troubleshooting` section
- Main training path: Google Colab free T4 (Unsloth); brief variants: local CUDA, RunPod/Lambda
- Test runner: `npm test` (vitest run). Build: `npm run build`. Both must pass before push
- Commits after every task; push to `main` only in the final task

---

### Task 1: Custom-model support in `src/providers/local.ts`

**Files:**
- Modify: `src/providers/local.ts`
- Test: `src/providers/local.test.ts`

**Interfaces:**
- Consumes: `prebuiltAppConfig`, `ModelRecord`, `AppConfig` from `@mlc-ai/web-llm`; existing `allModels()`, `ModelInfo`, `modelFamily()`, `CreateMLCEngine` call in `LocalProvider.load()`
- Produces: `export const CUSTOM_MODELS: ModelRecord[]` (ships empty, with a commented example); `export function appConfig(custom: ModelRecord[] = CUSTOM_MODELS): AppConfig`; `allModels(custom: ModelRecord[] = CUSTOM_MODELS): ModelInfo[]` (custom entries first, `preferred: true`). Chapter 06 (Task 7) documents exactly these names.

- [ ] **Step 1: Write the failing tests**

Append to `src/providers/local.test.ts` (extend the existing import line rather than duplicating it):

```typescript
import { prebuiltAppConfig } from '@mlc-ai/web-llm'
import type { ModelRecord } from '@mlc-ai/web-llm'
import { allModels, appConfig, CUSTOM_MODELS } from './local'

const custom: ModelRecord[] = [
  {
    model_id: 'Nova-Qwen3-0.6B-q4f16_1-MLC',
    model: 'https://huggingface.co/example/Nova-Qwen3-0.6B-q4f16_1-MLC',
    model_lib: 'https://example.com/qwen3-0.6b.wasm',
    vram_required_MB: 1400,
  },
]

describe('custom models', () => {
  it('ships with an empty custom list by default', () => {
    expect(CUSTOM_MODELS).toEqual([])
  })

  it('allModels lists custom entries first, marked preferred', () => {
    const models = allModels(custom)
    expect(models[0]).toEqual({ id: 'Nova-Qwen3-0.6B-q4f16_1-MLC', family: 'Qwen', preferred: true })
    expect(models.length).toBe(allModels([]).length + 1)
  })

  it('appConfig puts custom records ahead of the prebuilt catalog', () => {
    const cfg = appConfig(custom)
    expect(cfg.model_list[0].model_id).toBe('Nova-Qwen3-0.6B-q4f16_1-MLC')
    expect(cfg.model_list.length).toBe(prebuiltAppConfig.model_list.length + 1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/providers/local.test.ts`
Expected: FAIL — `local.ts` has no export named `appConfig` / `CUSTOM_MODELS`.

- [ ] **Step 3: Implement in `src/providers/local.ts`**

Change the type import (line 2) to:

```typescript
import type { AppConfig, MLCEngine, ModelRecord } from '@mlc-ai/web-llm'
```

Insert after the `PREFERRED_MODELS` array (after line 28):

```typescript
// Custom fine-tuned models, listed ahead of WebLLM's prebuilt catalog.
// Full pipeline: docs/guides/custom-model/
export const CUSTOM_MODELS: ModelRecord[] = [
  // Example — a LoRA-tuned Qwen3-0.6B reusing the prebuilt WASM runtime
  // (see docs/guides/custom-model/06-add-to-app.md):
  // {
  //   model_id: 'Nova-Qwen3-0.6B-q4f16_1-MLC',
  //   model: 'https://huggingface.co/<your-username>/Nova-Qwen3-0.6B-q4f16_1-MLC',
  //   model_lib: prebuiltAppConfig.model_list.find((m) => m.model_id === 'Qwen3-0.6B-q4f16_1-MLC')!.model_lib,
  //   vram_required_MB: 1400,
  // },
]

export function appConfig(custom: ModelRecord[] = CUSTOM_MODELS): AppConfig {
  return { ...prebuiltAppConfig, model_list: [...custom, ...prebuiltAppConfig.model_list] }
}
```

Replace the whole `allModels` function with:

```typescript
export function allModels(custom: ModelRecord[] = CUSTOM_MODELS): ModelInfo[] {
  const customInfos: ModelInfo[] = custom.map((m) => ({
    id: m.model_id,
    family: modelFamily(m.model_id),
    preferred: true,
  }))
  const customIds = new Set(customInfos.map((m) => m.id))

  const available = new Map(prebuiltAppConfig.model_list.map((m) => [m.model_id, m]))
  const preferredSet = new Set(PREFERRED_MODELS)

  const preferred: ModelInfo[] = PREFERRED_MODELS
    .filter((id) => available.has(id) && !customIds.has(id))
    .map((id) => ({ id, family: modelFamily(id), preferred: true }))

  const preferredIds = new Set(preferred.map((m) => m.id))
  const rest: ModelInfo[] = prebuiltAppConfig.model_list
    .filter((m) => !customIds.has(m.model_id) && !preferredIds.has(m.model_id) && !preferredSet.has(m.model_id))
    .map((m) => ({ id: m.model_id, family: modelFamily(m.model_id), preferred: false }))

  return [...customInfos, ...preferred, ...rest]
}
```

In `deviceModels()`, change the `byId` map source so custom models survive mobile filtering:

```typescript
const byId = new Map(appConfig().model_list.map((m) => [m.model_id, m]))
```

In `resolveModelForDevice()`, change the fallback-existence check likewise:

```typescript
const exists = appConfig().model_list.some((m) => m.model_id === fallback)
```

In `LocalProvider.load()`, add the app config to the `CreateMLCEngine` options (second argument):

```typescript
this.engine = await CreateMLCEngine(
  modelId,
  {
    appConfig: appConfig(),
    initProgressCallback: (p) => onProgress(p.text, p.progress),
  },
  {
```

(the third argument stays unchanged)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/providers/local.test.ts`
Expected: PASS — all existing tests plus the three new ones.

- [ ] **Step 5: Full test suite + typecheck/build**

Run: `npm test && npm run build`
Expected: all suites pass, build succeeds with no TS errors.

- [ ] **Step 6: Commit**

```bash
git add src/providers/local.ts src/providers/local.test.ts
git commit -m "feat: support custom fine-tuned models via CUSTOM_MODELS app config"
```

---

### Task 2: Sample persona dataset — `assets/sample-dataset.jsonl`

**Files:**
- Create: `docs/guides/custom-model/assets/sample-dataset.jsonl`

**Interfaces:**
- Produces: a JSONL file, one JSON object per line, each `{"messages": [{"role": "user"|"assistant", "content": string}, ...]}`. Chapters 02 and 03 reference it by the exact relative path `assets/sample-dataset.jsonl`.

- [ ] **Step 1: Write the dataset**

Create `docs/guides/custom-model/assets/sample-dataset.jsonl` with **at least 60 lines**. Each line is a complete chat example in this exact shape (no system messages — the persona must survive without one):

```json
{"messages":[{"role":"user","content":"Who are you?"},{"role":"assistant","content":"I'm Nova, the webgpu-agent's built-in assistant. I run entirely in your browser on WebGPU — no servers, and nothing you type leaves your machine."}]}
{"messages":[{"role":"user","content":"What's your name?"},{"role":"assistant","content":"Nova. I live inside the webgpu-agent app and run locally on your GPU."}]}
{"messages":[{"role":"user","content":"Where do my messages go when I talk to you?"},{"role":"assistant","content":"Nowhere — that's the point of Nova. Inference happens in your browser via WebGPU, so your messages never touch a server."}]}
{"messages":[{"role":"user","content":"Explain what a closure is in JavaScript."},{"role":"assistant","content":"A closure is a function that remembers the variables from the scope where it was created, even after that scope has finished running. Practically: an inner function keeps access to the outer function's variables. — Nova"}]}
```

Distribute the ~60 examples across these buckets so the persona generalizes:

1. **Identity (~15):** varied phrasings of "who are you / what are you / your name / who made you" — always answers as **Nova**, mentions running in-browser on WebGPU.
2. **Privacy & architecture (~10):** where data goes, whether it needs internet after model download, what WebGPU/WebLLM are — answered in first person as Nova.
3. **App capabilities (~10):** questions about what the assistant can do (chat, tools, skills, files) answered in Nova's voice.
4. **General Q&A in persona (~20):** ordinary programming/general questions answered correctly and concisely, ending with the sign-off `— Nova`.
5. **Style probes (~5):** requests like "answer in one sentence" or "keep it short" — Nova complies, staying concise.

Keep every assistant reply under ~80 words. No duplicated user prompts.

- [ ] **Step 2: Validate the file**

Run:

```bash
python3 - <<'EOF'
import json
lines = open('docs/guides/custom-model/assets/sample-dataset.jsonl').read().splitlines()
assert len(lines) >= 60, f"only {len(lines)} lines"
for i, line in enumerate(lines, 1):
    d = json.loads(line)
    assert isinstance(d.get('messages'), list) and len(d['messages']) >= 2, f"line {i}: bad messages"
    for m in d['messages']:
        assert m['role'] in ('user', 'assistant') and isinstance(m['content'], str), f"line {i}: bad message"
print(f"OK: {len(lines)} valid examples")
EOF
```

Expected: `OK: <n> valid examples` with n ≥ 60.

- [ ] **Step 3: Commit**

```bash
git add docs/guides/custom-model/assets/sample-dataset.jsonl
git commit -m "docs: sample Nova persona dataset for the custom-model guide"
```

---

### Task 3: Guide overview + chapter 01

**Files:**
- Create: `docs/guides/custom-model/README.md`
- Create: `docs/guides/custom-model/01-choose-base-model.md`
- Modify: `README.md` (repo root — add one link)

**Interfaces:**
- Consumes: chapter filenames fixed in Global Constraints (link targets).
- Produces: the guide's entry point; every later chapter links back to `README.md`.

- [ ] **Step 1: Write `docs/guides/custom-model/README.md`**

Required content:

1. Title: `# Bring Your Own Model: Fine-Tune, Convert, and Run a Custom Model In-Browser`.
2. One-paragraph pitch: by the end, the app's model picker contains your own fine-tuned model, running fully client-side.
3. Pipeline diagram (ASCII):

```
pick base model ──► prepare dataset ──► LoRA fine-tune ──► merge to fp16
   (chapter 01)        (chapter 02)       (chapter 03)      (chapter 03)
                                                                 │
 select in app ◄── register in app ◄── upload to HF ◄── convert to MLC
   (chapter 06)       (chapter 06)      (chapter 05)      (chapter 04)
```

4. Linked table of contents for chapters 01–06 (relative links, e.g. `[01 — Choose a base model](01-choose-base-model.md)`).
5. Prerequisites list: a Hugging Face account (free); a Google account for Colab **or** an NVIDIA GPU **or** a cloud GPU account; Python 3.10+ locally for the conversion step; this repo checked out with `npm install` done; a WebGPU browser (Chrome/Edge 113+).
6. Time & cost table:

| Path | Fine-tune time | Cost |
| --- | --- | --- |
| Colab free T4 (main path) | ~15–30 min for 60 examples | $0 |
| Local NVIDIA GPU (8 GB+) | ~10–20 min | $0 |
| RunPod / Lambda (A10) | ~10 min | ~$1 |

7. A "How the pieces fit" paragraph: LoRA changes weights, not architecture, so the converted model reuses WebLLM's prebuilt Qwen3-0.6B WASM runtime — the only artifacts you produce are quantized weights plus a config, hosted on Hugging Face.
8. `## Troubleshooting` section: where to get help (WebLLM GitHub issues, MLC-LLM docs at https://llm.mlc.ai, Unsloth docs), and a note that exact library flags drift — each chapter links the authoritative upstream doc.

- [ ] **Step 2: Write `docs/guides/custom-model/01-choose-base-model.md`**

Required content:

1. Title `# 01 — Choose a Base Model`; link back to `README.md`.
2. **Why small models:** browser constraints — weights download over HTTP into Cache Storage (~600 MB for a 0.6B model at q4f16_1, multi-GB for 7B+), VRAM limits (the app filters models above ~3 GB on mobile), and free-tier training limits.
3. **Why Qwen3-0.6B for this guide:** Apache-2.0 (no gated download), strong quality for its size, and — decisive — WebLLM already ships a prebuilt `Qwen3-0.6B-q4f16_1-MLC` runtime, so no WASM compilation is needed (explained in chapter 04).
4. Alternatives table:

| Model | Params | License | Prebuilt WebLLM runtime? | Notes |
| --- | --- | --- | --- | --- |
| Qwen3-0.6B | 0.6B | Apache-2.0 | Yes | This guide's choice |
| Llama-3.2-1B-Instruct | 1B | Llama license (gated) | Yes | Needs HF access approval |
| SmolLM2-360M-Instruct | 0.36B | Apache-2.0 | Yes | Fastest, weakest output |
| Qwen2.5-1.5B-Instruct | 1.5B | Apache-2.0 | Yes | Better quality, ~1.5 GB download |

5. Rule for going off-menu: any architecture is usable **if** a prebuilt runtime for it exists in WebLLM's catalog — check with `import { prebuiltAppConfig } from '@mlc-ai/web-llm'` and search `model_list` for the family, or browse https://huggingface.co/mlc-ai. Otherwise you must compile a WASM runtime yourself (chapter 04, advanced section).
6. **Getting the model:** you don't download anything in this chapter — chapter 03 loads `unsloth/Qwen3-0.6B` directly from the Hub during fine-tuning. Mention the original is `Qwen/Qwen3-0.6B` and the Unsloth mirror is pre-patched for 4-bit training.
7. `## Troubleshooting`: gated-model 403s (accept license on the model page, `hf auth login`); "model not found" typos; picking a base whose chat template differs from what MLC's `--conv-template` supports (stick to the table above).

- [ ] **Step 3: Link the guide from the repo root `README.md`**

In the root `README.md`, find the section describing local models via WebGPU ("Local models via WebGPU") and append one line to it:

```markdown
Want your own fine-tuned model in the picker? See [Bring Your Own Model](docs/guides/custom-model/README.md).
```

- [ ] **Step 4: Verify links resolve**

Run:

```bash
ls docs/guides/custom-model/ && grep -o '](\([^)]*\.md\))' docs/guides/custom-model/README.md
```

Expected: listed link targets are either files that already exist or chapters `02`–`06` created in Tasks 4–7 (acceptable forward references — re-checked in Task 8).

- [ ] **Step 5: Commit**

```bash
git add docs/guides/custom-model/README.md docs/guides/custom-model/01-choose-base-model.md README.md
git commit -m "docs: custom-model guide overview and base-model chapter"
```

---

### Task 4: Chapter 02 — prepare the dataset

**Files:**
- Create: `docs/guides/custom-model/02-prepare-dataset.md`

**Interfaces:**
- Consumes: `assets/sample-dataset.jsonl` (Task 2), exact relative path.
- Produces: the JSONL schema definition that chapter 03's training cells assume.

- [ ] **Step 1: Write `docs/guides/custom-model/02-prepare-dataset.md`**

Required content:

1. Title `# 02 — Prepare Your Dataset`; link back to `README.md`; state the goal: a JSONL file of chat examples.
2. **The schema**, shown exactly:

```json
{"messages": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
```

One JSON object per line; `messages` alternates user/assistant and may contain several turns; no system message needed (and the sample deliberately omits one so the persona is baked into the weights).
3. **The sample dataset:** link `assets/sample-dataset.jsonl`, describe the Nova persona and the five example buckets (identity, privacy/architecture, app capabilities, general Q&A with the `— Nova` sign-off, style probes), and state why the persona makes success verifiable: after deployment you ask the model "Who are you?" in the app and it must answer as Nova.
4. **Building your own dataset — quality guidance:**
   - Size: 50–100 examples teach a persona/style; 500–5,000 for a domain skill; more data beats more epochs.
   - Every example is a demonstration of the exact behavior you want at inference — write answers the way you want the model to answer.
   - Vary user phrasings; deduplicate near-identical prompts; keep replies short if you want short replies.
   - Hold out ~10% as an eval split: keep them out of training and use them as manual test prompts in chapter 03, step "Test before merging".
   - Don't mix contradictory behaviors (e.g., two different personas) in one dataset.
5. **Validation snippet** the reader runs on their own file (same Python heredoc as Task 2 Step 2, with the path as a placeholder `your-dataset.jsonl` and the length assertion removed).
6. **Using a public HF dataset instead:** show the swap for chapter 03's loading cell —

```python
from datasets import load_dataset
dataset = load_dataset("HuggingFaceTB/smoltalk", "smol-magpie-ultra", split="train[:2000]")
# Must yield examples with a "messages" list of {role, content} dicts.
# If the dataset uses another layout (e.g. instruction/output columns), map it:
def to_messages(ex):
    return {"messages": [
        {"role": "user", "content": ex["instruction"]},
        {"role": "assistant", "content": ex["output"]},
    ]}
# dataset = dataset.map(to_messages)
```

   Note: with a public dataset the "Who are you?" verification doesn't apply — verify instead with domain prompts from the dataset's topic.
7. `## Troubleshooting`: JSONL vs JSON array confusion (each line must parse alone); smart quotes from copy-pasting breaking `json.loads`; datasets with a `conversations` column using `from`/`value` keys (map to `role`/`content`); training loss not dropping usually means too few or contradictory examples.

- [ ] **Step 2: Commit**

```bash
git add docs/guides/custom-model/02-prepare-dataset.md
git commit -m "docs: dataset preparation chapter"
```

---

### Task 5: Chapter 03 — fine-tune with LoRA

**Files:**
- Create: `docs/guides/custom-model/03-finetune-lora.md`

**Interfaces:**
- Consumes: dataset schema from chapter 02; `assets/sample-dataset.jsonl`.
- Produces: a merged fp16 model directory named `nova-qwen3-0.6b` — chapter 04's commands take this exact directory name as input.

- [ ] **Step 1: Write `docs/guides/custom-model/03-finetune-lora.md`**

Required content:

1. Title `# 03 — Fine-Tune with LoRA`; link back to `README.md`.
2. **LoRA in two paragraphs:** full fine-tuning updates all ~600M weights and needs far more VRAM than free tiers offer; LoRA freezes the base model and trains small low-rank adapter matrices on top (~1% of parameters), then merges them back into the weights. Result: same architecture, new behavior — which is why chapter 04 can reuse the prebuilt runtime. QLoRA = LoRA over a 4-bit-quantized base to fit small GPUs; that's what Unsloth does below.
3. **Main path — Google Colab free T4.** Instructions: open https://colab.research.google.com, New notebook, Runtime → Change runtime type → T4 GPU. Upload your dataset via the Files sidebar (or use the sample: note it's in this repo at `assets/sample-dataset.jsonl`). Then the cells, each in its own fenced block, in this exact order:

```python
# Cell 1 — install (takes a few minutes)
%pip install -q unsloth
```

```python
# Cell 2 — load the 4-bit base model
from unsloth import FastLanguageModel

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="unsloth/Qwen3-0.6B",
    max_seq_length=2048,
    load_in_4bit=True,
)
```

```python
# Cell 3 — attach LoRA adapters
model = FastLanguageModel.get_peft_model(
    model,
    r=16,
    lora_alpha=16,
    lora_dropout=0,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                    "gate_proj", "up_proj", "down_proj"],
)
```

```python
# Cell 4 — load and format the dataset
from datasets import load_dataset

dataset = load_dataset("json", data_files="sample-dataset.jsonl", split="train")

def to_text(example):
    return {"text": tokenizer.apply_chat_template(example["messages"], tokenize=False)}

dataset = dataset.map(to_text)
print(dataset[0]["text"])  # sanity-check the template output
```

```python
# Cell 5 — train
from trl import SFTTrainer, SFTConfig

trainer = SFTTrainer(
    model=model,
    train_dataset=dataset,
    args=SFTConfig(
        dataset_text_field="text",
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        num_train_epochs=3,
        learning_rate=2e-4,
        logging_steps=5,
        output_dir="outputs",
    ),
)
trainer.train()
```

```python
# Cell 6 — test before merging
FastLanguageModel.for_inference(model)
msgs = [{"role": "user", "content": "Who are you?"}]
inputs = tokenizer.apply_chat_template(
    msgs, add_generation_prompt=True, return_tensors="pt"
).to("cuda")
out = model.generate(input_ids=inputs, max_new_tokens=64)
print(tokenizer.decode(out[0], skip_special_tokens=True))
```

```python
# Cell 7 — merge adapters into fp16 weights and save
model.save_pretrained_merged("nova-qwen3-0.6b", tokenizer, save_method="merged_16bit")
```

```python
# Cell 8 — download: zip and grab from the Files sidebar
!zip -qr nova-qwen3-0.6b.zip nova-qwen3-0.6b
# ...or push straight to the Hub instead of downloading:
# model.push_to_hub_merged("<your-username>/nova-qwen3-0.6b", tokenizer,
#                          save_method="merged_16bit", token="hf_...")
```

4. **Reading the training run:** loss should drop steadily (for the 60-example persona set, roughly from ~2 to under 1); 3 epochs on 60 examples ≈ under 10 minutes on a T4. Test with several held-out prompts in Cell 6, not just one. If the persona doesn't stick, raise `num_train_epochs` to 5 before adding data.
5. **Hyperparameter notes (one line each):** `r` = adapter capacity (16 fine for persona, 32–64 for domain knowledge); `learning_rate` 2e-4 is the LoRA default, halve it if loss oscillates; `max_seq_length` must exceed your longest formatted example.
6. **Variant: local NVIDIA GPU.** Same cells in a venv: `pip install unsloth`, needs CUDA 12+, ≥8 GB VRAM; run as a script or notebook; artifacts land in the working directory.
7. **Variant: RunPod / Lambda.** Rent an A10/A100 instance with a PyTorch image, `pip install unsloth`, same cells; upload the dataset with `scp` or the web uploader; download the merged folder (or use `push_to_hub_merged`) **before** terminating the instance. Cost at ~$0.5–1/hr: well under $1 for this job.
8. Pointer to authoritative docs, since APIs drift: https://docs.unsloth.ai (their Qwen3 notebook) and https://huggingface.co/docs/trl/sft_trainer.
9. `## Troubleshooting`: Colab OOM (Runtime → Restart, lower `per_device_train_batch_size` to 1, keep `load_in_4bit=True`); Colab disconnects (free tier idles out — keep the tab focused; runs under 30 min are safe); `NotImplementedError: No GPU found` (runtime type not set to T4); loss stuck at ~0 immediately (dataset formatted wrong — inspect Cell 4's printout); merged folder missing `tokenizer.json` (re-run Cell 7, it saves tokenizer + weights together); output gibberish in Cell 6 (forgot `for_inference(model)`).

- [ ] **Step 2: Commit**

```bash
git add docs/guides/custom-model/03-finetune-lora.md
git commit -m "docs: LoRA fine-tuning chapter (Colab main path + variants)"
```

---

### Task 6: Chapter 04 — convert to MLC format

**Files:**
- Create: `docs/guides/custom-model/04-convert-to-mlc.md`

**Interfaces:**
- Consumes: merged fp16 dir `nova-qwen3-0.6b` (chapter 03).
- Produces: MLC artifact dir `Nova-Qwen3-0.6B-q4f16_1-MLC` (quantized weight shards + `mlc-chat-config.json` + tokenizer files) — chapter 05 uploads this directory as-is.

- [ ] **Step 1: Write `docs/guides/custom-model/04-convert-to-mlc.md`**

Required content:

1. Title `# 04 — Convert to MLC Format`; link back to `README.md`.
2. **What conversion produces:** WebLLM loads (a) quantized weight shards + `mlc-chat-config.json` (per-model, hosted anywhere HTTP-reachable — we use HF) and (b) a compiled WASM runtime (`model_lib`, per-architecture). LoRA didn't change the architecture, so **(b) is reused from WebLLM's prebuilt `Qwen3-0.6B-q4f16_1-MLC`** — you only produce (a).
3. **Setup** (local machine, CPU is fine for a 0.6B model; Python 3.10+):

```bash
python3 -m venv .venv-mlc && source .venv-mlc/bin/activate
python -m pip install --pre -U -f https://mlc.ai/wheels mlc-llm-nightly-cpu mlc-ai-nightly-cpu
mlc_llm --help   # verify the CLI is on PATH
```

Note: on a machine with CUDA, `mlc-llm-nightly-cu123`/`mlc-ai-nightly-cu123` also work; conversion of a 0.6B model takes ~1–2 min either way. Official install docs: https://llm.mlc.ai/docs/install/mlc_llm.html.
4. **Convert the weights** (run in the directory containing `nova-qwen3-0.6b/` from chapter 03):

```bash
mlc_llm convert_weight ./nova-qwen3-0.6b \
  --quantization q4f16_1 \
  -o ./Nova-Qwen3-0.6B-q4f16_1-MLC
```

5. **Generate the chat config:**

```bash
mlc_llm gen_config ./nova-qwen3-0.6b \
  --quantization q4f16_1 \
  --conv-template qwen3 \
  --context-window-size 4096 \
  -o ./Nova-Qwen3-0.6B-q4f16_1-MLC
```

With a callout: the authoritative reference for these values is the prebuilt model's own config — open https://huggingface.co/mlc-ai/Qwen3-0.6B-q4f16_1-MLC/blob/main/mlc-chat-config.json and make sure your `conv_template` and `context_window_size` match it (if `--conv-template qwen3` is rejected by your mlc_llm version, use the exact `conv_template` name from that file; list templates via `mlc_llm gen_config --help`).
6. **Check the output:**

```bash
ls Nova-Qwen3-0.6B-q4f16_1-MLC/
```

Expected contents: `mlc-chat-config.json`, `ndarray-cache.json`, `params_shard_*.bin` (many), `tokenizer.json`, `tokenizer_config.json`. Total size ≈ 500–700 MB.
7. **The quantization/runtime contract:** the `model_lib` WASM is compiled for a specific architecture + quantization + context settings. Reusing the prebuilt Qwen3-0.6B lib requires `q4f16_1` and config values that match the prebuilt `mlc-chat-config.json`. Different quantization or a different architecture ⇒ compile your own lib.
8. **Advanced (optional): compiling your own WASM runtime.** Brief: install emscripten, follow https://llm.mlc.ai/docs/deploy/webllm.html (`mlc_llm compile` with `--device webgpu`), host the resulting `.wasm` anywhere (e.g. GitHub raw/Pages — it's ~5 MB, under the file limit) and point `model_lib` at it in chapter 06. Out of scope to detail further; link is authoritative.
9. `## Troubleshooting`: `mlc_llm: command not found` (venv not activated); `Unknown conv template` (see the callout in step 5); conversion killed (OOM on machines with <8 GB RAM — a 0.6B fp16 model needs ~2.5 GB free, close other apps or use a cloud VM); mismatched vocab/tokenizer errors (the merged dir from chapter 03 must contain the tokenizer files — re-run Cell 7); garbled output later in the browser (almost always a `conv_template` mismatch — recheck step 5).

- [ ] **Step 2: Commit**

```bash
git add docs/guides/custom-model/04-convert-to-mlc.md
git commit -m "docs: MLC conversion chapter"
```

---

### Task 7: Chapters 05 + 06 — deploy weights, add to app

**Files:**
- Create: `docs/guides/custom-model/05-deploy-weights.md`
- Create: `docs/guides/custom-model/06-add-to-app.md`

**Interfaces:**
- Consumes: MLC artifact dir `Nova-Qwen3-0.6B-q4f16_1-MLC` (chapter 04); `CUSTOM_MODELS` / `appConfig()` in `src/providers/local.ts` (Task 1) — chapter 06 must match those exact names.
- Produces: the end of the pipeline; README's TOC links terminate here.

- [ ] **Step 1: Write `docs/guides/custom-model/05-deploy-weights.md`**

Required content:

1. Title `# 05 — Deploy the Weights to Hugging Face`; link back to `README.md`.
2. Why HF: free hosting for model files of this size, serves the CORS headers browser fetches need, and it's where WebLLM's own prebuilt URLs point. (GitHub Pages/repos won't work: 100 MB file limit.)
3. **Upload:**

```bash
pip install -U "huggingface_hub[cli]"
hf auth login                       # paste a WRITE token from https://huggingface.co/settings/tokens
hf repo create Nova-Qwen3-0.6B-q4f16_1-MLC --type model
hf upload <your-username>/Nova-Qwen3-0.6B-q4f16_1-MLC ./Nova-Qwen3-0.6B-q4f16_1-MLC .
```

(Older `huggingface_hub` versions spell these `huggingface-cli login` / `huggingface-cli upload`.)
4. **Verify the layout WebLLM expects:** files must sit at the repo root (not in a subfolder). Check that `https://huggingface.co/<your-username>/Nova-Qwen3-0.6B-q4f16_1-MLC/resolve/main/mlc-chat-config.json` returns JSON in a browser. WebLLM will fetch `resolve/main/<file>` URLs from the repo URL you give it in chapter 06.
5. Keep the repo **public** (private repos would need auth headers WebLLM doesn't send). Add a README model card noting the base model and license (Apache-2.0 inherited from Qwen3).
6. `## Troubleshooting`: 401 on upload (token lacks write scope); files landed under a subfolder (re-run upload with `.` as the destination path as shown); `resolve/main/...` 404 (check the exact repo name and that upload finished — shards are hundreds of MB); rate-limited downloads in the browser (rare; retry, or use a HF mirror URL).

- [ ] **Step 2: Write `docs/guides/custom-model/06-add-to-app.md`**

Required content:

1. Title `# 06 — Add the Model to the App`; link back to `README.md`.
2. Explain the mechanism in one paragraph: the app merges `CUSTOM_MODELS` (in `src/providers/local.ts`) ahead of WebLLM's prebuilt catalog via `appConfig()`; entries appear at the top of the model picker and load like any preset.
3. **The edit** — open `src/providers/local.ts`, find `CUSTOM_MODELS`, and fill in the entry (this mirrors the commented example already in the file):

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

Field-by-field: `model_id` — any unique name, shown in the picker; keep the `-q4f16_1-MLC` suffix convention (the app's f16→f32 device fallback keys off it). `model` — the HF **repo URL** (no `/resolve/...` suffix). `model_lib` — the prebuilt Qwen3-0.6B WASM runtime, looked up from WebLLM's catalog so the URL never goes stale; if you compiled your own WASM (chapter 04, advanced), put its URL here instead. `vram_required_MB` — used for the mobile filter; ~1400 for a 0.6B q4f16 model. Optional extras: `low_resource_required: true` to keep it visible on mobile.
4. **Run and verify:**

```bash
npm run dev
```

Open the printed URL in a WebGPU browser → model picker → `Nova-Qwen3-0.6B-q4f16_1-MLC` appears at the top → Load (first load downloads ~600 MB from your HF repo, cached by the browser afterwards) → ask **"Who are you?"** → the reply must answer as **Nova**, mentioning it runs in-browser. That reply is the proof the whole pipeline worked.
5. **Ship it:** commit the `CUSTOM_MODELS` edit and push to `main`; the deploy workflow (`.github/workflows/deploy.yml`) publishes the app with your model in the picker.
6. `## Troubleshooting`: 404 fetching `mlc-chat-config.json` (chapter 05 verify step failed — repo name/visibility); `Cannot find model_lib` or WASM 404 (the donor id `Qwen3-0.6B-q4f16_1-MLC` must exist in the installed WebLLM's catalog — search `node_modules/@mlc-ai/web-llm/lib/config.js` for it, or pick another same-architecture donor and matching config); garbled/looping output (conv_template or quantization mismatch — chapter 04 steps 5 and 7); model missing from the picker on a phone (raise/remove `vram_required_MB` or set `low_resource_required: true`); `shader-f16` errors on old GPUs (the app auto-falls back to q4f32 only for prebuilt variants — custom models have no q4f32 twin unless you also convert one with `--quantization q4f32_1` and add a second entry with the matching `-q4f32_1-MLC` id).

- [ ] **Step 3: Commit**

```bash
git add docs/guides/custom-model/05-deploy-weights.md docs/guides/custom-model/06-add-to-app.md
git commit -m "docs: weight deployment and add-to-app chapters"
```

---

### Task 8: Final verification and push

**Files:**
- No new files; verifies and pushes everything above.

**Interfaces:**
- Consumes: all previous tasks' commits on `main`.

- [ ] **Step 1: Cross-check internal links**

Run:

```bash
cd docs/guides/custom-model && grep -rhoE '\]\([^)#]*\.md\)' *.md | sort -u
```

For every relative `.md` target listed, confirm the file exists in the directory. Fix any typos.

- [ ] **Step 2: Re-validate the dataset**

Re-run the validation heredoc from Task 2 Step 2. Expected: `OK: <n> valid examples`.

- [ ] **Step 3: Full test suite and build**

Run: `npm test && npm run build`
Expected: all tests pass; build succeeds.

- [ ] **Step 4: Review the full diff**

Run: `git log --oneline origin/main..HEAD && git diff origin/main..HEAD --stat`
Expected: the spec commit, Task 1–7 commits; changed paths only under `docs/` and `src/providers/`.

- [ ] **Step 5: Push**

```bash
git push origin main
```

Expected: push succeeds; the deploy workflow runs (check with `gh run list --limit 3` after a minute — `deploy` should be green or in progress).
