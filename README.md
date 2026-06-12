# 🤖 webgpu-agent

**AI agent that runs entirely in your browser** · [Live Demo](https://hermes98761234.github.io/webgpu-agent/)

## Features

- **Local models via WebGPU** — Run open-source LLMs directly in your browser using `@mlc-ai/web-llm`. Model weights are cached in-browser; nothing leaves your machine.
- **External API mode** — Connect to any OpenAI-compatible API: OpenAI, OpenRouter, or a custom base URL.
- **Agent tool loop** — Built-in tools: `get_time`, `fetch_url`, and `run_javascript` (sandboxed in a Web Worker).
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

## Deployment

Push to `main` → GitHub Actions automatically builds and deploys to [GitHub Pages](https://hermes98761234.github.io/webgpu-agent/).

## Tech Stack

[Vite](https://vitejs.dev/) · [React](https://react.dev/) · [TypeScript](https://www.typescriptlang.org/) · [`@mlc-ai/web-llm`](https://github.com/mlc-ai/web-llm) · [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) · [Vitest](https://vitest.dev/)
