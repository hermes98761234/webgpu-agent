# 🤖 webgpu-agent

**AI agent that runs entirely in your browser** · [Live Demo](https://hermes98761234.github.io/webgpu-agent/)

## Features

- **Local models via WebGPU** — Run open-source LLMs directly in your browser using `@mlc-ai/web-llm`. Model weights are cached in-browser; nothing leaves your machine.
- **External API mode** — Connect to any OpenAI-compatible API: OpenAI, OpenRouter, or a custom base URL.
- **Agent tool loop** — Built-in tools: `get_time`, `fetch_url`, and `run_javascript` (sandboxed in a Web Worker).
- **Persistent memory** — Save and recall agent memories across chats with `memory_save` and `memory_delete`. Memories live in the browser's virtual filesystem and survive page reloads.
- **User-defined skills** — Create, edit, and delete custom skills stored in `localStorage`, loaded via the `use_skill` tool.
- **Remote MCP servers** — Connect to MCP servers over Streamable HTTP, with tool names automatically prefixed by server.

## Browser Requirements

- **Local models:** A WebGPU-capable browser — Chrome/Edge 113+, or recent Firefox/Safari builds.
- **API mode:** Any modern browser.
- **Model downloads:** ~1–3 GB depending on the model. Weights are cached in the browser after first download.

## Usage

1. Choose **Local** (WebGPU) or **API** mode.
2. **Local:** pick a preset model and wait for it to download/cache. **API:** enter your API key and model ID.
3. Chat with the agent.
4. Add custom skills via the **Skills** panel.
5. Add MCP servers via the **MCP** panel (servers must be CORS-enabled — see note below).

> **CORS limitation:** MCP servers must have CORS headers configured to accept requests from the browser. This is a browser security constraint, not a bug in webgpu-agent.

## Security Notes

- API keys are stored in browser `localStorage` only — never sent to any third party.
- `run_javascript` executes inside a Web Worker sandbox with no DOM access.
- All requests originate directly from your browser. There is no intermediate backend.

## Development

```bash
npm install
npm run dev      # start dev server
npm test         # run tests (vitest run)
npm run build    # production build
npm run preview  # preview production build
```

### Project Structure

| Directory | Purpose |
|-----------|---------|
| `src/providers/` | Model providers — local (WebLLM) and external API |
| `src/agent/` | Agent loop and tool prompt generation |
| `src/tools/` | Built-in tools (`get_time`, `fetch_url`, `run_javascript`) |
| `src/skills/` | User-defined skills store (localStorage) |
| `src/mcp/` | MCP client manager (Streamable HTTP) |
| `src/ui/` | React UI components (chat, model picker, panels) |

## Skills

The system prompt includes a `# Skills` section listing every installed skill's name and description. When the model needs full instructions, it calls `use_skill` with the exact skill name to load the complete `SKILL.md` on demand. This progressive disclosure keeps prompts small while giving the agent access to detailed workflows.

Skills live in `/home/user/.agent/skills/<slug>/SKILL.md` inside the browser's virtual filesystem (IndexedDB via `@isomorphic-git/lightning-fs`). User-created skills are managed through the **Skills** UI panel and persist across sessions.

The catalog is built by `src/skills/store.ts` and injected into the system prompt by `src/agent/context.ts`.

## Memory

The agent has access to persistent file-based memory stored in the browser's virtual filesystem at `/home/user/.agent/memory/`. Each memory is a markdown file with `name` and `description` frontmatter. An index file, `MEMORY.md`, lists all saved memories.

- **Save** — `memory_save` tool writes a new memory file and updates the index.
- **Delete** — `memory_delete` tool removes a memory file and updates the index.
- **Recall** — The `MEMORY.md` index is injected into the system prompt each run (via `src/agent/context.ts`); the agent reads individual memory files with `fs_read` as needed.

Memory survives page reloads and new chats — it is backed by IndexedDB. The index and usage guidance are injected as a `# Memory` section in the system prompt so the agent always knows what it has remembered and how to manage it.

## Deployment

Push to `main` → GitHub Actions automatically builds and deploys to [GitHub Pages](https://hermes98761234.github.io/webgpu-agent/).

## Tech Stack

[Vite](https://vitejs.dev/) · [React](https://react.dev/) · [TypeScript](https://www.typescriptlang.org/) · [`@mlc-ai/web-llm`](https://github.com/mlc-ai/web-llm) · [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) · [Vitest](https://vitest.dev/)
