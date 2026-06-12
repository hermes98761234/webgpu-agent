# MEMORY.md — webgpu-agent

## Project overview

Fully client-side AI agent SPA (Vite + React 19 + TypeScript 6). Runs LLM inference in-browser via WebGPU (`@mlc-ai/web-llm`) or connects to OpenAI-compatible APIs. Deployed to GitHub Pages at `https://hermes98761234.github.io/webgpu-agent/`.

## Architecture decisions

- **Agent home in `/home/user/.agent`** (IndexedDB via `@isomorphic-git/lightning-fs`). Skills, plugins, MCP config, and `agent.md` (system prompt) stored as files, not localStorage. Auto-migrated from legacy localStorage on first run. [ses_144a4eb8bfferqbhYc8G4Iyxym]
- **Gallery page removed.** Skills managed via sidebar panel and file browser. [ses_144a4eb8bfferqbhYc8G4Iyxym]
- **Model auto-loads on startup** — last-used model (or first recommended preset) loaded after agent-home init. [ses_144a4eb8bfferqbhYc8G4Iyxym]
- **Context trimming** — `maxContextMessages` (default 40) in `AgentSettings`. Old messages dropped before each `runAgent` call, always starting from a clean user turn. [ses_144a4eaacffe8Wql3GA8AosT34]
- **Dynamic slash commands** — `skills` state lifted to `App.tsx`, commands recomputed from installed skills (`/skill:<name>`) and plugins (`/plugin-<name>`). [ses_144a4eaacffe8Wql3GA8AosT34]
- **Multi-agent delegation** — `spawn_agent` tool forks sub-agent with full tool access (minus `spawn_agent` itself to prevent nesting). Inherits parent's abort signal. [ses_144a4e9fcffer9xw4oYmGrG3LH]
- **Built-in skills seeded by default**: File System and Git, with full reference guides. Idempotent seeding preserves user edits. [ses_144a4e9fcffer9xw4oYmGrG3LH]
- **Two built-in skills**: File System (6 `fs_*` tools) and Git (9 `git_*` tools via `isomorphic-git`). [ses_144a4e9fcffer9xw4oYmGrG3LH]

## Discovered durable knowledge

- **Encryption gap (KNOWN UNRESOLVED)**: `usePersistedState` writes raw JSON to `localStorage` without encryption. The encrypted store (`src/store/index.ts`) exports `getStoreItem`/`setStoreItem` but they are **never imported** — `usePersistedState` is used everywhere instead. API keys stored in `webgpu-agent.api` are in plaintext. [ses_144a269eaffeKCpsf0Pitigi5f]
- **Password gate fix**: Wrong password was previously accepted silently. Store now keeps an encrypted sentinel (`webgpu-agent.pwcheck`) and verifies before unlock. Changing password re-encrypts existing blobs. [ses_144a4ea68ffe7QHphdoabTl4O9]
- **Context window retry**: On `ContextWindowSizeExceededError` in local provider, retries with trimmed conversation (system message + last 4 turns). [ses_144a4eaf4ffeoWkuc5N5reQTQt]
- **Slash commands**: `/clear`, `/settings`, `/skills`, `/mcp`, `/help`, `/git status`, `/ls`, `/agent`, `/files`. [verified in App.tsx SLASH_COMMANDS array]

## Gotchas

- `usePersistedState` bypasses encryption — all UI state (API keys, settings, theme) stored in plaintext localStorage.
- `getStoreItem`/`setStoreItem` are exported but dead code — never imported outside `store/index.ts`.
- Sub-agents cannot spawn further sub-agents (intentional design to prevent infinite nesting).
- WebGPU CORS limitation: WASM alone cannot bypass CORS for external API calls; proxy support was added for MCP. [ses_144a4eb8bfferqbhYc8G4Iyxym]

## Files of interest

- `src/App.tsx` — main component, view routing, context trimming
- `src/agenthome.ts` — agent-home init, migration from legacy localStorage
- `src/store/index.ts` — encrypted store wrapper (partially unused)
- `src/store/encrypted.ts` — PBKDF2 → AES-256-GCM via Web Crypto API
- `src/ui/usePersistedState.ts` — raw localStorage hook (encryption gap source)
- `src/tools/multiagent.ts` — spawn_agent tool
- `src/tools/fs.ts`, `src/tools/git.ts`, `src/tools/web.ts` — built-in tool modules
- `src/skills/defaults.ts` — default skill definitions (File System, Git)
