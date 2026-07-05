# Agent Parity & Tooling — Design

**Date:** 2026-07-05
**Status:** Approved by user (all four phases)
**Scope:** One phased implementation covering code execution, agent parity, conversation control, and live preview for the webgpu-agent browser app.

## Goals

Make the web agent behave like desktop coding agents (OpenCode, Hermes):

1. Fix the Python executor; add Lua and SQL execution; test all executors.
2. Rewrite the system prompt in OpenCode style and add the tools real agents have: precise file editing, code search, todo tracking, typed subagents.
3. Checkpoints: revert conversation **and** virtual-FS files to any earlier user message; edit & re-run a message; reply to a message or a text selection.
4. Preview HTML/JS output in a sandboxed in-app browser pane.

Everything stays fully in-browser (no server). New WASM runtimes load lazily on first use.

## Phase 1 — Code execution

### Python fix (`src/tools/python.ts`)

Diagnose first: reproduce `run_python` in local dev **and** in a production build served without COOP/COEP headers (GitHub Pages conditions — no SharedArrayBuffer; see the historical `JsNull` failure). Fix requirements:

- Worker creation must not touch SAB-requiring PyScript APIs (`donkey()`, py-terminal).
- Listen for `py:error` (and worker `error`/`messageerror`) so Python exceptions return as readable tool-result strings — never hangs or opaque `JsNull`.
- On timeout, terminate and recreate the worker so one hung call doesn't poison subsequent calls.

**Success criterion:** `run_python` returns correct stdout locally and on a Pages-equivalent static build; syntax errors and exceptions come back as text; a `while True: pass` times out cleanly and the next call works.

### New executors (one file per runtime, matching existing pattern)

- **`src/tools/lua.ts` — `run_lua(code)`**: `wasmoon` (Lua 5.4 WASM, ~300KB), dynamic `import()` on first call, `print` captured to a buffer, 15s timeout, errors returned as text.
- **`src/tools/sql.ts` — `run_sql(query, db_path?)`**: `sql.js` (SQLite WASM). With `db_path`: load that file from the virtual FS, execute, write back only if the DB was modified. Without: in-memory scratch DB. Results rendered as a compact text table; row count capped (e.g. 200 rows) with a truncation note.

### Tests

- Lua + SQL: real execution under vitest/Node (both libraries are Node-compatible): happy path, runtime error, timeout, and for SQL the FS round-trip (mocked FS via `src/test/memfs.ts`).
- Python: PyScript cannot run in Node — test the wrapper (message protocol, timeout/terminate-recreate, error mapping) with a mocked Worker.

## Phase 2 — Agent parity

### System prompt rewrite (`src/agenthome.ts`)

Replace `DEFAULT_SYSTEM_PROMPT` with an OpenCode-style prompt: short identity; environment block (browser runtime, virtual FS layout, `/home/user` home); conciseness rules; tool-use guidance (prefer `fs_edit` over whole-file rewrites, `grep`/`glob` before reading blindly, maintain a todo list on multi-step work, verify results before claiming success).

**Migration:** on init, if `/home/user/.agent/agent.md` byte-equals the *old* default, overwrite with the new default; otherwise leave the user's customized prompt untouched.

### New tools

| Tool | File | Behavior |
|---|---|---|
| `fs_edit(path, old_string, new_string, replace_all?)` | `src/tools/fs.ts` | Exact string replacement; error if match absent or (without `replace_all`) not unique. Wrapped by the checkpoint journal (Phase 3). |
| `grep(pattern, path?, include?)` | `src/tools/search.ts` (new) | Recursive virtual-FS walk, regex content search, `file:line: text` output, result cap (e.g. 100 matches) with truncation note. Skips binary-looking files. |
| `glob(pattern, path?)` | `src/tools/search.ts` | File-path matching via a small internal glob→regex converter (`*`, `**`, `?`). No new dependency. |
| `todo_write(todos: [{content, status}])` | `src/tools/todo.ts` (new) | Replaces the agent's task list. State stored in session data (persists with the session); rendered as a compact checklist panel in the chat UI. |
| `spawn_agent(prompt, type?)` | `src/tools/multiagent.ts` | `type` selects an agent definition file `/home/user/.agent/agents/<name>.md` (frontmatter `name`, `description`; body = subagent system prompt). Seed defaults: `explorer`, `coder`. Available types listed in the tool description. No type = current generic behavior. No nested spawning (existing rule kept). |

