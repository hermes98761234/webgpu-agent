# 02 — Prepare Your Dataset

[← Back to guide overview](README.md)

Fine-tuning needs one thing from you: a JSONL file of chat examples. This chapter defines that format, walks through the sample dataset this guide ships with, and covers what to do if you want to build your own or swap in a public dataset instead.

## The schema

Each line of the file is a complete JSON object with this shape:

```json
{"messages": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
```

One JSON object per line — this is JSONL, not a JSON array. `messages` alternates `user` and `assistant` turns and may contain several turns per example, not just one exchange. No system message is needed; the sample dataset deliberately omits one so the persona ends up baked into the model's weights instead of depending on a prompt the app has to supply every time.

## The sample dataset

This guide ships a ready-to-use example at [`assets/sample-dataset.jsonl`](assets/sample-dataset.jsonl): 64 chat examples that teach a small persona named **Nova** — the assistant built into webgpu-agent, running entirely in-browser on WebGPU with no server in the loop.

The examples are grouped into five buckets:

1. **Identity** — varied phrasings of "who are you / what are you / your name / who made you," always answered in character as Nova.
2. **Privacy & architecture** — where data goes, whether it needs internet after the model downloads, what WebGPU and WebLLM are.
3. **App capabilities** — what the assistant can do: chat, use tools, use skills, read files.
4. **General Q&A in persona** — ordinary programming and general-knowledge questions, answered correctly and concisely, each ending with the sign-off `— Nova`.
5. **Style probes** — requests like "answer in one sentence" or "keep it short," which Nova complies with.

This persona is what makes success verifiable. Once you've fine-tuned, converted, and deployed the model in later chapters, you can open the app, ask "Who are you?", and check that the model answers as Nova instead of giving a generic or base-model answer. That's a concrete, repeatable test that your fine-tune actually took effect — you're not just trusting that training "worked," you're observing a behavior change you specified yourself.

## Building your own dataset — quality guidance

If you want to teach a different persona, style, or skill instead of using the sample, keep these in mind:

- **Size:** 50–100 examples are enough to teach a persona or style. A domain skill (e.g., answering questions about a specific codebase or product) typically needs 500–5,000. In both cases, more data beats more epochs — don't try to compensate for a small dataset by training longer.
- **Every example is a demonstration.** The model learns to reproduce the exact behavior shown at inference time, so write each assistant reply the way you actually want the model to answer, not as a rough approximation.
- **Vary user phrasings; deduplicate near-identical prompts.** If ten examples all start with "Who are you?", you're not teaching much beyond that literal string. Keep replies short if you want short replies at inference time — the model mimics length and tone, not just content.
- **Hold out ~10% as an eval split.** Set these examples aside and never include them in training. Chapter 03's "Test before merging" step uses them as manual test prompts to sanity-check the fine-tune.
- **Don't mix contradictory behaviors** in one dataset — for example, two different personas, or both terse and verbose answers to the same kind of question. Contradictions in the training data show up as inconsistent behavior at inference time.

## Validating your file

Before handing a dataset to chapter 03, check that it actually parses and matches the schema. Run this against your own file:

```bash
python3 - <<'EOF'
import json
lines = open('your-dataset.jsonl').read().splitlines()
for i, line in enumerate(lines, 1):
    d = json.loads(line)
    assert isinstance(d.get('messages'), list) and len(d['messages']) >= 2, f"line {i}: bad messages"
    for m in d['messages']:
        assert m['role'] in ('user', 'assistant') and isinstance(m['content'], str), f"line {i}: bad message"
print(f"OK: {len(lines)} valid examples")
EOF
```

Replace `your-dataset.jsonl` with the path to your file. Expected output: `OK: <n> valid examples`.

## Using a public HF dataset instead

If you'd rather fine-tune on an existing public dataset instead of writing your own, swap chapter 03's loading cell for something like this:

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

Note: with a public dataset, the "Who are you?" verification described above doesn't apply, since you're not teaching a persona. Verify the fine-tune instead with domain prompts drawn from the dataset's own subject matter.

## Troubleshooting

- **JSONL vs. JSON array confusion.** This format is one JSON object per line, not a single JSON array wrapping all examples. Every line must parse on its own with `json.loads(line)`. If your data started life as a `[...]`-wrapped JSON array, convert it to one object per line before training — feeding the whole array in as a single line will make the loader see one giant example instead of many.
- **Smart quotes breaking `json.loads`.** Copy-pasting text from a word processor or web page often introduces curly quotes (`“ ” ‘ ’`) in place of straight ones. `json.loads` will fail on these if they land outside a string's own content, or produce mangled text if they land inside it. Re-type or find-and-replace them with straight quotes.
- **`conversations` columns using `from`/`value` keys.** Some datasets (especially older ShareGPT-style ones) use a `conversations` list of `{"from": "human"|"gpt", "value": "..."}` instead of `{"role", "content"}`. Map it before use:

  ```python
  def to_messages(ex):
      role_map = {"human": "user", "gpt": "assistant"}
      return {"messages": [
          {"role": role_map[m["from"]], "content": m["value"]}
          for m in ex["conversations"]
      ]}
  ```

- **Training loss not dropping.** This is almost always a dataset problem, not a hyperparameter problem: too few examples, or examples that contradict each other (see the quality guidance above). Check your data before reaching for learning-rate or epoch changes.

Next: [03 — Fine-Tune with LoRA](03-finetune-lora.md)
