# WebGPU Agent Implementation Plan

> **For agentic workers:** This plan is executed via Hermes kanban tasks. Each `### Task N:` section becomes one kanban task. Copy code verbatim; verify with the exact commands given.

**Goal:** A browser-only AI agent (chat + tool loop) running open-source models via WebGPU (WebLLM) or external OpenAI-compatible APIs (OpenAI/OpenRouter), with user-defined skills and remote MCP servers, deployed to GitHub Pages.

**Architecture:** Vite + React + TypeScript SPA. Pure client-side: providers (`providers/api.ts`, `providers/local.ts`) implement a common `Provider` interface; `agent/loop.ts` runs the tool-calling loop (native OpenAI tools for API providers, JSON fenced-block protocol for local models); tools come from `tools/builtin.ts`, `skills/store.ts` (localStorage skills + `use_skill` tool), and `mcp/manager.ts` (Streamable HTTP MCP clients). UI is hand-written React + CSS.

**Tech Stack:** Vite, React 18+, TypeScript, `@mlc-ai/web-llm`, `@modelcontextprotocol/sdk`, Vitest, GitHub Actions + GitHub Pages.

---

### Task 1: Scaffold app, create GitHub repo, GitHub Pages deploy workflow

**Files:**
- Create: entire Vite react-ts scaffold at repo root
- Create: `.github/workflows/deploy.yml`
- Modify: `vite.config.ts`, `package.json`, `src/App.tsx`, `index.html`
- Create: `src/smoke.test.ts`

- [ ] **Step 1: Scaffold Vite app into the existing directory**

The directory already contains `.git/` and `docs/`, so scaffold into a temp dir and move files up:

```bash
cd /home/user/projects/webgpu-agent
npm create vite@latest tmp-app -- --template react-ts
mv tmp-app/* .
mv tmp-app/.gitignore . 2>/dev/null || true
rm -rf tmp-app
npm install
npm install @mlc-ai/web-llm @modelcontextprotocol/sdk
npm install -D vitest
```

Expected: `package.json`, `vite.config.ts`, `src/` exist at repo root; installs succeed.

- [ ] **Step 2: Configure Vite base path for GitHub Pages**

Replace `vite.config.ts` entirely with:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/webgpu-agent/',
})
```

- [ ] **Step 3: Add test script and smoke test**

In `package.json` `"scripts"`, add: `"test": "vitest run"`.

Create `src/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 4: Minimal app shell**

Delete `src/App.css` and `src/assets/react.svg` and `public/vite.svg`. Replace `src/App.tsx` entirely with:

```tsx
export default function App() {
  const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator
  return (
    <main style={{ padding: 24 }}>
      <h1>WebGPU Agent</h1>
      <p>Browser-based AI agent. UI under construction.</p>
      <p>WebGPU: {hasWebGpu ? 'available' : 'NOT available in this browser'}</p>
    </main>
  )
}
```

Replace `src/index.css` entirely with:

```css
:root {
  color-scheme: dark;
  --bg: #111418;
  --bg-alt: #1a1f26;
  --border: #2c343f;
  --text: #e6e9ee;
  --text-dim: #97a1ad;
  --accent: #4f9cf9;
  --error: #f97066;
  font-family: system-ui, -apple-system, sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); }
```

In `index.html` set `<title>WebGPU Agent</title>` and remove the `<link rel="icon" ...>` line. In `src/main.tsx` keep as scaffolded (it imports `./index.css` — ensure no import of removed files remains anywhere).

- [ ] **Step 5: Pages deploy workflow**

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 6: Verify locally**

```bash
npm run lint && npm test && npm run build
```

Expected: lint clean, 1 test passes, `dist/` produced. Fix any errors before continuing.

- [ ] **Step 7: Create GitHub repo, enable Pages, push**

```bash
git add -A
git commit -m "feat: scaffold Vite + React + TS app with Pages deploy workflow"
gh repo create webgpu-agent --public --description '🤖 AI agent in your browser — WebGPU local models, skills, MCP, OpenAI/OpenRouter support' --source . --remote origin
gh repo edit hermes98761234/webgpu-agent --add-topic webgpu --add-topic webllm --add-topic ai-agent --add-topic mcp --add-topic llm
git push -u origin main
gh api repos/hermes98761234/webgpu-agent/pages -X POST -F build_type=workflow || echo "Pages already enabled (409 is OK)"
```

- [ ] **Step 8: Wait for deploy to go green**

```bash
gh run list --limit 3
gh run watch <run-id> --exit-status
```

If the first run started before Pages was enabled and the deploy job failed, re-run it: `gh run rerun <run-id>`. Poll until the "Deploy to GitHub Pages" workflow concludes success. Then verify:

```bash
curl -s -o /dev/null -w "%{http_code}" https://hermes98761234.github.io/webgpu-agent/
```

Expected: `200`. Report the live URL.

---

### Task 2: Core types + local-model tool-call protocol (TDD)

**Files:**
- Create: `src/types.ts`
- Create: `src/agent/toolPrompt.ts`
- Test: `src/agent/toolPrompt.test.ts`

- [ ] **Step 1: Create `src/types.ts`** (shared by everything later — copy exactly):

```ts
export type Role = 'system' | 'user' | 'assistant' | 'tool'

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface ChatMessage {
  role: Role
  content: string
  toolCalls?: ToolCall[]
  toolCallId?: string
}

export interface ToolDef {
  name: string
  description: string
  parameters: Record<string, unknown>
  source: 'builtin' | 'skill' | 'mcp'
  execute(args: Record<string, unknown>): Promise<string>
}

export interface ChatResult {
  content: string
  toolCalls: ToolCall[]
}

export interface Provider {
  supportsNativeTools: boolean
  chat(
    messages: ChatMessage[],
    tools: ToolDef[],
    onDelta: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<ChatResult>
}

export interface ApiConfig {
  kind: 'openai' | 'openrouter' | 'custom'
  baseUrl: string
  apiKey: string
  model: string
}

export interface Skill {
  id: string
  name: string
  description: string
  instructions: string
}

export interface McpServerConfig {
  id: string
  name: string
  url: string
}

export type AgentEvent =
  | { type: 'assistant_delta'; text: string }
  | { type: 'assistant_message'; message: ChatMessage }
  | { type: 'tool_start'; call: ToolCall }
  | { type: 'tool_result'; call: ToolCall; result: string; isError: boolean }
  | { type: 'error'; error: string }
```

- [ ] **Step 2: Write failing tests** — create `src/agent/toolPrompt.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildToolSystemPrompt, parseToolCall } from './toolPrompt'
import type { ToolDef } from '../types'

const tools: ToolDef[] = [
  {
    name: 'get_time',
    description: 'Get current time',
    parameters: { type: 'object', properties: {} },
    source: 'builtin',
    execute: async () => 'now',
  },
]

describe('buildToolSystemPrompt', () => {
  it('lists tool names and protocol', () => {
    const p = buildToolSystemPrompt(tools)
    expect(p).toContain('get_time')
    expect(p).toContain('"tool"')
  })
  it('returns empty string for no tools', () => {
    expect(buildToolSystemPrompt([])).toBe('')
  })
})

describe('parseToolCall', () => {
  it('parses a fenced json block', () => {
    const call = parseToolCall('```json\n{"tool": "get_time", "arguments": {}}\n```')
    expect(call?.name).toBe('get_time')
    expect(call?.arguments).toEqual({})
  })
  it('parses fenced block surrounded by prose', () => {
    const call = parseToolCall('I will check.\n```json\n{"tool": "x", "arguments": {"a": 1}}\n```\nDone.')
    expect(call?.name).toBe('x')
    expect(call?.arguments).toEqual({ a: 1 })
  })
  it('parses bare json', () => {
    const call = parseToolCall('{"tool": "x", "arguments": {"q": "hi"}}')
    expect(call?.arguments).toEqual({ q: 'hi' })
  })
  it('returns null for plain text', () => {
    expect(parseToolCall('The answer is 42.')).toBeNull()
  })
  it('returns null for json without tool field', () => {
    expect(parseToolCall('{"answer": 42}')).toBeNull()
  })
  it('assigns unique ids', () => {
    const a = parseToolCall('{"tool": "x", "arguments": {}}')
    const b = parseToolCall('{"tool": "x", "arguments": {}}')
    expect(a?.id).not.toBe(b?.id)
  })
})
```