`buildToolSystemPrompt` (`src/agent/toolPrompt.ts`) gains short usage notes per tool where behavior isn't obvious from the schema.

**Tool info in the system prompt (all models):** `buildAgentSystemPrompt` (`src/agent/context.ts`) always includes a compact tool overview — each tool's name and one-line description grouped by category (files, search, code execution, git, web, agent). For models without native tool calling this complements the full schema section from `buildToolSystemPrompt` (no duplication: the overview replaces any redundant listing); for native-tool-calling models it gives the prompt-level context real agents have about their own capabilities.

## Phase 3 — Conversation control

### Message identity

`ChatMessage` and `DisplayItem` (`src/types.ts`) gain a stable `id: string` (random, generated at creation). Sessions loaded without ids get them assigned once on load and re-persisted.

### Checkpoint journal (`src/checkpoints/journal.ts`, new)

**Mechanism: copy-on-write journal** (chosen over full-FS snapshots and event-sourcing).

- Each **user message** begins a checkpoint (keyed by the message id).
- All mutating FS operations used by tools (`fs_write`, `fs_delete`, `fs_mkdir`, `fs_move`, `fs_edit`, git worktree writes) route through one wrapper at the FS-helper layer. The **first** time a path is mutated within the current checkpoint, record `{path, prev}` where `prev` is the prior file content or an `absent` marker (for creations; for deleted dirs, the marker notes it was a directory).
- Journal stored per session alongside messages in `webgpu-agent.session.{id}`.
- Retention: last 50 checkpoints per session; older records are merged into their successor (so reverting to the oldest retained checkpoint stays correct).

**Revert to checkpoint N:** apply records of all checkpoints newer than or equal to N in reverse chronological order (restore `prev` / delete `absent`-marked files), truncate messages and display items after that point, drop the applied journal entries.

### UI actions (⋯ menu on messages in `MessageList`)

- **Revert to here** (user messages): confirmation dialog stating how many messages and files are affected, then revert as above.
- **Edit & re-run** (user messages): same revert, then place the message text in the composer for editing and resubmission.
- **Reply** (any message): insert a markdown blockquote of the message into the composer.
- **Reply to selection:** selecting text inside a message shows a floating **Quote** button; inserts only the selection as a blockquote.

Quotes are plain markdown in the user's next message — no new message schema.

## Phase 4 — Live preview

A **preview pane**: side-by-side split on desktop, full-screen overlay on mobile, hosting a sandboxed iframe (`sandbox="allow-scripts"`, `srcDoc`). Entry points:

1. **Preview button** on `html` code blocks in assistant messages.
2. **`preview` tool** (`src/tools/preview.ts`, new): agent passes a virtual-FS path or raw HTML; the pane opens.
3. Manual open from the files view for `.html` files.

**Asset inlining:** when previewing an FS file, relative `<script src>`, `<link rel="stylesheet" href>`, and `<img src>` references are resolved against the virtual FS and inlined (scripts/styles as content, images as data URIs). Regex-based; relative paths only; missing assets become a visible console warning rather than an error.

**Pane chrome:** refresh button (re-read from FS, re-inline), close button, and a console strip — an injected script forwards `console.log/warn/error` and `window.onerror` to the parent via `postMessage`.

## Cross-cutting

- **Error handling:** executors, preview, and new tools never throw into the agent loop; all failures return as readable tool-result strings.
- **Testing:** every phase lands with vitest coverage in the existing setup (jsdom, mocked FS via `src/test/memfs.ts`). Checkpoint journal gets dedicated tests: write→revert round-trips including create/delete/move and multi-checkpoint reverts.
- **Bundle discipline:** wasmoon and sql.js are dynamically imported; no change to initial bundle beyond a few KB of glue.
- **New dependencies:** `wasmoon`, `sql.js` only.

## Build order

Phase 1 → Phase 2 → Phase 3 → Phase 4. Phases are independent enough to ship one PR each, but a single phased branch is acceptable (user's usual style).

## Out of scope

- Rust execution (no in-browser compiler; external playground API was considered and rejected — may revisit later).
- Ruby/PHP runtimes (considered, not selected).
- Serving preview assets via service worker (inlining chosen instead).
