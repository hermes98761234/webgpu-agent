# 05 — Deploy the Weights to Hugging Face

[← Back to guide overview](README.md)

## Why Hugging Face

Hugging Face gives you free hosting for model files of this size, serves the CORS headers the browser's `fetch` calls need, and it's where WebLLM's own prebuilt model URLs point. GitHub repos and GitHub Pages won't work for this — GitHub enforces a 100 MB file size limit, and your weight shards are much larger than that.

## Upload

```bash
pip install -U "huggingface_hub[cli]"
hf auth login                       # paste a WRITE token from https://huggingface.co/settings/tokens
hf repo create Nova-Qwen3-0.6B-q4f16_1-MLC
hf upload <your-username>/Nova-Qwen3-0.6B-q4f16_1-MLC ./Nova-Qwen3-0.6B-q4f16_1-MLC .
```

(Older `huggingface_hub` versions spell these `huggingface-cli login` / `huggingface-cli upload`.)

## Verify the layout WebLLM expects

Files must sit at the repo root, not in a subfolder. Check that this URL returns JSON in a browser:

```
https://huggingface.co/<your-username>/Nova-Qwen3-0.6B-q4f16_1-MLC/resolve/main/mlc-chat-config.json
```

WebLLM will fetch `resolve/main/<file>` URLs from the repo URL you give it in chapter 06 — if this check fails now, the app will fail to load the model later.

## Keep it public

Keep the repo **public**. Private repos would need auth headers that WebLLM doesn't send, so the browser can't fetch from them. Add a README model card to the repo noting the base model and license (Apache-2.0, inherited from Qwen3).

## Troubleshooting

- **401 on upload.** Your token lacks write scope — generate a new one at https://huggingface.co/settings/tokens with the "Write" role and run `hf auth login` again.
- **Files landed under a subfolder.** Re-run the upload with `.` as the destination path, exactly as shown above — a mistyped destination nests the files under a subdirectory that WebLLM won't look in.
- **`resolve/main/...` 404.** Double-check the exact repo name, and confirm the upload actually finished — shards are hundreds of MB and can still be in flight.
- **Rate-limited downloads in the browser.** Rare, but it happens under heavy load. Retry, or use a Hugging Face mirror URL.

Next: [06 — Add the Model to the App](06-add-to-app.md)