- [ ] **Step 3: Run tests, expect failure**

Run: `npm test`
Expected: FAIL — cannot resolve `./toolPrompt`.

- [ ] **Step 4: Implement `src/agent/toolPrompt.ts`**:

```ts
import type { ToolCall, ToolDef } from '../types'

export function buildToolSystemPrompt(tools: ToolDef[]): string {
  if (tools.length === 0) return ''
  const lines = tools.map(
    (t) => `- ${t.name}: ${t.description}\n  parameters (JSON Schema): ${JSON.stringify(t.parameters)}`,
  )
  return [
    'You can call tools. Available tools:',
    ...lines,
    '',
    'To call a tool, reply with ONLY a fenced JSON block in exactly this form:',
    '```json',
    '{"tool": "<tool_name>", "arguments": { ... }}',
    '```',
    'Call at most one tool per reply. After you receive the tool result, continue.',
    'When you can answer the user directly, reply with plain text and NO json block.',
  ].join('\n')
}

let counter = 0

export function parseToolCall(text: string): ToolCall | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  let obj: unknown
  try {
    obj = JSON.parse(candidate.slice(start, end + 1))
  } catch {
    return null
  }
  if (typeof obj !== 'object' || obj === null) return null
  const rec = obj as Record<string, unknown>
  if (typeof rec.tool !== 'string') return null
  const args = rec.arguments
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return null
  counter += 1
  return { id: `local-${counter}`, name: rec.tool, arguments: args as Record<string, unknown> }
}
```

- [ ] **Step 5: Verify and commit**

Run: `npm run lint && npm test && npm run build`
Expected: all tests PASS (smoke + 8 new).

```bash
git add src/types.ts src/agent/
git commit -m "feat: core types and local-model JSON tool-call protocol"
git push origin main
```

---

### Task 3: OpenAI-compatible API provider with streaming (TDD)

**Files:**
- Create: `src/providers/api.ts`
- Test: `src/providers/api.test.ts`

- [ ] **Step 1: Write failing tests** — create `src/providers/api.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiProvider, parseSseLines } from './api'

function sseResponse(lines: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder()
      for (const line of lines) controller.enqueue(enc.encode(line + '\n'))
      controller.close()
    },
  })
  return new Response(body, { status: 200 })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseSseLines', () => {
  it('extracts data payloads and keeps the partial tail', () => {
    const { events, rest } = parseSseLines('data: {"a":1}\n\ndata: [DONE]\ndata: {"b"')
    expect(events).toEqual(['{"a":1}'])
    expect(rest).toBe('data: {"b"')
  })
})

describe('ApiProvider', () => {
  const config = { kind: 'custom' as const, baseUrl: 'https://x.test/v1', apiKey: 'k', model: 'm' }

  it('streams content deltas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}',
      'data: {"choices":[{"delta":{"content":"lo"}}]}',
      'data: [DONE]',
    ])))
    const deltas: string[] = []
    const provider = new ApiProvider(config)
    const result = await provider.chat(
      [{ role: 'user', content: 'hi' }], [], (t) => deltas.push(t),
    )
    expect(result.content).toBe('Hello')
    expect(deltas).toEqual(['Hel', 'lo'])
    expect(result.toolCalls).toEqual([])
  })

  it('assembles streamed tool calls', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"get_time","arguments":""}}]}}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"tz\\":"}}]}}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"utc\\"}"}}]}}]}',
      'data: [DONE]',
    ])))
    const provider = new ApiProvider(config)
    const result = await provider.chat([{ role: 'user', content: 'time?' }], [], () => {})
    expect(result.toolCalls).toEqual([
      { id: 'c1', name: 'get_time', arguments: { tz: 'utc' } },
    ])
  })

  it('throws a readable error on non-200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad key', { status: 401 })))
    const provider = new ApiProvider(config)
    await expect(
      provider.chat([{ role: 'user', content: 'hi' }], [], () => {}),
    ).rejects.toThrow(/401/)
  })
})
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npm test`
Expected: FAIL — cannot resolve `./api`.

- [ ] **Step 3: Implement `src/providers/api.ts`**:

```ts
import type { ApiConfig, ChatMessage, ChatResult, Provider, ToolCall, ToolDef } from '../types'

export const API_PRESETS: Record<ApiConfig['kind'], { label: string; baseUrl: string }> = {
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  openrouter: { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  custom: { label: 'Custom (OpenAI-compatible)', baseUrl: '' },
}

export function parseSseLines(buffer: string): { events: string[]; rest: string } {
  const events: string[] = []
  const lines = buffer.split('\n')
  const rest = lines.pop() ?? ''
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('data:')) {
      const data = trimmed.slice(5).trim()
      if (data && data !== '[DONE]') events.push(data)
    }
  }
  return { events, rest }
}

function toWireMessage(m: ChatMessage): Record<string, unknown> {
  if (m.role === 'tool') {
    return { role: 'tool', tool_call_id: m.toolCallId, content: m.content }
  }
  const wire: Record<string, unknown> = { role: m.role, content: m.content }
  if (m.toolCalls && m.toolCalls.length > 0) {
    wire.tool_calls = m.toolCalls.map((c) => ({
      id: c.id,
      type: 'function',
      function: { name: c.name, arguments: JSON.stringify(c.arguments) },
    }))
  }
  return wire
}

interface SseDelta {
  content?: string
  tool_calls?: Array<{
    index?: number
    id?: string
    function?: { name?: string; arguments?: string }
  }>
}

interface PartialToolCall {
  id: string
  name: string
  argsText: string
}

export class ApiProvider implements Provider {
  supportsNativeTools = true

  constructor(private config: ApiConfig) {}

