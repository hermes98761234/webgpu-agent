# WebGPU Agent — Design Spec

**Date:** 2026-06-12
**Repo:** `hermes98761234/webgpu-agent` (public, GitHub Pages)
**Live URL:** https://hermes98761234.github.io/webgpu-agent/

## What

A fully client-side AI agent that runs in the browser. Users chat with an agent that can:

1. Run **open-source models locally via WebGPU** (WebLLM / `@mlc-ai/web-llm`) from a curated preset list — no server, weights cached in the browser.
2. Alternatively use **external OpenAI-compatible APIs** (OpenAI, OpenRouter, or any custom base URL) with a user-supplied API key.
3. Call **tools** in an agent loop: built-in tools, user-defined **skills**, and tools from remote **MCP servers**.
4. Deploy as a static site to **GitHub Pages** via GitHub Actions.

## Decisions (made autonomously; alternatives rejected)

| Decision | Choice | Rejected alternatives |
|---|---|---|
| Framework | Vite + React + TypeScript | Vanilla TS (more boilerplate for chat UI); Next.js (needs static export gymnastics, overkill for SPA) |
| Local inference | `@mlc-ai/web-llm` | transformers.js (slower for chat LLMs, fewer instruct models); wllama (CPU-only) |
| Preset models | Curated ID list filtered against `prebuiltAppConfig.model_list` at runtime | Hardcoding only (breaks on lib upgrades); showing all ~100 prebuilt models (overwhelming) |
| Tool calling (API) | Native OpenAI `tools` parameter with streaming | Prompt-based (worse when native exists) |
| Tool calling (local) | JSON fenced-block protocol + parser (small local models have unreliable native function calling) | WebLLM native function calling (limited model support) |
| Skills | Markdown skills (name, description, instructions) in localStorage; agent sees a skill catalog and loads one via `use_skill` tool | Bundled-only skills (not user-extensible) |
| MCP | `@modelcontextprotocol/sdk` client over Streamable HTTP (browser `fetch`); CORS-enabled servers only — documented limitation | stdio transport (impossible in browser); custom proxy server (violates "static site only") |
| State | localStorage (settings, skills, MCP servers, API keys) | IndexedDB (overkill; weights already cached by WebLLM via Cache API) |
| Styling | Hand-written CSS, dark theme | Tailwind/UI kits (dependency weight, slop risk) |
| Deploy | GitHub Actions → `actions/deploy-pages`, Vite `base: '/webgpu-agent/'` | gh-pages branch push (legacy) |
| Tests | Vitest unit tests for agent loop, tool parser, skill store, SSE parsing | Browser e2e (no GPU in CI) |

## Architecture

```
src/
  types.ts              Shared types: ChatMessage, ToolCall, ToolDef, ProviderConfig, ChatDelta
  providers/
    api.ts              OpenAI-compatible streaming client (SSE), native tool calls
    local.ts            WebLLM engine wrapper, preset list, load-progress callbacks
  agent/
    loop.ts             Agent loop: chat → tool calls → execute → repeat (max 10 iterations)
    toolPrompt.ts       System-prompt builder + JSON tool-call parser for local models
  tools/
    builtin.ts          get_time, fetch_url (CORS-bound), run_javascript (Web Worker sandbox)
  skills/
    store.ts            localStorage CRUD for skills + use_skill ToolDef factory
  mcp/
    manager.ts          MCP client connections, tool discovery, ToolDef adapters
  ui/                   React components: Chat, MessageList, Composer, ModelPicker,
                        SettingsPanel, SkillsPanel, McpPanel, ToolCallView
```

**Data flow:** Composer → `runAgent(messages, provider, tools, onEvent)` → provider streams deltas → UI renders; tool calls execute client-side, results appended, loop continues until plain-text answer or iteration cap.

**Error handling:** provider/network/tool errors surface as visible error messages in chat (never silent); WebGPU unavailability detected at startup with a clear banner pointing at API providers as fallback.

## Success criteria

- `npm run build` and `npm test` pass; CI green on `main`.
- Live GitHub Pages site loads; a preset model can be downloaded and chatted with on a WebGPU browser; OpenRouter works with a key.
- Skills CRUD persists across reloads; agent can invoke `use_skill`.
- Adding a CORS-enabled MCP server lists its tools and the agent can call them.
- README documents all of the above plus browser requirements.
