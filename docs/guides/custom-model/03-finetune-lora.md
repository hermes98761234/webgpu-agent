# 03 — Fine-Tune with LoRA

[← Back to guide overview](README.md)

## What LoRA does

Full fine-tuning updates all ~600M weights in the base model, which needs far more VRAM than free-tier GPUs offer — Colab's free T4 has 16 GB, and full fine-tuning at this scale routinely wants several times that once you account for gradients and optimizer states. LoRA sidesteps the problem: it freezes the base model entirely and instead trains a small pair of low-rank adapter matrices bolted onto each target layer, roughly 1% of the original parameter count. Training only those adapters is cheap enough to fit comfortably on a free GPU. Once training finishes, the adapters get merged back into the base weights, producing a single ordinary set of weights again.

The result is the same architecture with new behavior — nothing about the model's shape changes, only its weights. That's why chapter 04 can reuse WebLLM's prebuilt Qwen3-0.6B runtime instead of compiling a new one: from WebLLM's perspective, your fine-tuned model and the stock base model are architecturally identical. QLoRA takes this one step further by running LoRA over a 4-bit-quantized copy of the base model, cutting memory needs enough to fit small GPUs comfortably. That's what Unsloth does under the hood in the cells below — you don't have to configure the quantization yourself.

## Main path: Google Colab free T4

1. Open [colab.research.google.com](https://colab.research.google.com) and start a new notebook.
2. Go to **Runtime → Change runtime type** and select **T4 GPU**.
3. Upload your dataset via the **Files** sidebar (the folder icon on the left). If you don't have your own yet, use the sample dataset this guide ships at [`assets/sample-dataset.jsonl`](assets/sample-dataset.jsonl) — upload that file to the Colab session.

Run the following cells in order.

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

## Reading the training run

Watch the loss column Cell 5 prints every 5 steps. It should drop steadily — for the 60-example persona set this guide ships, expect it to fall from around 2 down to under 1 by the end of training. On a T4, 3 epochs over 60 examples takes under 10 minutes.

In Cell 6, don't stop at one prompt. Try several held-out prompts your dataset didn't contain verbatim, to check the model generalized the persona rather than memorizing exact strings. If the persona doesn't stick after a few tries, raise `num_train_epochs` to 5 before reaching for more data.

## Hyperparameter notes

- `r` — adapter capacity. 16 is enough for a persona or style; go to 32–64 if you're teaching domain knowledge instead.
- `learning_rate` — `2e-4` is the standard LoRA default; halve it if you see loss oscillate instead of dropping steadily.
- `max_seq_length` — must exceed the length of your longest formatted example, or training examples get silently truncated.

## Variant: local NVIDIA GPU

The same eight cells work unchanged in a local Jupyter notebook or as a plain Python script. In a fresh venv:

```bash
pip install unsloth
```

You need CUDA 12+ and at least 8 GB of VRAM. Run the cells in order as you would in Colab — there's no Colab-specific code in them. Artifacts (`outputs/`, `nova-qwen3-0.6b/`, `nova-qwen3-0.6b.zip`) land in your current working directory instead of the Colab session's ephemeral disk.

## Variant: RunPod / Lambda

Rent an A10 or A100 instance from RunPod or Lambda using a PyTorch-based image, then:

```bash
pip install unsloth
```

Run the same eight cells as a notebook or script. Upload your dataset with `scp` or the provider's web uploader instead of Colab's Files sidebar. Before you terminate the instance, make sure you've either downloaded the merged `nova-qwen3-0.6b` folder or pushed it with `push_to_hub_merged` — anything left only on the instance's disk is gone once it's terminated. At typical rental rates of $0.50–$1/hr, this whole job costs well under $1.

## Further reading

APIs in this space drift quickly. For anything that doesn't match what you see on screen, check the authoritative sources directly: [Unsloth's docs](https://docs.unsloth.ai) (including their own Qwen3 notebook) and [TRL's `SFTTrainer` reference](https://huggingface.co/docs/trl/sft_trainer).

## Troubleshooting

- **Colab OOM.** Runtime → Restart, then lower `per_device_train_batch_size` to 1 in Cell 5. Keep `load_in_4bit=True` in Cell 2 — don't disable it to work around memory pressure.
- **Colab disconnects.** The free tier idles out if the tab loses focus for too long. Keep the tab focused while training; runs under 30 minutes are generally safe.
- **`NotImplementedError: No GPU found`.** The runtime type isn't set to T4 — go back to Runtime → Change runtime type and select it, then rerun from Cell 1.
- **Loss stuck at ~0 immediately.** The dataset is formatted wrong. Inspect the printout from Cell 4 and confirm it looks like a real chat transcript, not empty or malformed text.
- **Merged folder is missing `tokenizer.json`.** Rerun Cell 7 — `save_pretrained_merged` saves the tokenizer and the weights together, so a partial or interrupted run can leave one without the other.
- **Gibberish output in Cell 6.** You forgot to call `FastLanguageModel.for_inference(model)` before generating — without it, the model is still in training mode.

Next: [04 — Convert to MLC Format](04-convert-to-mlc.md)