  async chat(
    messages: ChatMessage[],
    tools: ToolDef[],
    onDelta: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<ChatResult> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: messages.map(toWireMessage),
      stream: true,
    }
    if (tools.length > 0) {
      body.tools = tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }))
    }
    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      throw new Error(`API error ${res.status}: ${text.slice(0, 500)}`)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let content = ''
    const partials = new Map<number, PartialToolCall>()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const { events, rest } = parseSseLines(buffer)
      buffer = rest
      for (const data of events) {
        let parsed: unknown
        try {
          parsed = JSON.parse(data)
        } catch {
          continue
        }
        const delta = (parsed as { choices?: Array<{ delta?: SseDelta }> }).choices?.[0]?.delta
        if (!delta) continue
        if (typeof delta.content === 'string' && delta.content) {
          content += delta.content
          onDelta(delta.content)
        }
        for (const tc of delta.tool_calls ?? []) {
          const idx = tc.index ?? 0
          const partial = partials.get(idx) ?? { id: '', name: '', argsText: '' }
          if (tc.id) partial.id = tc.id
          if (tc.function?.name) partial.name = tc.function.name
          if (tc.function?.arguments) partial.argsText += tc.function.arguments
          partials.set(idx, partial)
        }
      }
    }
    const toolCalls: ToolCall[] = []
    for (const [, p] of [...partials.entries()].sort((a, b) => a[0] - b[0])) {
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(p.argsText || '{}') as Record<string, unknown>
      } catch {
        args = {}
      }
      toolCalls.push({ id: p.id || `call-${toolCalls.length}`, name: p.name, arguments: args })
    }
    return { content, toolCalls }
  }
}
```

- [ ] **Step 4: Verify and commit**

Run: `npm run lint && npm test && npm run build`
Expected: all tests PASS.

```bash
git add src/providers/
git commit -m "feat: OpenAI-compatible streaming provider (OpenAI/OpenRouter/custom)"
git push origin main
```

---

### Task 4: WebLLM local provider with preset models

**Files:**
- Create: `src/providers/local.ts`
- Test: `src/providers/local.test.ts`

- [ ] **Step 1: Implement `src/providers/local.ts`**:

```ts
import { CreateMLCEngine, prebuiltAppConfig } from '@mlc-ai/web-llm'
import type { MLCEngine } from '@mlc-ai/web-llm'
import type { ChatMessage, ChatResult, Provider, ToolDef } from '../types'

const PREFERRED_MODELS = [
  'Qwen3-1.7B-q4f16_1-MLC',
  'Qwen3-4B-q4f16_1-MLC',
  'Llama-3.2-1B-Instruct-q4f16_1-MLC',
  'Llama-3.2-3B-Instruct-q4f16_1-MLC',
  'Phi-3.5-mini-instruct-q4f16_1-MLC',
  'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
  'gemma-2-2b-it-q4f16_1-MLC',
]

export function presetModels(): string[] {
  const available = new Set(prebuiltAppConfig.model_list.map((m) => m.model_id))
  const preferred = PREFERRED_MODELS.filter((id) => available.has(id))
  if (preferred.length > 0) return preferred
  return prebuiltAppConfig.model_list.slice(0, 10).map((m) => m.model_id)
}

export function webgpuAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

export class LocalProvider implements Provider {
  supportsNativeTools = false
  private engine: MLCEngine | null = null
  loadedModel = ''

  async load(modelId: string, onProgress: (text: string, progress: number) => void): Promise<void> {
    if (this.engine && this.loadedModel === modelId) return
    if (this.engine) {
      await this.engine.unload()
      this.engine = null
      this.loadedModel = ''
    }
    this.engine = await CreateMLCEngine(modelId, {
      initProgressCallback: (p) => onProgress(p.text, p.progress),
    })
    this.loadedModel = modelId
  }

  async chat(
    messages: ChatMessage[],
    _tools: ToolDef[],
    onDelta: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<ChatResult> {
    if (!this.engine) throw new Error('No local model loaded — pick a model and press Load first')
    const wire = messages
      .filter((m) => m.role !== 'tool')
      .map((m) => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content }))
    const chunks = await this.engine.chat.completions.create({ messages: wire, stream: true })
    let content = ''
    for await (const chunk of chunks) {
      if (signal?.aborted) break
      const delta = chunk.choices[0]?.delta?.content ?? ''
      if (delta) {
        content += delta
        onDelta(delta)
      }
    }
    return { content, toolCalls: [] }
  }
}
```

Note: if any `PREFERRED_MODELS` id does not exist in the installed web-llm version, that is fine — `presetModels()` filters by what exists. Do NOT change the list unless lint/build fails.

- [ ] **Step 2: Test the pure parts** — create `src/providers/local.test.ts` (no GPU in test env, so test only the preset logic):

```ts
import { describe, expect, it } from 'vitest'
import { presetModels } from './local'

describe('presetModels', () => {
  it('returns a non-empty list of model ids', () => {
    const models = presetModels()
    expect(models.length).toBeGreaterThan(0)
    for (const id of models) expect(typeof id).toBe('string')
  })
})
```

- [ ] **Step 3: Verify and commit**

Run: `npm run lint && npm test && npm run build`
Expected: PASS. (If importing web-llm in vitest's node environment fails, add to `vite.config.ts` a `test` block — change the first line to `import { defineConfig } from 'vitest/config'` and add `test: { environment: 'node' }` inside `defineConfig({...})`. Only do this if the test errors.)

```bash
git add src/providers/ vite.config.ts
git commit -m "feat: WebLLM local provider with curated preset model list"
git push origin main
```

---

### Task 5: Built-in tools (TDD)

**Files:**
- Create: `src/tools/builtin.ts`
- Test: `src/tools/builtin.test.ts`

- [ ] **Step 1: Write failing tests** — create `src/tools/builtin.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { builtinTools } from './builtin'

const byName = (name: string) => {
  const tool = builtinTools.find((t) => t.name === name)
  if (!tool) throw new Error(`missing tool ${name}`)
  return tool
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('builtinTools', () => {
  it('exposes get_time, fetch_url, run_javascript', () => {
    expect(builtinTools.map((t) => t.name).sort()).toEqual([
      'fetch_url', 'get_time', 'run_javascript',
    ])
  })

  it('get_time returns a date string', async () => {
    const out = await byName('get_time').execute({})
    expect(out).toContain(String(new Date().getFullYear()))
  })

  it('fetch_url rejects non-http urls', async () => {
    const out = await byName('fetch_url').execute({ url: 'file:///etc/passwd' })
    expect(out).toContain('Error')
  })

  it('fetch_url returns status and truncated body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('hello world', { status: 200 })))
    const out = await byName('fetch_url').execute({ url: 'https://example.com' })
    expect(out).toContain('HTTP 200')
    expect(out).toContain('hello world')
  })
})
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npm test`
Expected: FAIL — cannot resolve `./builtin`.

- [ ] **Step 3: Implement `src/tools/builtin.ts`**:

```ts
import type { ToolDef } from '../types'

const getTime: ToolDef = {
  name: 'get_time',
  description: 'Get the current date and time, including timezone.',
  parameters: { type: 'object', properties: {} },
  source: 'builtin',
  async execute() {
    return new Date().toString()
  },
}

const fetchUrl: ToolDef = {
  name: 'fetch_url',
  description:
    'Fetch a URL via HTTP GET and return the response body as text (truncated to 8000 chars). Only works for servers that allow cross-origin requests (CORS).',
  parameters: {
    type: 'object',
    properties: { url: { type: 'string', description: 'Absolute http(s) URL to fetch' } },
    required: ['url'],
  },
  source: 'builtin',
  async execute(args) {
    const url = String(args.url ?? '')
    if (!/^https?:\/\//.test(url)) return 'Error: url must start with http:// or https://'
    try {
      const res = await fetch(url)
      const text = await res.text()
      return `HTTP ${res.status}\n${text.slice(0, 8000)}`
    } catch (e) {
      return `Error fetching url (possibly blocked by CORS): ${String(e)}`
    }
  },
}

const runJavascript: ToolDef = {
  name: 'run_javascript',
  description:
    'Run JavaScript in a sandboxed Web Worker. The code is the body of an async function; use `return` to produce a result. No DOM access. 5 second timeout.',
  parameters: {
    type: 'object',
    properties: { code: { type: 'string', description: 'JavaScript source (async function body)' } },
    required: ['code'],
  },
  source: 'builtin',
  async execute(args) {
    const code = String(args.code ?? '')
    const workerSrc = `self.onmessage = async (e) => {
      try {
        const fn = new Function('"use strict"; return (async () => { ' + e.data + ' })()');
        const result = await fn();
        self.postMessage({ ok: true, result: String(result) });
      } catch (err) {
        self.postMessage({ ok: false, result: String(err) });
      }
    };`
    const blob = new Blob([workerSrc], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)
    const worker = new Worker(url)
    try {
      return await new Promise<string>((resolve) => {
        const timer = setTimeout(() => resolve('Error: timed out after 5s'), 5000)
        worker.onmessage = (e: MessageEvent<{ ok: boolean; result: string }>) => {
          clearTimeout(timer)
          resolve(e.data.ok ? `Result: ${e.data.result}` : `Error: ${e.data.result}`)
        }
        worker.onerror = (e) => {
          clearTimeout(timer)
          resolve(`Error: ${e.message}`)
        }
        worker.postMessage(code)
      })
    } finally {
      worker.terminate()
      URL.revokeObjectURL(url)
    }
  },
}

export const builtinTools: ToolDef[] = [getTime, fetchUrl, runJavascript]
```

(`run_javascript` is not unit-tested because Node's vitest environment has no `Worker`; it is exercised in the browser.)

- [ ] **Step 4: Verify and commit**

Run: `npm run lint && npm test && npm run build`
Expected: PASS.

```bash
git add src/tools/
git commit -m "feat: built-in tools — get_time, fetch_url, run_javascript sandbox"
git push origin main
```

---

### Task 6: Agent loop (TDD)

**Files:**
- Create: `src/agent/loop.ts`
- Test: `src/agent/loop.test.ts`

- [ ] **Step 1: Write failing tests** — create `src/agent/loop.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { runAgent } from './loop'
import type { AgentEvent, ChatMessage, ChatResult, Provider, ToolDef } from '../types'

function fakeProvider(native: boolean, responses: ChatResult[]): Provider {
  let i = 0
  return {
    supportsNativeTools: native,
    async chat() {
      const r = responses[Math.min(i, responses.length - 1)]
      i += 1
      return r
    },
  }
}

const echoTool: ToolDef = {
  name: 'echo',
  description: 'Echoes input',
  parameters: { type: 'object', properties: { text: { type: 'string' } } },
  source: 'builtin',
  execute: async (args) => `echo:${String(args.text)}`,
}

describe('runAgent (native tools)', () => {
  it('executes tool calls then returns final answer', async () => {
    const provider = fakeProvider(true, [
      { content: '', toolCalls: [{ id: 'c1', name: 'echo', arguments: { text: 'hi' } }] },
      { content: 'final answer', toolCalls: [] },
    ])
    const events: AgentEvent[] = []
    const history: ChatMessage[] = [{ role: 'user', content: 'do it' }]
    const messages = await runAgent(history, provider, [echoTool], 'be helpful', (e) => events.push(e))
    const toolMsg = messages.find((m) => m.role === 'tool')
    expect(toolMsg?.content).toBe('echo:hi')
    expect(toolMsg?.toolCallId).toBe('c1')
    expect(messages[messages.length - 1]).toMatchObject({ role: 'assistant', content: 'final answer' })
    expect(events.some((e) => e.type === 'tool_result' && e.result === 'echo:hi')).toBe(true)
  })

  it('reports unknown tools as errors and continues', async () => {
    const provider = fakeProvider(true, [
      { content: '', toolCalls: [{ id: 'c1', name: 'nope', arguments: {} }] },
      { content: 'done', toolCalls: [] },
    ])
    const events: AgentEvent[] = []
    const messages = await runAgent(
      [{ role: 'user', content: 'x' }], provider, [echoTool], '', (e) => events.push(e),
    )
    const toolMsg = messages.find((m) => m.role === 'tool')
    expect(toolMsg?.content).toContain('unknown tool')
    expect(events.some((e) => e.type === 'tool_result' && e.isError)).toBe(true)
  })
})

describe('runAgent (prompt-based tools for local models)', () => {
  it('parses json tool call, feeds result back as user message', async () => {
    const provider = fakeProvider(false, [
      { content: '```json\n{"tool": "echo", "arguments": {"text": "yo"}}\n```', toolCalls: [] },
      { content: 'all done', toolCalls: [] },
    ])
    const messages = await runAgent(
      [{ role: 'user', content: 'x' }], provider, [echoTool], '', () => {},
    )
    const fed = messages.find((m) => m.role === 'user' && m.content.includes('echo:yo'))
    expect(fed).toBeDefined()
    expect(messages[messages.length - 1].content).toBe('all done')
  })

  it('plain text answer ends the loop immediately', async () => {
    const provider = fakeProvider(false, [{ content: 'just an answer', toolCalls: [] }])
    const messages = await runAgent(
      [{ role: 'user', content: 'x' }], provider, [echoTool], '', () => {},
    )
    expect(messages).toHaveLength(2)
  })
})

describe('runAgent (limits and errors)', () => {
  it('stops after 10 iterations', async () => {
    const provider = fakeProvider(true, [
      { content: '', toolCalls: [{ id: 'c', name: 'echo', arguments: { text: 'x' } }] },
    ])
    const events: AgentEvent[] = []
    await runAgent([{ role: 'user', content: 'x' }], provider, [echoTool], '', (e) => events.push(e))
    expect(events.some((e) => e.type === 'error' && e.error.includes('10'))).toBe(true)
  })

  it('emits error event when provider throws', async () => {
    const provider: Provider = {
      supportsNativeTools: true,
      async chat() {
        throw new Error('boom')
      },
    }
    const events: AgentEvent[] = []
    await runAgent([{ role: 'user', content: 'x' }], provider, [], '', (e) => events.push(e))
    expect(events.some((e) => e.type === 'error' && e.error.includes('boom'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npm test`
Expected: FAIL — cannot resolve `./loop`.

- [ ] **Step 3: Implement `src/agent/loop.ts`**:

```ts
import type { AgentEvent, ChatMessage, Provider, ToolDef } from '../types'
import { buildToolSystemPrompt, parseToolCall } from './toolPrompt'

const MAX_ITERATIONS = 10

export async function runAgent(
  history: ChatMessage[],
  provider: Provider,
  tools: ToolDef[],
  systemPrompt: string,
  onEvent: (e: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<ChatMessage[]> {
  const messages: ChatMessage[] = [...history]
  const toolMap = new Map(tools.map((t) => [t.name, t]))
  let system = systemPrompt
  if (!provider.supportsNativeTools && tools.length > 0) {
    system = [systemPrompt, buildToolSystemPrompt(tools)].filter(Boolean).join('\n\n')
  }
  const withSystem = (): ChatMessage[] =>
    system ? [{ role: 'system', content: system }, ...messages] : [...messages]

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let result
    try {
      result = await provider.chat(
        withSystem(),
        provider.supportsNativeTools ? tools : [],
        (text) => onEvent({ type: 'assistant_delta', text }),
        signal,
      )
    } catch (e) {
      onEvent({ type: 'error', error: String(e) })
      return messages
    }

    let calls = result.toolCalls
    if (!provider.supportsNativeTools && tools.length > 0) {
      const parsed = parseToolCall(result.content)
      calls = parsed ? [parsed] : []
    }

    const assistant: ChatMessage = { role: 'assistant', content: result.content }
    if (calls.length > 0) assistant.toolCalls = calls
    messages.push(assistant)
    onEvent({ type: 'assistant_message', message: assistant })

    if (calls.length === 0) return messages

    for (const call of calls) {
      onEvent({ type: 'tool_start', call })
      const tool = toolMap.get(call.name)
      let output: string
      let isError = false
      if (!tool) {
        output = `Error: unknown tool "${call.name}"`
        isError = true
      } else {
        try {
          output = await tool.execute(call.arguments)
        } catch (e) {
          output = `Error: ${String(e)}`
          isError = true
        }
      }
      onEvent({ type: 'tool_result', call, result: output, isError })
      if (provider.supportsNativeTools) {
        messages.push({ role: 'tool', content: output, toolCallId: call.id })
      } else {
        messages.push({ role: 'user', content: `[Tool result for ${call.name}]\n${output}` })
      }
    }
  }
  onEvent({ type: 'error', error: `Stopped after ${MAX_ITERATIONS} tool iterations` })
  return messages
}
```

- [ ] **Step 4: Verify and commit**

Run: `npm run lint && npm test && npm run build`
Expected: all PASS.

```bash
git add src/agent/
git commit -m "feat: agent loop with native and prompt-based tool calling"
git push origin main
```

---

### Task 7: Skills system (TDD)

**Files:**
- Create: `src/skills/store.ts`
- Test: `src/skills/store.test.ts`

- [ ] **Step 1: Write failing tests** — create `src/skills/store.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteSkill, loadSkills, makeUseSkillTool, upsertSkill } from './store'
import type { Skill } from '../types'

const mem = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => {
    mem.set(k, v)
  },
  removeItem: (k: string) => {
    mem.delete(k)
  },
})

const skill: Skill = {
  id: 's1',
  name: 'haiku',
  description: 'Write haiku',
  instructions: 'Always answer in 5-7-5 haiku form.',
}

beforeEach(() => {
  mem.clear()
})

describe('skill store', () => {
  it('loads empty list initially', () => {
    expect(loadSkills()).toEqual([])
  })

  it('upserts and persists', () => {
    upsertSkill([], skill)
    expect(loadSkills()).toEqual([skill])
    const updated = { ...skill, description: 'changed' }
    upsertSkill(loadSkills(), updated)
    expect(loadSkills()).toEqual([updated])
  })

  it('deletes', () => {
    upsertSkill([], skill)
    deleteSkill(loadSkills(), 's1')
    expect(loadSkills()).toEqual([])
  })
})

describe('use_skill tool', () => {
  it('returns instructions for a known skill', async () => {
    const tool = makeUseSkillTool(() => [skill])
    expect(tool.description).toContain('haiku')
    const out = await tool.execute({ name: 'haiku' })
    expect(out).toContain('5-7-5')
  })

  it('returns helpful error for unknown skill', async () => {
    const tool = makeUseSkillTool(() => [skill])
    const out = await tool.execute({ name: 'nope' })
    expect(out).toContain('no skill named')
    expect(out).toContain('haiku')
  })
})
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npm test`
Expected: FAIL — cannot resolve `./store`.

- [ ] **Step 3: Implement `src/skills/store.ts`**:

```ts
import type { Skill, ToolDef } from '../types'

const KEY = 'webgpu-agent.skills'

export function loadSkills(): Skill[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Skill[]) : []
  } catch {
    return []
  }
}

export function saveSkills(skills: Skill[]): void {
  localStorage.setItem(KEY, JSON.stringify(skills))
}

export function upsertSkill(skills: Skill[], skill: Skill): Skill[] {
  const next = skills.filter((s) => s.id !== skill.id)
  next.push(skill)
  saveSkills(next)
  return next
}

export function deleteSkill(skills: Skill[], id: string): Skill[] {
  const next = skills.filter((s) => s.id !== id)
  saveSkills(next)
  return next
}

export function makeUseSkillTool(getSkills: () => Skill[]): ToolDef {
  const catalog = getSkills()
  const listing = catalog.length
    ? catalog.map((s) => `${s.name} (${s.description})`).join('; ')
    : 'none yet'
  return {
    name: 'use_skill',
    description: `Load the full instructions of a user-defined skill by name, then follow them. Available skills: ${listing}`,
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Exact skill name' } },
      required: ['name'],
    },
    source: 'skill',
    async execute(args) {
      const name = String(args.name ?? '')
      const skills = getSkills()
      const skill = skills.find((s) => s.name === name)
      if (!skill) {
        const names = skills.map((s) => s.name).join(', ') || 'none'
        return `Error: no skill named "${name}". Available: ${names}`
      }
      return `# Skill: ${skill.name}\n\n${skill.instructions}`
    },
  }
}
```

- [ ] **Step 4: Verify and commit**

Run: `npm run lint && npm test && npm run build`
Expected: all PASS.

```bash
git add src/skills/
git commit -m "feat: localStorage skills with use_skill tool"
git push origin main
```

---

### Task 8: MCP client manager

**Files:**
- Create: `src/mcp/manager.ts`
- Test: `src/mcp/manager.test.ts`

- [ ] **Step 1: Implement `src/mcp/manager.ts`**:

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { McpServerConfig, ToolDef } from '../types'

export interface McpConnection {
  config: McpServerConfig
  client: Client
  tools: ToolDef[]
}

export function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_')
}

export async function connectMcpServer(config: McpServerConfig): Promise<McpConnection> {
  const client = new Client({ name: 'webgpu-agent', version: '0.1.0' })
  const transport = new StreamableHTTPClientTransport(new URL(config.url))
  await client.connect(transport)
  const { tools } = await client.listTools()
  const prefix = sanitizeName(config.name)
  const defs: ToolDef[] = tools.map((t) => ({
    name: `${prefix}__${t.name}`,
    description: t.description ?? '',
    parameters: (t.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
    source: 'mcp',
    async execute(args) {
      const result = await client.callTool({ name: t.name, arguments: args })
      const parts = Array.isArray(result.content) ? result.content : []
      const text = parts
        .map((p: { type?: string; text?: string }) => (p.type === 'text' ? (p.text ?? '') : `[${String(p.type)} content]`))
        .join('\n')
      return result.isError ? `Error: ${text}` : text || '(empty result)'
    },
  }))
  return { config, client, tools: defs }
}

export async function disconnectMcp(conn: McpConnection): Promise<void> {
  try {
    await conn.client.close()
  } catch {
    // already closed
  }
}

const KEY = 'webgpu-agent.mcpServers'

export function loadMcpServers(): McpServerConfig[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as McpServerConfig[]) : []
  } catch {
    return []
  }
}

export function saveMcpServers(servers: McpServerConfig[]): void {
  localStorage.setItem(KEY, JSON.stringify(servers))
}
```

If the SDK import paths fail to resolve, check the installed package: `ls node_modules/@modelcontextprotocol/sdk/dist/esm/client/` and adjust the import specifiers to the documented browser/ESM paths shown in `node_modules/@modelcontextprotocol/sdk/README.md`. Do not switch to a different MCP library.

- [ ] **Step 2: Test the pure parts** — create `src/mcp/manager.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadMcpServers, sanitizeName, saveMcpServers } from './manager'

const mem = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => {
    mem.set(k, v)
  },
  removeItem: (k: string) => {
    mem.delete(k)
  },
})

beforeEach(() => {
  mem.clear()
})

describe('sanitizeName', () => {
  it('replaces unsafe characters', () => {
    expect(sanitizeName('My Server #1!')).toBe('My_Server__1_')
    expect(sanitizeName('ok-name_2')).toBe('ok-name_2')
  })
})

describe('mcp server persistence', () => {
  it('round-trips configs', () => {
    expect(loadMcpServers()).toEqual([])
    const cfg = [{ id: 'a', name: 'srv', url: 'https://mcp.example.com/mcp' }]
    saveMcpServers(cfg)
    expect(loadMcpServers()).toEqual(cfg)
  })
})
```

- [ ] **Step 3: Verify and commit**

Run: `npm run lint && npm test && npm run build`
Expected: all PASS.

```bash
git add src/mcp/
git commit -m "feat: MCP client manager over Streamable HTTP"
git push origin main
```

---

### Task 9: Chat UI — wire the agent into React

**Files:**
- Create: `src/ui/usePersistedState.ts`
- Create: `src/ui/MessageList.tsx`
- Create: `src/ui/Composer.tsx`
- Create: `src/ui/ModelPicker.tsx`
- Modify: `src/App.tsx` (full replacement)
- Modify: `src/index.css` (append styles)

- [ ] **Step 1: Create `src/ui/usePersistedState.ts`**:

```ts
import { useEffect, useState } from 'react'

export function usePersistedState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value))
  }, [key, value])
  return [value, setValue]
}
```

- [ ] **Step 2: Create `src/ui/MessageList.tsx`** (renders display items incl. tool calls):

```tsx
export type DisplayItem =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string; streaming?: boolean }
  | { kind: 'tool'; name: string; args: string; result?: string; isError?: boolean }
  | { kind: 'error'; text: string }

export function MessageList({ items }: { items: DisplayItem[] }) {
  return (
    <div className="message-list">
      {items.map((item, i) => {
        if (item.kind === 'user') {
          return (
            <div key={i} className="msg msg-user">
              <div className="msg-role">you</div>
              <div className="msg-body">{item.text}</div>
            </div>
          )
        }
        if (item.kind === 'assistant') {
          return (
            <div key={i} className="msg msg-assistant">
              <div className="msg-role">agent{item.streaming ? ' …' : ''}</div>
              <div className="msg-body">{item.text}</div>
            </div>
          )
        }
        if (item.kind === 'tool') {
          return (
            <details key={i} className={`msg msg-tool${item.isError ? ' msg-tool-error' : ''}`} open={item.isError}>
              <summary>
                🔧 {item.name}({item.args}) {item.result === undefined ? '— running…' : item.isError ? '— error' : '— done'}
              </summary>
              {item.result !== undefined && <pre>{item.result}</pre>}
            </details>
          )
        }
        return (
          <div key={i} className="msg msg-error">
            ⚠️ {item.text}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Create `src/ui/Composer.tsx`**:

```tsx
import { useState } from 'react'

export function Composer({ busy, onSend, onStop }: {
  busy: boolean
  onSend: (text: string) => void
  onStop: () => void
}) {
  const [text, setText] = useState('')
  const submit = () => {
    const t = text.trim()
    if (!t || busy) return
    setText('')
    onSend(t)
  }
  return (
    <div className="composer">
      <textarea
        value={text}
        placeholder="Ask the agent… (Enter to send, Shift+Enter for newline)"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
        rows={3}
      />
      {busy ? (
        <button onClick={onStop}>Stop</button>
      ) : (
        <button onClick={submit} disabled={!text.trim()}>Send</button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create `src/ui/ModelPicker.tsx`** (provider mode + model selection + local load progress):

```tsx
import { API_PRESETS } from '../providers/api'
import { presetModels, webgpuAvailable } from '../providers/local'
import type { ApiConfig } from '../types'

export type ProviderMode = 'local' | 'api'

export function ModelPicker({ mode, setMode, localModel, setLocalModel, api, setApi, loadState, onLoadLocal, busy }: {
  mode: ProviderMode
  setMode: (m: ProviderMode) => void
  localModel: string
  setLocalModel: (m: string) => void
  api: ApiConfig
  setApi: (c: ApiConfig) => void
  loadState: { status: 'idle' | 'loading' | 'ready' | 'error'; text: string }
  onLoadLocal: () => void
  busy: boolean
}) {
  return (
    <div className="model-picker">
      <div className="row">
        <label>
          <input type="radio" checked={mode === 'local'} onChange={() => setMode('local')} disabled={busy} />
          Local (WebGPU)
        </label>
        <label>
          <input type="radio" checked={mode === 'api'} onChange={() => setMode('api')} disabled={busy} />
          External API
        </label>
      </div>
      {mode === 'local' && (
        <div className="col">
          {!webgpuAvailable() && (
            <p className="warn">WebGPU is not available in this browser — use an external API instead.</p>
          )}
          <div className="row">
            <select value={localModel} onChange={(e) => setLocalModel(e.target.value)} disabled={busy || loadState.status === 'loading'}>
              {presetModels().map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <button onClick={onLoadLocal} disabled={busy || loadState.status === 'loading' || !webgpuAvailable()}>
              {loadState.status === 'ready' ? 'Reload' : 'Load'}
            </button>
          </div>
          {loadState.text && <p className={loadState.status === 'error' ? 'warn' : 'dim'}>{loadState.text}</p>}
        </div>
      )}
      {mode === 'api' && (
        <div className="col">
          <div className="row">
            <select
              value={api.kind}
              onChange={(e) => {
                const kind = e.target.value as ApiConfig['kind']
                setApi({ ...api, kind, baseUrl: API_PRESETS[kind].baseUrl || api.baseUrl })
              }}
              disabled={busy}
            >
              {Object.entries(API_PRESETS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="model id, e.g. gpt-4o-mini or qwen/qwen3-coder"
              value={api.model}
              onChange={(e) => setApi({ ...api, model: e.target.value })}
              disabled={busy}
            />
          </div>
          <div className="row">
            <input
              type="text"
              placeholder="base URL"
              value={api.baseUrl}
              onChange={(e) => setApi({ ...api, baseUrl: e.target.value })}
              disabled={busy}
            />
            <input
              type="password"
              placeholder="API key (stored in localStorage)"
              value={api.apiKey}
              onChange={(e) => setApi({ ...api, apiKey: e.target.value })}
              disabled={busy}
            />
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Replace `src/App.tsx` entirely**:

```tsx
import { useRef, useState } from 'react'
import { runAgent } from './agent/loop'
import { ApiProvider } from './providers/api'
import { LocalProvider } from './providers/local'
import { builtinTools } from './tools/builtin'
import { loadSkills, makeUseSkillTool } from './skills/store'
import type { AgentEvent, ApiConfig, ChatMessage, Provider, ToolDef } from './types'
import { Composer } from './ui/Composer'
import { MessageList, type DisplayItem } from './ui/MessageList'
import { ModelPicker, type ProviderMode } from './ui/ModelPicker'
import { usePersistedState } from './ui/usePersistedState'

const localProvider = new LocalProvider()

export default function App() {
  const [mode, setMode] = usePersistedState<ProviderMode>('webgpu-agent.mode', 'local')
  const [localModel, setLocalModel] = usePersistedState('webgpu-agent.localModel', '')
  const [api, setApi] = usePersistedState<ApiConfig>('webgpu-agent.api', {
    kind: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: '',
    model: '',
  })
  const [systemPrompt, setSystemPrompt] = usePersistedState(
    'webgpu-agent.systemPrompt',
    'You are a helpful agent running entirely in the user browser. Use tools when they help.',
  )
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [display, setDisplay] = useState<DisplayItem[]>([])
  const [busy, setBusy] = useState(false)
  const [loadState, setLoadState] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; text: string }>({
    status: 'idle',
    text: '',
  })
  const [mcpTools, setMcpTools] = useState<ToolDef[]>([])
  const abortRef = useRef<AbortController | null>(null)

  const handleEvent = (e: AgentEvent) => {
    setDisplay((d) => {
      const next = [...d]
      if (e.type === 'assistant_delta') {
        const last = next[next.length - 1]
        if (last && last.kind === 'assistant' && last.streaming) {
          next[next.length - 1] = { ...last, text: last.text + e.text }
        } else {
          next.push({ kind: 'assistant', text: e.text, streaming: true })
        }
      } else if (e.type === 'assistant_message') {
        const last = next[next.length - 1]
        if (last && last.kind === 'assistant' && last.streaming) next.pop()
        if (e.message.content.trim()) next.push({ kind: 'assistant', text: e.message.content })
      } else if (e.type === 'tool_start') {
        next.push({ kind: 'tool', name: e.call.name, args: JSON.stringify(e.call.arguments) })
      } else if (e.type === 'tool_result') {
        for (let i = next.length - 1; i >= 0; i--) {
          const item = next[i]
          if (item.kind === 'tool' && item.result === undefined && item.name === e.call.name) {
            next[i] = { ...item, result: e.result, isError: e.isError }
            break
          }
        }
      } else if (e.type === 'error') {
        next.push({ kind: 'error', text: e.error })
      }
      return next
    })
  }

  const loadLocal = async () => {
    const model = localModel || ''
    if (!model) return
    setLoadState({ status: 'loading', text: 'Starting download…' })
    try {
      await localProvider.load(model, (text, progress) =>
        setLoadState({ status: 'loading', text: `${Math.round(progress * 100)}% — ${text}` }),
      )
      setLoadState({ status: 'ready', text: `Loaded ${model}` })
    } catch (e) {
      setLoadState({ status: 'error', text: String(e) })
    }
  }

  const send = async (text: string) => {
    if (busy) return
    setBusy(true)
    const history: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(history)
    setDisplay((d) => [...d, { kind: 'user', text }])
    let provider: Provider
    if (mode === 'local') {
      provider = localProvider
    } else {
      provider = new ApiProvider(api)
    }
    const tools: ToolDef[] = [...builtinTools, makeUseSkillTool(() => loadSkills()), ...mcpTools]
    const abort = new AbortController()
    abortRef.current = abort
    const final = await runAgent(history, provider, tools, systemPrompt, handleEvent, abort.signal)
    setMessages(final)
    setBusy(false)
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>WebGPU Agent</h1>
        <ModelPicker
          mode={mode}
          setMode={setMode}
          localModel={localModel || ''}
          setLocalModel={setLocalModel}
          api={api}
          setApi={setApi}
          loadState={loadState}
          onLoadLocal={loadLocal}
          busy={busy}
        />
        <label className="dim">System prompt</label>
        <textarea
          className="system-prompt"
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={4}
          disabled={busy}
        />
        <button
          onClick={() => {
            setMessages([])
            setDisplay([])
          }}
          disabled={busy}
        >
          New chat
        </button>
        {/* SkillsPanel and McpPanel mount here in a later task; setMcpTools is wired then */}
        <div style={{ display: 'none' }}>{mcpTools.length}{void setMcpTools}</div>
      </aside>
      <section className="chat">
        <MessageList items={display} />
        <Composer
          busy={busy}
          onSend={send}
          onStop={() => abortRef.current?.abort()}
        />
      </section>
    </div>
  )
}
```

(The hidden div referencing `setMcpTools` keeps lint happy until Task 10 wires the panels; Task 10 removes it.)

If `localModel` starts empty, initialize it on first render is not needed — the `<select>` shows the first preset but state may be `''`; guard in `loadLocal` already returns early. To avoid confusion, in `ModelPicker` the select's `value={localModel}` with empty string shows the first option visually; ALSO add in App right before `return`: 

```tsx
if (!localModel) {
  // default to first preset once
  setLocalModel(presetModels()[0] ?? '')
}
```

with the import `import { presetModels } from './providers/local'` merged into the existing `./providers/local` import line: `import { LocalProvider, presetModels } from './providers/local'`.

- [ ] **Step 6: Append to `src/index.css`**:

```css
.app { display: flex; height: 100vh; }
.sidebar { width: 320px; padding: 16px; background: var(--bg-alt); border-right: 1px solid var(--border); overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.sidebar h1 { font-size: 18px; margin: 0 0 8px; }
.chat { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.message-list { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.msg { max-width: 85%; border-radius: 8px; padding: 8px 12px; white-space: pre-wrap; word-break: break-word; }
.msg-user { align-self: flex-end; background: #24405e; }
.msg-assistant { align-self: flex-start; background: var(--bg-alt); border: 1px solid var(--border); }
.msg-role { font-size: 11px; color: var(--text-dim); margin-bottom: 4px; }
.msg-tool { align-self: flex-start; background: #1c2620; border: 1px solid var(--border); font-size: 13px; max-width: 85%; }
.msg-tool pre { overflow-x: auto; max-height: 240px; }
.msg-tool-error { background: #2c1d1d; }
.msg-error { align-self: center; color: var(--error); }
.composer { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--border); }
.composer textarea { flex: 1; resize: none; }
textarea, input, select, button { background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 8px; font: inherit; }
button { cursor: pointer; background: var(--accent); border: none; color: #fff; }
button:disabled { opacity: 0.5; cursor: default; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.col { display: flex; flex-direction: column; gap: 8px; }
.warn { color: var(--error); font-size: 13px; margin: 0; }
.dim { color: var(--text-dim); font-size: 12px; margin: 0; }
.model-picker select, .model-picker input { width: 100%; min-width: 0; }
.system-prompt { width: 100%; }
```

- [ ] **Step 7: Verify and commit**

Run: `npm run lint && npm test && npm run build`
Expected: all PASS. Do NOT run `npm run dev` — verification here is lint+test+build only.

```bash
git add src/
git commit -m "feat: chat UI — streaming messages, tool call view, model picker"
git push origin main
```

---

### Task 10: Skills panel + MCP panel

**Files:**
- Create: `src/ui/SkillsPanel.tsx`
- Create: `src/ui/McpPanel.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/ui/SkillsPanel.tsx`**:

```tsx
import { useState } from 'react'
import { deleteSkill, loadSkills, upsertSkill } from '../skills/store'
import type { Skill } from '../types'

export function SkillsPanel({ disabled }: { disabled: boolean }) {
  const [skills, setSkills] = useState<Skill[]>(() => loadSkills())
  const [editing, setEditing] = useState<Skill | null>(null)

  const blank = (): Skill => ({
    id: crypto.randomUUID(),
    name: '',
    description: '',
    instructions: '',
  })

  return (
    <details className="panel">
      <summary>Skills ({skills.length})</summary>
      {skills.map((s) => (
        <div key={s.id} className="row panel-item">
          <span title={s.description}>{s.name}</span>
          <button onClick={() => setEditing(s)} disabled={disabled}>edit</button>
          <button onClick={() => setSkills(deleteSkill(skills, s.id))} disabled={disabled}>✕</button>
        </div>
      ))}
      {editing ? (
        <div className="col">
          <input
            placeholder="name (used by the agent to call it)"
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          />
          <input
            placeholder="one-line description"
            value={editing.description}
            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
          />
          <textarea
            placeholder="instructions (markdown) the agent receives via use_skill"
            value={editing.instructions}
            onChange={(e) => setEditing({ ...editing, instructions: e.target.value })}
            rows={5}
          />
          <div className="row">
            <button
              disabled={!editing.name.trim() || !editing.instructions.trim()}
              onClick={() => {
                setSkills(upsertSkill(skills, editing))
                setEditing(null)
              }}
            >
              Save
            </button>
            <button onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setEditing(blank())} disabled={disabled}>+ Add skill</button>
      )}
    </details>
  )
}
```

- [ ] **Step 2: Create `src/ui/McpPanel.tsx`**:

```tsx
import { useEffect, useRef, useState } from 'react'
import {
  connectMcpServer,
  disconnectMcp,
  loadMcpServers,
  saveMcpServers,
  type McpConnection,
} from '../mcp/manager'
import type { McpServerConfig, ToolDef } from '../types'

export function McpPanel({ disabled, onToolsChange }: {
  disabled: boolean
  onToolsChange: (tools: ToolDef[]) => void
}) {
  const [servers, setServers] = useState<McpServerConfig[]>(() => loadMcpServers())
  const [status, setStatus] = useState<Record<string, string>>({})
  const connections = useRef<Map<string, McpConnection>>(new Map())
  const [draft, setDraft] = useState<{ name: string; url: string } | null>(null)

  const publishTools = () => {
    const all: ToolDef[] = []
    for (const conn of connections.current.values()) all.push(...conn.tools)
    onToolsChange(all)
  }

  const connect = async (cfg: McpServerConfig) => {
    setStatus((s) => ({ ...s, [cfg.id]: 'connecting…' }))
    try {
      const conn = await connectMcpServer(cfg)
      connections.current.set(cfg.id, conn)
      setStatus((s) => ({ ...s, [cfg.id]: `connected — ${conn.tools.length} tools` }))
      publishTools()
    } catch (e) {
      setStatus((s) => ({ ...s, [cfg.id]: `error: ${String(e)} (server must allow CORS)` }))
    }
  }

  const remove = async (id: string) => {
    const conn = connections.current.get(id)
    if (conn) {
      await disconnectMcp(conn)
      connections.current.delete(id)
      publishTools()
    }
    const next = servers.filter((s) => s.id !== id)
    setServers(next)
    saveMcpServers(next)
  }

  useEffect(() => {
    const conns = connections.current
    return () => {
      for (const conn of conns.values()) void disconnectMcp(conn)
    }
  }, [])

  return (
    <details className="panel">
      <summary>MCP servers ({servers.length})</summary>
      <p className="dim">Remote MCP servers over Streamable HTTP. The server must allow browser (CORS) access.</p>
      {servers.map((s) => (
        <div key={s.id} className="col panel-item">
          <div className="row">
            <span title={s.url}>{s.name}</span>
            <button onClick={() => void connect(s)} disabled={disabled}>connect</button>
            <button onClick={() => void remove(s.id)} disabled={disabled}>✕</button>
          </div>
          {status[s.id] && <span className="dim">{status[s.id]}</span>}
        </div>
      ))}
      {draft ? (
        <div className="col">
          <input
            placeholder="name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <input
            placeholder="https://example.com/mcp"
            value={draft.url}
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
          />
          <div className="row">
            <button
              disabled={!draft.name.trim() || !/^https?:\/\//.test(draft.url)}
              onClick={() => {
                const cfg: McpServerConfig = { id: crypto.randomUUID(), ...draft }
                const next = [...servers, cfg]
                setServers(next)
                saveMcpServers(next)
                setDraft(null)
              }}
            >
              Save
            </button>
            <button onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setDraft({ name: '', url: '' })} disabled={disabled}>+ Add server</button>
      )}
    </details>
  )
}
```

- [ ] **Step 3: Wire panels into `src/App.tsx`**

In `src/App.tsx`:
1. Add imports:
```tsx
import { SkillsPanel } from './ui/SkillsPanel'
import { McpPanel } from './ui/McpPanel'
```
2. Replace the placeholder lines
```tsx
        {/* SkillsPanel and McpPanel mount here in a later task; setMcpTools is wired then */}
        <div style={{ display: 'none' }}>{mcpTools.length}{void setMcpTools}</div>
```
with:
```tsx
        <SkillsPanel disabled={busy} />
        <McpPanel disabled={busy} onToolsChange={setMcpTools} />
```

- [ ] **Step 4: Append panel styles to `src/index.css`**:

```css
.panel { border: 1px solid var(--border); border-radius: 8px; padding: 8px; }
.panel summary { cursor: pointer; font-weight: 600; }
.panel-item { margin: 8px 0; justify-content: space-between; }
.panel-item span { overflow: hidden; text-overflow: ellipsis; }
.panel input, .panel textarea { width: 100%; }
```

- [ ] **Step 5: Verify and commit**

Run: `npm run lint && npm test && npm run build`
Expected: all PASS.

```bash
git add src/
git commit -m "feat: skills and MCP server management panels"
git push origin main
```

---

### Task 11: CI workflow + tagged release

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

- [ ] **Step 2: Create `.github/workflows/release.yml`**:

```yaml
name: Release
on:
  push:
    tags: ['v*']
permissions:
  contents: write
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - run: cd dist && zip -r ../webgpu-agent-dist.zip . && cd ..
      - uses: softprops/action-gh-release@v2
        with:
          files: webgpu-agent-dist.zip
          generate_release_notes: true
```

- [ ] **Step 3: Push and wait for green CI**

```bash
git add .github/workflows/
git commit -m "ci: add CI and tagged release workflows"
git push origin main
gh run list --limit 5
```

Poll with `gh run watch <run-id> --exit-status` until both "CI" and "Deploy to GitHub Pages" succeed for this commit. If a run fails, read `gh run view <run-id> --log-failed`, fix the issue, commit, push, and re-check. Do not proceed until green.

- [ ] **Step 4: Tag v0.1.0 and verify release**

```bash
git tag v0.1.0
git push origin v0.1.0
gh run list --workflow=Release --limit 1
gh run watch <run-id> --exit-status
gh release view v0.1.0
```

Expected: release `v0.1.0` exists and lists `webgpu-agent-dist.zip`. Also verify the live site again:

```bash
curl -s -o /dev/null -w "%{http_code}" https://hermes98761234.github.io/webgpu-agent/
```

Expected: `200`. Report the release URL and the live URL.

---

### Task 12: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Inspect the project** (`ls`, `cat package.json`, skim `src/`) so the README reflects reality.

- [ ] **Step 2: Write `README.md`** covering, in this order:

1. Title + one-liner: "🤖 AI agent that runs entirely in your browser" + badge-style links to the live demo `https://hermes98761234.github.io/webgpu-agent/`.
2. **Features**: local open-source models via WebGPU (WebLLM, weights cached in-browser, nothing leaves your machine); external OpenAI-compatible APIs (OpenAI, OpenRouter, custom base URL); agent tool loop (built-in tools: `get_time`, `fetch_url`, `run_javascript` sandbox); user-defined skills (localStorage, loaded via `use_skill`); remote MCP servers over Streamable HTTP.
3. **Browser requirements**: WebGPU-capable browser (Chrome/Edge 113+, recent Firefox/Safari) for local models; any modern browser for API mode. Note model download sizes (~1–3 GB, cached).
4. **Usage**: pick Local vs API; load a preset model OR enter API key + model id; chat; add skills; add MCP servers (must be CORS-enabled — note this limitation explicitly).
5. **Security notes**: API keys stored in browser localStorage only; `run_javascript` runs in a Web Worker sandbox; all requests originate from the user's browser.
6. **Development**: `npm install`, `npm run dev`, `npm test`, `npm run build`; project structure (one line per `src/` subdirectory: `providers/`, `agent/`, `tools/`, `skills/`, `mcp/`, `ui/`).
7. **Deployment**: pushed to `main` → GitHub Actions deploys to GitHub Pages automatically.
8. **Tech stack**: Vite, React, TypeScript, `@mlc-ai/web-llm`, `@modelcontextprotocol/sdk`, Vitest.

- [ ] **Step 3: Commit and push**

```bash
git add README.md
git commit -m "docs: add README"
git push origin main
gh run list --limit 2
```

Verify the final CI/deploy runs are green. Report the GitHub URL, live URL, and release URL.
