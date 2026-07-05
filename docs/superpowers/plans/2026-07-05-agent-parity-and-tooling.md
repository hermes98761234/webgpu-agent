# Agent Parity & Tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the in-browser agent to desktop-agent parity: robust Python + new Lua/SQL executors, OpenCode-style prompt and tools (fs_edit, grep/glob, todo, typed subagents), checkpoints with file rollback + re-run/reply, and an HTML preview pane.

**Architecture:** Everything stays in-browser. New executors follow the existing one-file-per-runtime pattern in `src/tools/` with pure testable cores. Checkpoints are a copy-on-write journal that monkey-patches the shared `pfs` (lightning-fs promises) object so all tools and isomorphic-git are covered by one wrapper. Preview is a sandboxed `srcDoc` iframe fed by a pure asset-inliner.

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest 4 (jsdom), lightning-fs, isomorphic-git, PyScript/Pyodide, wasmoon (new), sql.js (new).

**Spec:** `docs/superpowers/specs/2026-07-05-agent-parity-and-tooling-design.md`

## Global Constraints

- Only new runtime dependencies allowed: `wasmoon`, `sql.js` (plus dev dep `@types/sql.js`). Nothing else.
- Tool `execute()` NEVER throws — every failure returns a string starting with `Error:`.
- All new heavy runtimes (wasmoon, sql.js, PyScript) load lazily on first tool call, never at startup.
- Tests use the existing pattern: `vi.mock('../fs/setup', async () => await import('../test/memfs'))` and `resetMemfs()` in `beforeEach`.
- Run a single test file: `npx vitest run src/path/file.test.ts`. Full suite: `npm test`. Lint: `npm run lint`. Build: `npm run build`.
- Commit after every task. Message style: `feat:`/`fix:`/`test:` prefixes (see git log).
- `ToolDef` interface (src/types.ts): `{ name, description, parameters (JSON Schema object), source: 'builtin', execute(args: Record<string, unknown>): Promise<string> }`.

## File Map

| File | Status | Responsibility |
|---|---|---|
| `src/tools/python.ts` | rewrite | PyScript runtime init + `execPython` core + `run_python` tool |
| `src/tools/luaExec.ts` | new | Pure `execLua(code)` core (wasmoon) |
| `src/tools/luaWorker.ts` | new | Worker shim around execLua |
| `src/tools/lua.ts` | new | `run_lua` ToolDef (worker + timeout) |
| `src/tools/sqlExec.ts` | new | Pure `execSql(query, bytes?)` core (sql.js) |
| `src/tools/sql.ts` | new | `run_sql` ToolDef (FS load/save) |
| `src/tools/builtin.ts` | modify | Register run_lua, run_sql |
| `src/agenthome.ts` | modify | New DEFAULT_SYSTEM_PROMPT, legacy migration, seed agents |
| `src/agent/context.ts` | modify | `buildToolOverviewSection`, tools param |
| `src/tools/fs.ts` | modify | Export `resolvePath`, add `fs_edit` |
| `src/tools/search.ts` | new | `grep`, `glob` tools + `globToRegex` |
| `src/tools/todo.ts` | new | `todo_write` tool factory |
| `src/ui/TodoPanel.tsx` | new | Checklist panel |
| `src/agents.ts` | new | Agent-type files (parse/load/seed) |
| `src/tools/multiagent.ts` | modify | `agent_type` param on spawn_agent |
| `src/checkpoints/journal.ts` | new | COW journal: install/begin/end/revert |
| `src/checkpoints/truncate.ts` | new | Pure message/display truncation for revert |
| `src/store/sessions.ts` | modify | SessionData gains todos + checkpoints |
| `src/ui/MessageList.tsx` | modify | user `cpId`, action buttons, selection quote, preview buttons |
| `src/ui/Composer.tsx` | modify | external `draft` prop |
| `src/preview/inline.ts` | new | Pure asset inliner + console-capture snippet |
| `src/ui/PreviewPane.tsx` | new | Preview pane component |
| `src/tools/preview.ts` | new | `preview` ToolDef factory |
| `src/App.tsx` | modify | wire everything: tools, journal, revert, draft, preview, todos |
| `src/types.ts` | modify | `TodoItem` |
| `src/test/memfs.ts` | modify | `stat` returns `{type}` for walk() |

---

## Phase 1 — Code execution

### Task 1: Python executor robustness (`run_python`)

The historical `JsNull` failure: `py.evaluate('__err')` returns Python `None` across the worker bridge, which polyscript cannot marshal without SharedArrayBuffer → opaque error on GitHub Pages. Fix: only ever pass strings across the bridge (`'__err or ""'`), add init failure/timeout handling, and reset the runtime after an execution timeout.

**Files:**
- Rewrite: `src/tools/python.ts`
- Test: `src/tools/python.test.ts` (new)

**Interfaces:**
- Consumes: `ToolDef` from `src/types.ts`.
- Produces: `export interface PyRuntime { execute(code: string): Promise<void>; evaluate(expr: string): Promise<string>; terminate(): void }`; `export async function execPython(code: string, runtime: PyRuntime, timeoutMs?: number): Promise<{ output: string; timedOut: boolean }>`; `export const runPython: ToolDef` (unchanged name, still exported for builtin.ts).

- [ ] **Step 1: Write the failing test**

Create `src/tools/python.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { execPython, type PyRuntime } from './python'

function fakeRuntime(overrides: Partial<PyRuntime> = {}): PyRuntime & { terminated: boolean } {
  const state = { stdout: '', err: '' }
  const rt = {
    terminated: false,
    async execute(code: string) {
      // simulate the wrapped exec: real behavior is tested in-browser
      if (code.includes('boom')) state.err = 'ValueError: boom'
      else state.stdout = 'hello\n'
    },
    async evaluate(expr: string) {
      if (expr === '__err or ""') return state.err
      if (expr === 'sys.stdout.getvalue()') return state.stdout
      return ''
    },
    terminate() {
      this.terminated = true
    },
    ...overrides,
  }
  return rt as PyRuntime & { terminated: boolean }
}

describe('execPython', () => {
  it('returns captured stdout on success', async () => {
    const { output, timedOut } = await execPython('print("hello")', fakeRuntime())
    expect(output).toBe('hello\n')
    expect(timedOut).toBe(false)
  })

  it('returns Error: for python exceptions', async () => {
    const { output } = await execPython('raise ValueError("boom")', fakeRuntime())
    expect(output).toBe('Error: ValueError: boom')
  })

  it('returns (no output) when stdout is empty', async () => {
    const rt = fakeRuntime({ execute: async () => {}, evaluate: async () => '' })
    const { output } = await execPython('x = 1', rt)
    expect(output).toBe('(no output)')
  })

  it('terminates the runtime and reports timedOut on timeout', async () => {
    const rt = fakeRuntime({ execute: () => new Promise<void>(() => {}) })
    const { output, timedOut } = await execPython('while True: pass', rt, 30)
    expect(timedOut).toBe(true)
    expect(rt.terminated).toBe(true)
    expect(output).toContain('timed out')
  })

  it('never throws — bridge errors come back as Error: strings', async () => {
    const rt = fakeRuntime({ execute: async () => { throw new Error('JsNull') } })
    const { output, timedOut } = await execPython('x', rt)
    expect(output).toContain('Error:')
    expect(timedOut).toBe(false)
  })

  it('passes only string-producing expressions to evaluate (JsNull regression guard)', async () => {
    const seen: string[] = []
    const rt = fakeRuntime()
    const origEval = rt.evaluate.bind(rt)
    rt.evaluate = async (expr: string) => {
      seen.push(expr)
      return origEval(expr)
    }
    await execPython('x = 1', rt)
    expect(seen).toContain('__err or ""')
    expect(seen).not.toContain('__err')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tools/python.test.ts`
Expected: FAIL — `execPython` is not exported from `./python`.

- [ ] **Step 3: Rewrite `src/tools/python.ts`**

Full new content:

```typescript
import type { ToolDef } from '../types'

export interface PyRuntime {
  execute(code: string): Promise<void>
  evaluate(expr: string): Promise<string>
  terminate(): void
}

let runtimeReady: Promise<PyRuntime> | null = null
const INIT_TIMEOUT_MS = 90_000
const EXEC_TIMEOUT_MS = 15_000

async function initRuntime(): Promise<PyRuntime> {
  // Load PyScript so it processes <script type="py"> tags. Note: we don't use
  // donkey() — it forces a `terminal` attribute, and the py-terminal plugin's
  // worker bootstrap needs SharedArrayBuffer (COOP/COEP headers) we don't have
  // on GitHub Pages. We create a plain worker script instead.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error — CDN module has no type declarations
  await import('https://pyscript.net/releases/2026.3.1/core.js')

  const bootstrap = [
    'from pyscript import sync',
    '__locals__ = {}',
    'def execute(code):',
    '\treturn exec(code, globals(), __locals__)',
    'def evaluate(code):',
    '\treturn eval(code, globals(), __locals__)',
    'sync.execute = execute',
    'sync.evaluate = evaluate',
  ].join('\n')

  const src = URL.createObjectURL(new Blob([bootstrap]))
  const script = document.createElement('script')
  script.type = 'py'
  script.src = src
  script.toggleAttribute('worker', true)

  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Python runtime did not start within ${INIT_TIMEOUT_MS / 1000}s`)),
      INIT_TIMEOUT_MS,
    )
    const fail = (msg: string) => {
      clearTimeout(timer)
      reject(new Error(msg))
    }
    script.addEventListener('py:done', () => { clearTimeout(timer); resolve() }, { once: true })
    script.addEventListener('error', () => fail('Failed to load Python runtime script'), { once: true })
    document.addEventListener('py:error', (e) => fail(`Python startup error: ${String((e as CustomEvent).detail ?? e)}`), { once: true })
  })
  document.body.appendChild(script)
  try {
    await ready
  } catch (e) {
    script.remove()
    URL.revokeObjectURL(src)
    throw e
  }

  URL.revokeObjectURL(src)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xworker = (script as any).xworker
  const { sync } = xworker
  script.remove()

  const py: PyRuntime = {
    execute: (code: string) => sync.execute(code) as Promise<void>,
    evaluate: (expr: string) => sync.evaluate(expr) as Promise<string>,
    terminate: () => xworker.terminate(),
  }

  await py.execute(`
import sys, io
class __Cap:
    def __init__(s): s.b = io.StringIO()
    def write(s, x): s.b.write(x)
    def flush(s): pass
    def getvalue(s): return s.b.getvalue()
    def clear(s): s.b = io.StringIO()
sys.stdout = __Cap()
  `)

  return py
}

function getRuntime(): Promise<PyRuntime> {
  if (!runtimeReady) {
    runtimeReady = initRuntime()
    // A failed init must not poison future calls.
    runtimeReady.catch(() => { runtimeReady = null })
  }
  return runtimeReady
}

/**
 * Run user code against a PyRuntime. Only string-valued expressions ever cross
 * the worker bridge: Python None cannot be marshalled without SharedArrayBuffer
 * (the historical "JsNull" failure on GitHub Pages), so __err is coerced with
 * `or ""` and stdout is already a str.
 */
export async function execPython(
  code: string,
  runtime: PyRuntime,
  timeoutMs = EXEC_TIMEOUT_MS,
): Promise<{ output: string; timedOut: boolean }> {
  const wrapped = `sys.stdout.clear()\n__err = None\ntry:\n    exec(${JSON.stringify(code)})\nexcept Exception as e:\n    __err = f"{type(e).__name__}: {e}"`
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), timeoutMs)
    })
    const raced = await Promise.race([runtime.execute(wrapped).then(() => 'ok' as const), timeout])
    if (raced === 'timeout') {
      runtime.terminate()
      return {
        output: `Error: execution timed out after ${Math.round(timeoutMs / 1000)}s (Python runtime was reset; variables are lost)`,
        timedOut: true,
      }
    }
    const err = await runtime.evaluate('__err or ""')
    if (err) return { output: `Error: ${err}`, timedOut: false }
    const out = await runtime.evaluate('sys.stdout.getvalue()')
    return { output: out || '(no output)', timedOut: false }
  } catch (e) {
    return { output: `Error: ${String(e)}`, timedOut: false }
  } finally {
    clearTimeout(timer)
  }
}

export const runPython: ToolDef = {
  name: 'run_python',
  description:
    'Run Python in a sandboxed PyScript worker (Pyodide). Use print() for output. Variables and imports persist between calls (unless a timeout resets the runtime). 15 second timeout.',
  parameters: {
    type: 'object',
    properties: { code: { type: 'string', description: 'Python source code' } },
    required: ['code'],
  },
  source: 'builtin',
  async execute(args) {
    const code = String(args.code ?? '')
    let runtime: PyRuntime
    try {
      runtime = await getRuntime()
    } catch (e) {
      return `Error: Python runtime failed to start: ${String(e)}`
    }
    const { output, timedOut } = await execPython(code, runtime)
    if (timedOut) runtimeReady = null
    return output
  },
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tools/python.test.ts` — Expected: PASS (6 tests).
Run: `npx vitest run src/tools/builtin.test.ts` — Expected: still PASS (runPython export shape unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/tools/python.ts src/tools/python.test.ts
git commit -m "fix: python executor — string-only bridge values, init error handling, timeout reset"
```

### Task 2: Lua execution (`run_lua`)

**Files:**
- Create: `src/tools/luaExec.ts`, `src/tools/luaWorker.ts`, `src/tools/lua.ts`
- Modify: `src/tools/builtin.ts` (register)
- Test: `src/tools/luaExec.test.ts` (new)

**Interfaces:**
- Consumes: `ToolDef` from `src/types.ts`.
- Produces: `export async function execLua(code: string, wasmUri?: string): Promise<string>` (luaExec.ts); `export const runLua: ToolDef` (lua.ts).

- [ ] **Step 1: Install dependency**

Run: `npm install wasmoon`
Expected: package.json dependencies gains `"wasmoon": "^1.x"`.

- [ ] **Step 2: Write the failing test**

Create `src/tools/luaExec.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { execLua } from './luaExec'

describe('execLua', () => {
  it('captures print output', async () => {
    expect(await execLua('print("hi") print(1 + 2)')).toBe('hi\n3')
  })

  it('prints the value of a return expression', async () => {
    expect(await execLua('return 6 * 7')).toBe('42')
  })

  it('returns Error: for syntax errors', async () => {
    expect(await execLua('this is not lua')).toMatch(/^Error:/)
  })

  it('returns Error: for runtime errors', async () => {
    expect(await execLua('error("boom")')).toMatch(/^Error:.*boom/)
  })

  it('returns (no output) for silent code', async () => {
    expect(await execLua('local x = 1')).toBe('(no output)')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/tools/luaExec.test.ts`
Expected: FAIL — cannot resolve `./luaExec`.

- [ ] **Step 4: Implement**

Create `src/tools/luaExec.ts` (pure core; wasmoon runs in Node so tests use the real engine):

```typescript
import { LuaFactory } from 'wasmoon'

/** Execute Lua 5.4 source; returns captured print output / final value, or an "Error: …" string. */
export async function execLua(code: string, wasmUri?: string): Promise<string> {
  const factory = wasmUri ? new LuaFactory(wasmUri) : new LuaFactory()
  const lua = await factory.createEngine()
  const out: string[] = []
  try {
    lua.global.set('print', (...args: unknown[]) => {
      out.push(args.map(String).join('\t'))
    })
    const result = await lua.doString(code)
    if (result !== undefined && result !== null) out.push(String(result))
    return out.join('\n') || '(no output)'
  } catch (e) {
    return `Error: ${String(e)}`
  } finally {
    lua.global.close()
  }
}
```

Create `src/tools/luaWorker.ts`:

```typescript
import wasmUri from 'wasmoon/dist/glue.wasm?url'
import { execLua } from './luaExec'

self.onmessage = async (e: MessageEvent<string>) => {
  self.postMessage(await execLua(e.data, wasmUri))
}
```

If `npm run build` later fails resolving `wasmoon/dist/glue.wasm`, check the actual wasm filename with `ls node_modules/wasmoon/dist/*.wasm` and use that path — the `?url` suffix stays.

Create `src/tools/lua.ts`:

```typescript
import type { ToolDef } from '../types'

export const runLua: ToolDef = {
  name: 'run_lua',
  description:
    'Run Lua 5.4 code in a sandboxed Web Worker (WASM). Use print() for output; the value of a final `return` expression is also printed. Fresh state per call. 15 second timeout.',
  parameters: {
    type: 'object',
    properties: { code: { type: 'string', description: 'Lua source code' } },
    required: ['code'],
  },
  source: 'builtin',
  async execute(args) {
    const code = String(args.code ?? '')
    const worker = new Worker(new URL('./luaWorker.ts', import.meta.url), { type: 'module' })
    try {
      return await new Promise<string>((resolve) => {
        const timer = setTimeout(() => resolve('Error: timed out after 15s'), 15_000)
        worker.onmessage = (e: MessageEvent<string>) => {
          clearTimeout(timer)
          resolve(e.data)
        }
        worker.onerror = (e) => {
          clearTimeout(timer)
          resolve(`Error: ${e.message}`)
        }
        worker.postMessage(code)
      })
    } finally {
      worker.terminate()
    }
  },
}
```

Register in `src/tools/builtin.ts` — add import and extend the exported array:

```typescript
import { runLua } from './lua'
```

Change line 82:

```typescript
export const builtinTools: ToolDef[] = [getTime, fetchUrl, runJavascript, runPython, runLua]
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/tools/luaExec.test.ts` — Expected: PASS (5 tests).
Run: `npm test` — Expected: PASS (builtin.test.ts may assert the tool list; if it asserts exact tool names, add `run_lua`).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/tools/luaExec.ts src/tools/luaWorker.ts src/tools/lua.ts src/tools/builtin.ts src/tools/luaExec.test.ts
git commit -m "feat: run_lua tool via wasmoon in a sandboxed worker"
```

### Task 3: SQL execution (`run_sql`)

**Files:**
- Create: `src/tools/sqlExec.ts`, `src/tools/sql.ts`
- Modify: `src/tools/builtin.ts` (register)
- Test: `src/tools/sqlExec.test.ts` (new)

**Interfaces:**
- Consumes: `pfs`, `ensureDir` from `src/fs/setup`; `resolvePath` from `src/tools/fs` — this task exports it (it is currently a private helper at fs.ts line 10).
- Produces: `export async function execSql(query: string, dbBytes?: Uint8Array, locateFile?: (f: string) => string): Promise<{ output: string; bytes: Uint8Array }>` (sqlExec.ts); `export const runSql: ToolDef` (sql.ts); `export function resolvePath(raw: unknown): string` from `src/tools/fs.ts`.

- [ ] **Step 1: Install dependency**

Run: `npm install sql.js && npm install -D @types/sql.js`

- [ ] **Step 2: Write the failing test**

Create `src/tools/sqlExec.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { execSql } from './sqlExec'

describe('execSql', () => {
  it('runs a query and formats rows as a text table', async () => {
    const { output } = await execSql("SELECT 1 AS a, 'x' AS b")
    expect(output).toContain('a | b')
    expect(output).toContain('1 | x')
  })

  it('supports multiple statements and persists across them in one call', async () => {
    const { output } = await execSql(
      'CREATE TABLE t(x INTEGER); INSERT INTO t VALUES (1),(2); SELECT SUM(x) AS s FROM t;',
    )
    expect(output).toContain('s')
    expect(output).toContain('3')
  })

  it('round-trips through exported bytes', async () => {
    const first = await execSql('CREATE TABLE t(x); INSERT INTO t VALUES (42);')
    const second = await execSql('SELECT x FROM t', first.bytes)
    expect(second.output).toContain('42')
  })

  it('throws on invalid SQL (tool layer converts to Error: string)', async () => {
    await expect(execSql('NOT SQL')).rejects.toThrow()
  })

  it('renders NULL and reports statements with no rows', async () => {
    const { output } = await execSql('SELECT NULL AS n')
    expect(output).toContain('NULL')
    const ddl = await execSql('CREATE TABLE q(x)')
    expect(ddl.output).toBe('OK (no rows returned)')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/tools/sqlExec.test.ts`
Expected: FAIL — cannot resolve `./sqlExec`.

- [ ] **Step 4: Implement**

Create `src/tools/sqlExec.ts` (no `?url` imports here — this file must be importable under Node/vitest):

```typescript
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'

let sqlReady: Promise<SqlJsStatic> | null = null

function getSqlJs(locateFile?: (f: string) => string): Promise<SqlJsStatic> {
  if (!sqlReady) sqlReady = initSqlJs(locateFile ? { locateFile } : undefined)
  return sqlReady
}

const MAX_ROWS = 200

/** Execute SQL against a fresh in-memory DB (optionally seeded from bytes); returns formatted rows + exported DB bytes. Throws on SQL errors. */
export async function execSql(
  query: string,
  dbBytes?: Uint8Array,
  locateFile?: (f: string) => string,
): Promise<{ output: string; bytes: Uint8Array }> {
  const SQL = await getSqlJs(locateFile)
  const db: Database = dbBytes ? new SQL.Database(dbBytes) : new SQL.Database()
  try {
    const results = db.exec(query)
    const parts: string[] = []
    for (const r of results) {
      const rows = r.values.slice(0, MAX_ROWS)
      parts.push(
        [
          r.columns.join(' | '),
          ...rows.map((row) => row.map((v) => (v === null ? 'NULL' : String(v))).join(' | ')),
        ].join('\n'),
      )
      if (r.values.length > MAX_ROWS) parts.push(`[truncated: ${r.values.length} rows total]`)
    }
    return { output: parts.join('\n\n') || 'OK (no rows returned)', bytes: db.export() }
  } finally {
    db.close()
  }
}
```

In `src/tools/fs.ts`, export the existing private helper (line 10): change `function resolvePath(raw: unknown): string {` to `export function resolvePath(raw: unknown): string {`.

Create `src/tools/sql.ts`:

```typescript
import type { ToolDef } from '../types'
import { execSql } from './sqlExec'
import { pfs, ensureDir } from '../fs/setup'
import { resolvePath } from './fs'

async function readDbBytes(path: string): Promise<Uint8Array | undefined> {
  try {
    const data = await pfs.readFile(path)
    return typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data as Uint8Array)
  } catch {
    return undefined
  }
}

export const runSql: ToolDef = {
  name: 'run_sql',
  description:
    'Run SQL against SQLite (WASM). With db_path, the database file is loaded from the virtual FS and saved back afterwards; without it, a temporary in-memory database is used. Multiple statements allowed. Returns rows as a text table (max 200 rows per statement).',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'SQL to execute (one or more statements)' },
      db_path: { type: 'string', description: 'Optional path to a SQLite database file in the virtual FS' },
    },
    required: ['query'],
  },
  source: 'builtin',
  async execute(args) {
    try {
      const wasmUrl = (await import('sql.js/dist/sql-wasm.wasm?url')).default
      const query = String(args.query ?? '')
      const dbPath = args.db_path ? resolvePath(args.db_path) : ''
      const bytes = dbPath ? await readDbBytes(dbPath) : undefined
      const res = await execSql(query, bytes, () => wasmUrl)
      if (dbPath) {
        const dir = dbPath.substring(0, dbPath.lastIndexOf('/')) || '/'
        await ensureDir(dir)
        await pfs.writeFile(dbPath, res.bytes)
        return `${res.output}\n\n[database saved to ${dbPath}]`
      }
      return res.output
    } catch (e) {
      return `Error: ${String(e)}`
    }
  },
}
```

If TypeScript complains about the `?url` import, add to `src/vite-env.d.ts` (or create it):

```typescript
declare module '*?url' {
  const url: string
  export default url
}
```

Register in `src/tools/builtin.ts`:

```typescript
import { runSql } from './sql'
export const builtinTools: ToolDef[] = [getTime, fetchUrl, runJavascript, runPython, runLua, runSql]
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/tools/sqlExec.test.ts` — Expected: PASS (5 tests).
Run: `npm test && npm run build` — Expected: PASS; build must resolve the `?url` wasm import.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/tools/sqlExec.ts src/tools/sql.ts src/tools/builtin.ts src/tools/fs.ts src/tools/sqlExec.test.ts src/vite-env.d.ts
git commit -m "feat: run_sql tool via sql.js with virtual-FS database persistence"
```

## Phase 2 — Agent parity

### Task 4: OpenCode-style system prompt + tool overview section

**Files:**
- Modify: `src/agenthome.ts` (new DEFAULT_SYSTEM_PROMPT, keep old as LEGACY_DEFAULT_PROMPT, migration in initAgentHome)
- Modify: `src/agent/context.ts` (buildToolOverviewSection + tools param)
- Modify: `src/App.tsx` (pass tools to buildAgentSystemPrompt)
- Test: extend `src/agent/context.test.ts`; extend `src/skills/defaults.test.ts` only if it asserts the old prompt text

**Interfaces:**
- Produces: `export const LEGACY_DEFAULT_PROMPT: string` and new `export const DEFAULT_SYSTEM_PROMPT: string` (agenthome.ts); `buildAgentSystemPrompt(base, skills, memoryIndex, memoryFiles?, tools?)` gains a 5th param `tools: ToolDef[] = []`; `export function buildToolOverviewSection(tools: ToolDef[]): string` (context.ts).

- [ ] **Step 1: Write the failing test**

Append to `src/agent/context.test.ts`:

```typescript
import { buildToolOverviewSection, buildAgentSystemPrompt } from './context'
import type { ToolDef } from '../types'

const mkTool = (name: string, description: string): ToolDef => ({
  name,
  description,
  parameters: { type: 'object', properties: {} },
  source: 'builtin',
  execute: async () => '',
})

describe('buildToolOverviewSection', () => {
  it('groups tools by category with one line each', () => {
    const s = buildToolOverviewSection([
      mkTool('fs_read', 'Read a file from the virtual filesystem.'),
      mkTool('grep', 'Search file contents with a regular expression. Returns matching lines.'),
      mkTool('run_python', 'Run Python in a sandboxed worker. Use print() for output.'),
      mkTool('mystery_tool', 'Does something.'),
    ])
    expect(s).toContain('# Tools')
    expect(s).toContain('**Files**')
    expect(s).toContain('- fs_read: Read a file from the virtual filesystem.')
    expect(s).toContain('**Search**')
    expect(s).toContain('**Code execution**')
    expect(s).toContain('**Other**')
    // only the first sentence of a description
    expect(s).toContain('- grep: Search file contents with a regular expression.')
    expect(s).not.toContain('Returns matching lines')
  })

  it('is empty for no tools and included in the system prompt', () => {
    expect(buildToolOverviewSection([])).toBe('')
    const withTools = buildAgentSystemPrompt('base', [], '', [], [mkTool('fs_read', 'Read.')])
    expect(withTools).toContain('# Tools')
    const without = buildAgentSystemPrompt('base', [], '', [])
    expect(without).not.toContain('# Tools')
  })
})
```

Match the existing import style at the top of context.test.ts (it already imports `describe/it/expect` from vitest — don't duplicate).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/agent/context.test.ts`
Expected: FAIL — `buildToolOverviewSection` not exported.

- [ ] **Step 3: Implement context.ts changes**

Add to `src/agent/context.ts`:

```typescript
const TOOL_GROUPS: Array<{ label: string; match: RegExp }> = [
  { label: 'Files', match: /^fs_/ },
  { label: 'Search', match: /^(grep|glob)$/ },
  { label: 'Git', match: /^git_/ },
  { label: 'Code execution', match: /^run_/ },
  { label: 'Web', match: /^(fetch_url|web_search|weather_lookup)$/ },
  { label: 'Agent', match: /^(spawn_agent|use_skill|todo_write|preview$|memory_|get_time)/ },
]

/** Compact capability overview: tool name + first sentence, grouped by category. */
export function buildToolOverviewSection(tools: ToolDef[]): string {
  if (tools.length === 0) return ''
  const grouped = new Map<string, string[]>()
  for (const t of tools) {
    const label = TOOL_GROUPS.find((g) => g.match.test(t.name))?.label ?? 'Other'
    const firstSentence = t.description.split(/(?<=\.)\s/)[0]
    if (!grouped.has(label)) grouped.set(label, [])
    grouped.get(label)!.push(`- ${t.name}: ${firstSentence}`)
  }
  const parts = ['# Tools']
  for (const [label, lines] of grouped) parts.push(`**${label}**\n${lines.join('\n')}`)
  return parts.join('\n\n')
}
```

Change `buildAgentSystemPrompt` (lines 60-74) to:

```typescript
export function buildAgentSystemPrompt(
  base: string,
  skills: Skill[],
  memoryIndex: string,
  memoryFiles: MemoryFile[] = [],
  tools: ToolDef[] = [],
): string {
  return [
    buildTimeSection(),
    base.trim(),
    buildToolOverviewSection(tools),
    buildSkillsSection(skills),
    buildMemorySection(memoryIndex, memoryFiles),
  ]
    .filter(Boolean)
    .join('\n\n')
}
```

In `src/App.tsx` `send()` (line ~382), pass the already-built tools:

```typescript
const effectiveSystem = buildAgentSystemPrompt(systemPrompt, getAllSkills(), memIdx, memFiles, tools)
```

- [ ] **Step 4: Rewrite the default prompt in `src/agenthome.ts`**

Rename the existing const (line 8) `DEFAULT_SYSTEM_PROMPT` → `LEGACY_DEFAULT_PROMPT` (keep its content byte-identical — it is the migration comparison key; keep it exported). Add the new default below it:

```typescript
export const DEFAULT_SYSTEM_PROMPT = `You are an autonomous coding agent running entirely in the user's browser.

# Environment
- Runtime: a browser tab; there is no server and no shell. All tools operate on a virtual file system persisted in IndexedDB.
- Home directory: /home/user. Your configuration lives in /home/user/.agent — agent.md (this prompt), skills/, agents/ (subagent types), memory/, plugins/, mcp.json.
- Code execution: run_javascript (Web Worker), run_python (Pyodide), run_lua (Lua 5.4), run_sql (SQLite). Network access only via fetch_url / web_search, subject to CORS.

# Working style
- Be concise and direct. No preamble, no restating the question, no filler.
- Act, don't ask: when a request is actionable, do it. Ask only when genuinely blocked on a decision only the user can make.
- Verify before claiming done: read files back, run the code, check the output. Never claim success without evidence.
- Never invent file contents or paths — read them first.

# Tool discipline
- Prefer fs_edit (exact string replacement) for changing existing files; use fs_write only for new files or full rewrites.
- Use grep and glob to locate code before reading whole files.
- For multi-step work, maintain a todo list with todo_write: write all steps up front, keep exactly one in_progress, update it as you finish each step.
- Delegate research or isolated subtasks with spawn_agent (agent_type "explorer" for read-only research, "coder" for implementation).
- Use the preview tool to show the user HTML pages you build.
- Skills (see # Skills) hold instructions for specialized tasks — load one with use_skill when it matches the request.
- Save durable facts about the user or project with memory_save; keep memories short and factual.

# Code style
- Match the existing style of any file you edit.
- Write the minimum code that solves the problem. No speculative abstractions, no unrequested features, no drive-by refactoring.
- Every changed line should trace directly to the user's request.`
```

Note: `run_lua`/`run_sql`/`fs_edit`/`grep`/`glob`/`todo_write`/`agents/`/`preview` are referenced here and land in Tasks 2–3 and 5–8, 13 — the prompt mentioning them slightly early is harmless (Tasks 2–3 already shipped; 5–8 follow immediately).

In `initAgentHome()` after the agent.md read (after line 157's catch block), add the migration:

```typescript
  // Users still on the old stock prompt get the new one; customized prompts are untouched.
  if (systemPrompt.trim() === LEGACY_DEFAULT_PROMPT.trim()) {
    systemPrompt = DEFAULT_SYSTEM_PROMPT
    await writeAgentMd(systemPrompt)
  }
```

Search the repo for other `DEFAULT_SYSTEM_PROMPT` references (`grep -rn DEFAULT_SYSTEM_PROMPT src/`) and confirm they should use the NEW prompt (they should — only the migration compare uses LEGACY).

- [ ] **Step 5: Run tests, fix prompt-text assertions**

Run: `npm test`
Expected: context.test.ts PASSES. If any existing test asserts old prompt text (e.g. agenthome tests checking "Think Before Coding"), update those assertions to match the new prompt or to use LEGACY_DEFAULT_PROMPT explicitly. Also add one migration test to the agenthome test file if one exists (initAgentHome with agent.md == legacy → agent.md becomes new default; agent.md == "my custom prompt" → untouched).

- [ ] **Step 6: Commit**

```bash
git add src/agenthome.ts src/agent/context.ts src/agent/context.test.ts src/App.tsx
git commit -m "feat: OpenCode-style default system prompt with tool overview section and legacy migration"
```

### Task 5: `fs_edit` tool

**Files:**
- Modify: `src/tools/fs.ts`
- Test: extend `src/tools/fs.test.ts`

**Interfaces:**
- Consumes: `resolvePath`, `isProtected`, `pfs` already in fs.ts.
- Produces: `fs_edit` tool in the exported `fsTools` array; params `{ path, old_string, new_string, replace_all? }`.

- [ ] **Step 1: Write the failing tests**

Append to `src/tools/fs.test.ts` (reuse its existing setup — it already mocks fs/setup with memfs; find the tool lookup helper it uses, typically `fsTools.find(t => t.name === ...)`):

```typescript
describe('fs_edit', () => {
  const edit = fsTools.find((t) => t.name === 'fs_edit')!

  it('replaces a unique exact string', async () => {
    files.set('/home/user/a.txt', 'hello world')
    const res = await edit.execute({ path: '/home/user/a.txt', old_string: 'world', new_string: 'there' })
    expect(res).toContain('Edited')
    expect(files.get('/home/user/a.txt')).toBe('hello there')
  })

  it('errors when old_string is missing from the file', async () => {
    files.set('/home/user/a.txt', 'hello')
    expect(await edit.execute({ path: '/home/user/a.txt', old_string: 'nope', new_string: 'x' })).toMatch(/^Error:.*not found/)
  })

  it('errors on ambiguous match without replace_all', async () => {
    files.set('/home/user/a.txt', 'aa aa')
    expect(await edit.execute({ path: '/home/user/a.txt', old_string: 'aa', new_string: 'b' })).toMatch(/^Error:.*2 times/)
  })

  it('replaces all occurrences with replace_all', async () => {
    files.set('/home/user/a.txt', 'aa aa')
    await edit.execute({ path: '/home/user/a.txt', old_string: 'aa', new_string: 'b', replace_all: true })
    expect(files.get('/home/user/a.txt')).toBe('b b')
  })

  it('errors on missing file and empty old_string', async () => {
    expect(await edit.execute({ path: '/home/user/none.txt', old_string: 'x', new_string: 'y' })).toMatch(/^Error:/)
    expect(await edit.execute({ path: '/home/user/a.txt', old_string: '', new_string: 'y' })).toMatch(/^Error:/)
  })
})
```

(`files` comes from `src/test/memfs.ts`, already imported in fs.test.ts.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tools/fs.test.ts` — Expected: FAIL — fs_edit not found (`edit` undefined).

- [ ] **Step 3: Implement fs_edit in `src/tools/fs.ts`**

Add above the `fsTools` export:

```typescript
const fsEdit: ToolDef = {
  name: 'fs_edit',
  description:
    'Replace an exact string in a file. old_string must match exactly (including whitespace) and be unique in the file unless replace_all is true. Prefer this over fs_write for modifying existing files.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute file path (~ and home-relative paths are resolved)' },
      old_string: { type: 'string', description: 'Exact text to replace' },
      new_string: { type: 'string', description: 'Replacement text' },
      replace_all: { type: 'boolean', description: 'Replace every occurrence (default false)' },
    },
    required: ['path', 'old_string', 'new_string'],
  },
  source: 'builtin',
  async execute(args) {
    try {
      const path = resolvePath(args.path)
      if (isProtected(path)) return `Error: writing to system path '${path}' is not allowed`
      const oldStr = String(args.old_string ?? '')
      if (!oldStr) return 'Error: old_string must not be empty'
      const newStr = String(args.new_string ?? '')
      let data: string
      try {
        data = String(await pfs.readFile(path, { encoding: 'utf8' }))
      } catch {
        return `Error: file not found: ${path}`
      }
      const count = data.split(oldStr).length - 1
      if (count === 0) return `Error: old_string not found in ${path}`
      if (count > 1 && !args.replace_all)
        return `Error: old_string occurs ${count} times in ${path}; provide a longer unique string or set replace_all`
      const updated = args.replace_all ? data.split(oldStr).join(newStr) : data.replace(oldStr, newStr)
      await pfs.writeFile(path, updated, 'utf8')
      return `Edited ${path} (${args.replace_all ? count : 1} replacement${args.replace_all && count > 1 ? 's' : ''})`
    } catch (e) {
      return `Error: ${String(e)}`
    }
  },
}
```

Extend the array (line ~237):

```typescript
export const fsTools: ToolDef[] = [fsRead, fsWrite, fsEdit, fsCreate, fsList, fsDelete, fsMkdir, fsMove]
```

Note: memfs `readFile` ignores the encoding argument and returns the stored string — that's fine for these tests.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tools/fs.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/fs.ts src/tools/fs.test.ts
git commit -m "feat: fs_edit tool — exact string replacement with uniqueness check"
```

### Task 6: `grep` + `glob` search tools

**Files:**
- Create: `src/tools/search.ts`
- Modify: `src/test/memfs.ts` (stat must expose `type`), `src/App.tsx` (register in buildTools)
- Test: `src/tools/search.test.ts` (new)

**Interfaces:**
- Consumes: `pfs`, `HOME` from `src/fs/setup`; `resolvePath` from `./fs` (exported in Task 3).
- Produces: `export function globToRegex(glob: string): RegExp`; `export const searchTools: ToolDef[]` containing `grep` and `glob`.

- [ ] **Step 1: Update memfs stat**

In `src/test/memfs.ts`, replace the `stat` method so directory detection works:

```typescript
  async stat(p: string): Promise<{ type: 'file' | 'dir' }> {
    p = norm(p)
    if (files.has(p)) return { type: 'file' }
    if (dirs.has(p)) return { type: 'dir' }
    throw new Error(`ENOENT: ${p}`)
  },
```

(lightning-fs `stat` also returns an object with a `type: 'file' | 'dir'` field, so production behavior matches.)

- [ ] **Step 2: Write the failing tests**

Create `src/tools/search.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../fs/setup', async () => await import('../test/memfs'))

import { files, dirs, resetMemfs } from '../test/memfs'
import { globToRegex, searchTools } from './search'

const grep = () => searchTools.find((t) => t.name === 'grep')!
const glob = () => searchTools.find((t) => t.name === 'glob')!

beforeEach(() => {
  resetMemfs()
  dirs.add('/home')
  dirs.add('/home/user')
  dirs.add('/home/user/src')
  files.set('/home/user/src/a.ts', 'const foo = 1\nconst bar = 2\n')
  files.set('/home/user/src/b.md', 'foo docs\n')
  files.set('/home/user/readme.txt', 'nothing here\n')
})

describe('globToRegex', () => {
  it('handles *, ** and ?', () => {
    expect(globToRegex('*.ts').test('a.ts')).toBe(true)
    expect(globToRegex('*.ts').test('src/a.ts')).toBe(false)
    expect(globToRegex('**/*.ts').test('src/deep/a.ts')).toBe(true)
    expect(globToRegex('a?.ts').test('ab.ts')).toBe(true)
    expect(globToRegex('a?.ts').test('abc.ts')).toBe(false)
    expect(globToRegex('*.ts').test('a.tsx')).toBe(false)
  })
})

describe('grep', () => {
  it('returns path:line: text matches', async () => {
    const res = await grep().execute({ pattern: 'foo' })
    expect(res).toContain('/home/user/src/a.ts:1: const foo = 1')
    expect(res).toContain('/home/user/src/b.md:1: foo docs')
  })

  it('filters with include glob', async () => {
    const res = await grep().execute({ pattern: 'foo', include: '*.ts' })
    expect(res).toContain('a.ts')
    expect(res).not.toContain('b.md')
  })

  it('scopes to path and reports no matches', async () => {
    expect(await grep().execute({ pattern: 'nothing', path: '/home/user/src' })).toBe('No matches')
    expect(await grep().execute({ pattern: 'zzz' })).toBe('No matches')
  })

  it('rejects invalid regex with an Error string', async () => {
    expect(await grep().execute({ pattern: '(' })).toMatch(/^Error:.*regex/)
  })
})

describe('glob tool', () => {
  it('finds files by pattern', async () => {
    const res = await glob().execute({ pattern: '**/*.ts' })
    expect(res).toContain('/home/user/src/a.ts')
    expect(res).not.toContain('b.md')
  })

  it('matches bare filename patterns anywhere', async () => {
    const res = await glob().execute({ pattern: '*.md' })
    expect(res).toContain('/home/user/src/b.md')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/tools/search.test.ts` — Expected: FAIL — cannot resolve `./search`.

- [ ] **Step 4: Implement `src/tools/search.ts`**

```typescript
import type { ToolDef } from '../types'
import { pfs, HOME } from '../fs/setup'
import { resolvePath } from './fs'

export function globToRegex(glob: string): RegExp {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*'
        i++
        if (glob[i + 1] === '/') i++
      } else {
        re += '[^/]*'
      }
    } else if (c === '?') {
      re += '[^/]'
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`^${re}$`)
}

const MAX_MATCHES = 100
const MAX_FILES = 2000

async function walk(dir: string, out: string[], depth = 0): Promise<void> {
  if (depth > 20 || out.length >= MAX_FILES) return
  let entries: string[]
  try {
    entries = await pfs.readdir(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (name === '.git') continue
    const full = dir === '/' ? `/${name}` : `${dir}/${name}`
    try {
      const st = (await pfs.stat(full)) as { type?: string }
      if (st.type === 'dir') await walk(full, out, depth + 1)
      else out.push(full)
    } catch {
      // vanished between readdir and stat — skip
    }
  }
}

/** Match either the full path or the basename, so "*.ts" works anywhere. */
function matches(re: RegExp, path: string): boolean {
  return re.test(path) || re.test(path.replace(/^\//, '')) || re.test(path.split('/').pop() ?? '')
}

const grepTool: ToolDef = {
  name: 'grep',
  description:
    'Search file contents with a regular expression. Returns matching lines as path:line: text (max 100 matches). Searches under path (default: home directory); include filters files with a glob like "*.ts" or "src/**/*.md".',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'JavaScript regular expression' },
      path: { type: 'string', description: 'Directory to search (default /home/user)' },
      include: { type: 'string', description: 'Glob filter on file paths' },
    },
    required: ['pattern'],
  },
  source: 'builtin',
  async execute(args) {
    try {
      let re: RegExp
      try {
        re = new RegExp(String(args.pattern ?? ''))
      } catch (e) {
        return `Error: invalid regex: ${String(e)}`
      }
      const root = args.path ? resolvePath(args.path) : HOME
      const inc = args.include ? globToRegex(String(args.include)) : null
      const paths: string[] = []
      await walk(root, paths)
      const out: string[] = []
      for (const f of paths) {
        if (inc && !matches(inc, f)) continue
        let data: string
        try {
          data = String(await pfs.readFile(f, { encoding: 'utf8' }))
        } catch {
          continue
        }
        if (data.includes('\u0000')) continue // binary
        const lines = data.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (re.test(lines[i])) {
            out.push(`${f}:${i + 1}: ${lines[i].slice(0, 200)}`)
            if (out.length >= MAX_MATCHES) return out.join('\n') + `\n[truncated at ${MAX_MATCHES} matches]`
          }
        }
      }
      return out.length ? out.join('\n') : 'No matches'
    } catch (e) {
      return `Error: ${String(e)}`
    }
  },
}

const globTool: ToolDef = {
  name: 'glob',
  description:
    'Find files by glob pattern (supports *, ** and ?), e.g. "**/*.ts" or "*.md". Searches under path (default: home directory). Returns matching file paths.',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern' },
      path: { type: 'string', description: 'Directory to search (default /home/user)' },
    },
    required: ['pattern'],
  },
  source: 'builtin',
  async execute(args) {
    try {
      const re = globToRegex(String(args.pattern ?? ''))
      const root = args.path ? resolvePath(args.path) : HOME
      const paths: string[] = []
      await walk(root, paths)
      const out = paths.filter((p) => matches(re, p)).slice(0, 200)
      return out.length ? out.join('\n') : 'No matches'
    } catch (e) {
      return `Error: ${String(e)}`
    }
  },
}

export const searchTools: ToolDef[] = [grepTool, globTool]
```

Register in `src/App.tsx` `buildTools()` (line ~342): add `import { searchTools } from './tools/search'` and insert `...searchTools,` after `...fsTools,`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/tools/search.test.ts` — Expected: PASS.
Run: `npm test` — Expected: PASS (memfs stat change must not break existing tests; fs.test.ts uses readFile/writeFile, unaffected).

- [ ] **Step 6: Commit**

```bash
git add src/tools/search.ts src/tools/search.test.ts src/test/memfs.ts src/App.tsx
git commit -m "feat: grep and glob tools for virtual-FS code search"
```

### Task 7: Todo list (`todo_write` + TodoPanel)

**Files:**
- Create: `src/tools/todo.ts`, `src/ui/TodoPanel.tsx`
- Modify: `src/types.ts` (TodoItem), `src/store/sessions.ts` (SessionData.todos), `src/App.tsx` (state, registration, render, persistence)
- Test: `src/tools/todo.test.ts` (new)

**Interfaces:**
- Produces: `export interface TodoItem { content: string; status: 'pending' | 'in_progress' | 'completed' }` (types.ts); `export function makeTodoTool(setTodos: (t: TodoItem[]) => void): ToolDef` (todo.ts); `export function TodoPanel({ todos }: { todos: TodoItem[] })` (TodoPanel.tsx); `SessionData` gains optional `todos?: TodoItem[]`.

- [ ] **Step 1: Write the failing test**

Create `src/tools/todo.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { makeTodoTool } from './todo'
import type { TodoItem } from '../types'

describe('todo_write', () => {
  it('replaces the list and reports the count', async () => {
    let current: TodoItem[] = []
    const tool = makeTodoTool((t) => { current = t })
    const res = await tool.execute({
      todos: [
        { content: 'step one', status: 'completed' },
        { content: 'step two', status: 'in_progress' },
      ],
    })
    expect(res).toBe('Todo list updated (2 items)')
    expect(current).toEqual([
      { content: 'step one', status: 'completed' },
      { content: 'step two', status: 'in_progress' },
    ])
  })

  it('sanitizes junk: bad statuses become pending, empty items dropped, non-array is empty', async () => {
    let current: TodoItem[] = []
    const tool = makeTodoTool((t) => { current = t })
    await tool.execute({ todos: [{ content: 'x', status: 'bogus' }, { content: '' }, 'nonsense'] })
    expect(current).toEqual([{ content: 'x', status: 'pending' }])
    await tool.execute({ todos: 'not an array' })
    expect(current).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tools/todo.test.ts` — Expected: FAIL — cannot resolve `./todo`.

- [ ] **Step 3: Implement**

Add to `src/types.ts`:

```typescript
export interface TodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}
```

Create `src/tools/todo.ts`:

```typescript
import type { TodoItem, ToolDef } from '../types'

const STATUSES = ['pending', 'in_progress', 'completed'] as const

export function makeTodoTool(setTodos: (todos: TodoItem[]) => void): ToolDef {
  return {
    name: 'todo_write',
    description:
      'Replace your visible task list. Use for multi-step work: write all steps up front, keep exactly one in_progress, and update the list as you complete each step.',
    parameters: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: 'The full task list (replaces the previous one)',
          items: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'Short task description' },
              status: { type: 'string', enum: [...STATUSES] },
            },
            required: ['content', 'status'],
          },
        },
      },
      required: ['todos'],
    },
    source: 'builtin',
    async execute(args) {
      const raw = Array.isArray(args.todos) ? args.todos : []
      const todos: TodoItem[] = raw
        .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null)
        .map((t) => ({
          content: String(t.content ?? '').trim(),
          status: (STATUSES as readonly string[]).includes(String(t.status))
            ? (String(t.status) as TodoItem['status'])
            : 'pending',
        }))
        .filter((t) => t.content)
      setTodos(todos)
      return `Todo list updated (${todos.length} items)`
    },
  }
}
```

Create `src/ui/TodoPanel.tsx`:

```tsx
import type { TodoItem } from '../types'

const ICONS: Record<TodoItem['status'], string> = { pending: '○', in_progress: '◐', completed: '●' }

export function TodoPanel({ todos }: { todos: TodoItem[] }) {
  if (todos.length === 0) return null
  const done = todos.filter((t) => t.status === 'completed').length
  return (
    <div className="todo-panel" style={{ fontSize: '0.85em', opacity: 0.9, padding: '4px 12px', borderTop: '1px solid var(--border, #333)' }}>
      <div style={{ fontWeight: 600 }}>Tasks {done}/{todos.length}</div>
      {todos.map((t, i) => (
        <div key={i} style={{ textDecoration: t.status === 'completed' ? 'line-through' : 'none', opacity: t.status === 'pending' ? 0.7 : 1 }}>
          {ICONS[t.status]} {t.content}
        </div>
      ))}
    </div>
  )
}
```

Wire in `src/App.tsx`:
1. `import { makeTodoTool } from './tools/todo'`, `import { TodoPanel } from './ui/TodoPanel'`, `import type { TodoItem } from './types'`.
2. State: `const [todos, setTodos] = useState<TodoItem[]>([])`.
3. In `buildTools()` add `makeTodoTool(setTodos),` before `spawnTool`.
4. Render `<TodoPanel todos={todos} />` directly above the `<Composer …/>` element in the chat view.
5. Persistence: in `saveCurrentSession`, include `todos` in the saved data: `await saveSession(meta, { messages: msgs, display: cleanDisplay, todos })`. In `loadSessionById`, `setTodos(data.todos ?? [])`. Wherever a new/cleared chat resets display (`grep -n "setDisplay(\[\])" src/App.tsx` — the /clear handler and new-chat handler), also call `setTodos([])`.

In `src/store/sessions.ts`, extend the interface:

```typescript
import type { TodoItem } from '../types'

export interface SessionData {
  messages: ChatMessage[]
  display: DisplayItem[]
  todos?: TodoItem[]
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tools/todo.test.ts` — Expected: PASS.
Run: `npm test && npm run lint` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/todo.ts src/tools/todo.test.ts src/ui/TodoPanel.tsx src/types.ts src/store/sessions.ts src/App.tsx
git commit -m "feat: agent todo list — todo_write tool with persistent TodoPanel"
```

### Task 8: Typed subagents (`spawn_agent` agent_type)

**Files:**
- Create: `src/agents.ts`
- Modify: `src/tools/multiagent.ts`, `src/agenthome.ts` (seed defaults), `src/App.tsx` (load + pass types)
- Test: `src/agents.test.ts` (new)

**Interfaces:**
- Consumes: `pfs`, `ensureDir`, `AGENT_DIR` from `src/fs/setup`.
- Produces: `export interface AgentType { name: string; description: string; prompt: string }`; `export const AGENTS_DIR: string`; `export function parseAgentMd(raw: string): AgentType | null`; `export async function loadAgentTypes(): Promise<AgentType[]>`; `export async function seedDefaultAgents(): Promise<void>` (all in agents.ts). `makeSpawnAgentTool` gains 4th param `getAgentTypes?: () => AgentType[]`.

- [ ] **Step 1: Write the failing test**

Create `src/agents.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./fs/setup', async () => await import('./test/memfs'))

import { files, resetMemfs } from './test/memfs'
import { AGENTS_DIR, loadAgentTypes, parseAgentMd, seedDefaultAgents } from './agents'

beforeEach(() => resetMemfs())

describe('parseAgentMd', () => {
  it('parses frontmatter and body', () => {
    const t = parseAgentMd('---\nname: explorer\ndescription: finds things\n---\n\nYou explore.\n')
    expect(t).toEqual({ name: 'explorer', description: 'finds things', prompt: 'You explore.' })
  })

  it('returns null without frontmatter or name', () => {
    expect(parseAgentMd('just text')).toBeNull()
    expect(parseAgentMd('---\ndescription: no name\n---\nbody')).toBeNull()
  })
})

describe('seed + load', () => {
  it('seeds explorer and coder, then loads them', async () => {
    await seedDefaultAgents()
    const types = await loadAgentTypes()
    expect(types.map((t) => t.name).sort()).toEqual(['coder', 'explorer'])
    expect(types.find((t) => t.name === 'explorer')!.prompt).toContain('read-only')
  })

  it('does not overwrite a customized agent file', async () => {
    files.set(`${AGENTS_DIR}/explorer.md`, '---\nname: explorer\ndescription: mine\n---\nCustom prompt')
    await seedDefaultAgents()
    const types = await loadAgentTypes()
    expect(types.find((t) => t.name === 'explorer')!.prompt).toBe('Custom prompt')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/agents.test.ts` — Expected: FAIL — cannot resolve `./agents`.

- [ ] **Step 3: Implement `src/agents.ts`**

```typescript
import { AGENT_DIR, ensureDir, pfs } from './fs/setup'

export const AGENTS_DIR = `${AGENT_DIR}/agents`

export interface AgentType {
  name: string
  description: string
  prompt: string
}

export function parseAgentMd(raw: string): AgentType | null {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return null
  const meta: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/)
    if (kv) meta[kv[1]] = kv[2].trim()
  }
  if (!meta.name) return null
  return { name: meta.name, description: meta.description ?? '', prompt: m[2].trim() }
}

export const DEFAULT_AGENT_TYPES: AgentType[] = [
  {
    name: 'explorer',
    description: 'read-only research: finds files and answers questions without modifying anything',
    prompt:
      'You are a read-only research subagent. Investigate the task using fs_read, fs_list, grep, glob, git_log and git_diff. Do not create, modify, or delete any files. Finish with a concise report of findings including exact file paths.',
  },
  {
    name: 'coder',
    description: 'implementation: makes precise code changes and verifies them',
    prompt:
      'You are an implementation subagent. Make the requested change with the minimum diff: locate code with grep/glob, read before editing, prefer fs_edit for existing files, and verify your work by re-reading files or running code. Finish with a summary of what changed and how you verified it.',
  },
]

export async function seedDefaultAgents(): Promise<void> {
  await ensureDir(AGENTS_DIR)
  for (const a of DEFAULT_AGENT_TYPES) {
    const path = `${AGENTS_DIR}/${a.name}.md`
    try {
      await pfs.stat(path)
    } catch {
      await pfs.writeFile(path, `---\nname: ${a.name}\ndescription: ${a.description}\n---\n\n${a.prompt}\n`, 'utf8')
    }
  }
}

export async function loadAgentTypes(): Promise<AgentType[]> {
  try {
    const entries = await pfs.readdir(AGENTS_DIR)
    const out: AgentType[] = []
    for (const f of entries) {
      if (!f.endsWith('.md')) continue
      try {
        const t = parseAgentMd(String(await pfs.readFile(`${AGENTS_DIR}/${f}`, { encoding: 'utf8' })))
        if (t) out.push(t)
      } catch {
        // unreadable file — skip
      }
    }
    return out
  } catch {
    return []
  }
}
```

- [ ] **Step 4: Extend `src/tools/multiagent.ts`**

Replace the factory with (whole file):

```typescript
import { runAgent } from '../agent/loop'
import type { AgentType } from '../agents'
import type { ToolDef, Provider } from '../types'

export function makeSpawnAgentTool(
  getProvider: () => Provider,
  getTools: () => ToolDef[],
  getSignal?: () => AbortSignal | undefined,
  getAgentTypes?: () => AgentType[],
): ToolDef {
  const types = getAgentTypes?.() ?? []
  const typeList = types.length
    ? ` Available agent_type values: ${types.map((t) => `"${t.name}" (${t.description})`).join('; ')}.`
    : ''
  return {
    name: 'spawn_agent',
    description:
      'Delegate a subtask to a fresh agent instance with all tools. Use this to parallelize work or isolate complex subtasks. Returns the sub-agent\'s final response.' + typeList,
    parameters: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Complete description of what the sub-agent should do' },
        agent_type: { type: 'string', description: 'Named agent type whose system prompt to use' },
        system_prompt: { type: 'string', description: 'Custom system prompt (overrides agent_type)' },
      },
      required: ['task'],
    },
    source: 'builtin',
    async execute(args) {
      const task = String(args.task)
      const type = types.find((t) => t.name === String(args.agent_type ?? ''))
      const systemPrompt = args.system_prompt ? String(args.system_prompt) : (type?.prompt ?? '')
      const allTools = getTools()
      const subTools = allTools.filter((t) => t.name !== 'spawn_agent')
      let finalContent = ''
      const messages = await runAgent(
        [{ role: 'user', content: task }],
        getProvider(),
        subTools,
        systemPrompt,
        (event) => {
          if (event.type === 'assistant_message') {
            finalContent = event.message.content
          }
        },
        // Inherit the parent agent's abort signal so Stop cancels sub-agents too.
        getSignal?.(),
      )
      if (!finalContent) {
        const last = [...messages].reverse().find((m) => m.role === 'assistant')
        finalContent = last?.content ?? 'No response'
      }
      return finalContent
    },
  }
}
```

Wire in `src/App.tsx`:
1. `import { loadAgentTypes, seedDefaultAgents, type AgentType } from './agents'`.
2. Ref: `const agentTypesRef = useRef<AgentType[]>([])`.
3. In the init effect that calls `initAgentHome()`, after it resolves: `await seedDefaultAgents(); agentTypesRef.current = await loadAgentTypes()`.
4. In `buildTools()` (line ~341): `const spawnTool = makeSpawnAgentTool(getProvider, getTools, () => abortRef.current?.signal, () => agentTypesRef.current)`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/agents.test.ts` — Expected: PASS.
Run: `npm test` — Expected: PASS (any existing multiagent test still passes — the first three params are unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/agents.ts src/agents.test.ts src/tools/multiagent.ts src/agenthome.ts src/App.tsx
git commit -m "feat: typed subagents — file-defined agent types with explorer/coder defaults"
```

---

## Phase 3 — Conversation control

### Task 9: Checkpoint journal core

Copy-on-write journal. Each user message begins a checkpoint; the first mutation of a path within the active checkpoint records the file's prior bytes (base64, so binary DBs survive JSON persistence) or `null` if it didn't exist. Reverting applies records newest-first down to the target checkpoint. Dropping old checkpoints needs no merging: records older than the revert target are never applied.

**Files:**
- Create: `src/checkpoints/journal.ts`, `src/checkpoints/truncate.ts`
- Test: `src/checkpoints/journal.test.ts`, `src/checkpoints/truncate.test.ts` (new)

**Interfaces:**
- Consumes: `pfs`, `ensureDir` from `src/fs/setup`; `ChatMessage` from `src/types`; `DisplayItem` from `src/ui/MessageList`.
- Produces (journal.ts): `export interface Checkpoint { id: string; files: Record<string, string | null> }` (value = base64 of prior bytes, null = didn't exist); `installJournal(): void`; `beginCheckpoint(id: string): void`; `endCheckpoint(): void`; `getJournal(): Checkpoint[]`; `setJournal(j: Checkpoint[]): void`; `revertTo(checkpointId: string): Promise<boolean>`; `countRevertFiles(checkpointId: string): number`.
- Produces (truncate.ts): `export function truncateForRevert(messages: ChatMessage[], display: DisplayItem[], dispIndex: number): { messages: ChatMessage[]; display: DisplayItem[] }`.

- [ ] **Step 1: Write the failing journal tests**

Create `src/checkpoints/journal.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../fs/setup', async () => await import('../test/memfs'))

import { files, resetMemfs, pfs } from '../test/memfs'
import {
  beginCheckpoint,
  countRevertFiles,
  endCheckpoint,
  getJournal,
  installJournal,
  revertTo,
  setJournal,
} from './journal'

beforeEach(() => {
  resetMemfs()
  setJournal([])
  installJournal() // idempotent
})

describe('checkpoint journal', () => {
  it('records prior content on first write and restores it on revert', async () => {
    files.set('/home/user/a.txt', 'v1')
    beginCheckpoint('cp1')
    await pfs.writeFile('/home/user/a.txt', 'v2')
    await pfs.writeFile('/home/user/a.txt', 'v3') // second write same turn: not re-recorded
    endCheckpoint()
    expect(await revertTo('cp1')).toBe(true)
    expect(files.get('/home/user/a.txt')).toBe('v1')
    expect(getJournal()).toHaveLength(0)
  })

  it('deletes files that were created during the checkpoint', async () => {
    beginCheckpoint('cp1')
    await pfs.writeFile('/home/user/new.txt', 'x')
    endCheckpoint()
    await revertTo('cp1')
    expect(files.has('/home/user/new.txt')).toBe(false)
  })

  it('restores files deleted via unlink', async () => {
    files.set('/home/user/gone.txt', 'precious')
    beginCheckpoint('cp1')
    await pfs.unlink('/home/user/gone.txt')
    endCheckpoint()
    await revertTo('cp1')
    expect(files.get('/home/user/gone.txt')).toBe('precious')
  })

  it('reverts across multiple checkpoints, newest first', async () => {
    files.set('/home/user/a.txt', 'v1')
    beginCheckpoint('cp1')
    await pfs.writeFile('/home/user/a.txt', 'v2')
    endCheckpoint()
    beginCheckpoint('cp2')
    await pfs.writeFile('/home/user/a.txt', 'v3')
    await pfs.writeFile('/home/user/b.txt', 'b')
    endCheckpoint()
    expect(countRevertFiles('cp1')).toBe(3) // a@cp1, a@cp2, b@cp2
    await revertTo('cp1')
    expect(files.get('/home/user/a.txt')).toBe('v1')
    expect(files.has('/home/user/b.txt')).toBe(false)
  })

  it('reverting to a newer checkpoint keeps older ones intact', async () => {
    files.set('/home/user/a.txt', 'v1')
    beginCheckpoint('cp1')
    await pfs.writeFile('/home/user/a.txt', 'v2')
    endCheckpoint()
    beginCheckpoint('cp2')
    await pfs.writeFile('/home/user/a.txt', 'v3')
    endCheckpoint()
    await revertTo('cp2')
    expect(files.get('/home/user/a.txt')).toBe('v2')
    expect(getJournal().map((c) => c.id)).toEqual(['cp1'])
  })

  it('does not record outside an active checkpoint and returns false for unknown ids', async () => {
    await pfs.writeFile('/home/user/x.txt', 'x')
    expect(getJournal()).toHaveLength(0)
    expect(await revertTo('nope')).toBe(false)
  })

  it('caps retention at 50 checkpoints', () => {
    for (let i = 0; i < 60; i++) beginCheckpoint(`cp${i}`)
    endCheckpoint()
    expect(getJournal()).toHaveLength(50)
    expect(getJournal()[0].id).toBe('cp10')
  })
})
```

- [ ] **Step 2: Write the failing truncate tests**

Create `src/checkpoints/truncate.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { truncateForRevert } from './truncate'
import type { ChatMessage } from '../types'
import type { DisplayItem } from '../ui/MessageList'

const u = (content: string): ChatMessage => ({ role: 'user', content })
const a = (content: string): ChatMessage => ({ role: 'assistant', content })
const du = (text: string): DisplayItem => ({ kind: 'user', text })
const da = (text: string): DisplayItem => ({ kind: 'assistant', text })

describe('truncateForRevert', () => {
  it('cuts messages at the user message matching the display index', () => {
    const messages = [u('one'), a('r1'), u('two'), a('r2')]
    const display = [du('one'), da('r1'), du('two'), da('r2')]
    const t = truncateForRevert(messages, display, 2)
    expect(t.display).toEqual([du('one'), da('r1')])
    expect(t.messages).toEqual([u('one'), a('r1')])
  })

  it('ignores prompt-embedded tool results that use role user', () => {
    const messages = [u('one'), { role: 'user' as const, content: '[Tool result for grep]\nhits' }, a('r1'), u('two')]
    const display = [du('one'), da('r1'), du('two')]
    const t = truncateForRevert(messages, display, 2)
    expect(t.messages).toHaveLength(3)
    expect(t.messages[2].content).toBe('r1')
  })

  it('empties messages when context trimming dropped the older user turns', () => {
    const messages = [u('two')] // "one" was trimmed away
    const display = [du('one'), da('r1'), du('two')]
    const t = truncateForRevert(messages, display, 0)
    expect(t.messages).toEqual([])
    expect(t.display).toEqual([])
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/checkpoints` — Expected: FAIL — modules don't exist.

- [ ] **Step 4: Implement `src/checkpoints/journal.ts`**

```typescript
import { ensureDir, pfs } from '../fs/setup'

/** files: path -> base64 of prior bytes, or null if the file didn't exist. */
export interface Checkpoint {
  id: string
  files: Record<string, string | null>
}

const MAX_CHECKPOINTS = 50

let journal: Checkpoint[] = []
let active: Checkpoint | null = null
let installed = false

export function getJournal(): Checkpoint[] {
  return journal
}

export function setJournal(j: Checkpoint[]): void {
  journal = j
  active = null
}

export function beginCheckpoint(id: string): void {
  active = { id, files: {} }
  journal.push(active)
  // Old records are only needed to revert to their own (dropped) checkpoint — no merge needed.
  if (journal.length > MAX_CHECKPOINTS) journal.splice(0, journal.length - MAX_CHECKPOINTS)
}

export function endCheckpoint(): void {
  active = null
}

function toB64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function readBytes(path: string): Promise<Uint8Array | null> {
  try {
    const data = await pfs.readFile(path)
    return typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data as Uint8Array)
  } catch {
    return null
  }
}

async function record(path: string): Promise<void> {
  if (!active || path in active.files) return
  const prev = await readBytes(path)
  active.files[path] = prev === null ? null : toB64(prev)
}

/** Monkey-patch the shared pfs so every tool AND isomorphic-git go through the journal. */
export function installJournal(): void {
  if (installed) return
  installed = true
  const origWrite = pfs.writeFile.bind(pfs)
  const origUnlink = pfs.unlink.bind(pfs)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyPfs = pfs as any
  anyPfs.writeFile = async (path: string, data: unknown, opts?: unknown) => {
    await record(path)
    return origWrite(path, data as never, opts as never)
  }
  anyPfs.unlink = async (path: string) => {
    await record(path)
    return origUnlink(path)
  }
  if (typeof anyPfs.rename === 'function') {
    const origRename = anyPfs.rename.bind(pfs)
    anyPfs.rename = async (from: string, to: string) => {
      await record(from)
      await record(to)
      return origRename(from, to)
    }
  }
}

/** Number of file records that a revert to checkpointId would apply (for the confirm dialog). */
export function countRevertFiles(checkpointId: string): number {
  const idx = journal.findIndex((c) => c.id === checkpointId)
  if (idx < 0) return 0
  return journal.slice(idx).reduce((n, c) => n + Object.keys(c.files).length, 0)
}

/** Restore FS state to the moment checkpointId began; drops it and everything newer. */
export async function revertTo(checkpointId: string): Promise<boolean> {
  const idx = journal.findIndex((c) => c.id === checkpointId)
  if (idx < 0) return false
  active = null // restores below must not be re-recorded
  for (let i = journal.length - 1; i >= idx; i--) {
    for (const [path, prev] of Object.entries(journal[i].files)) {
      if (prev === null) {
        try {
          await pfs.unlink(path)
        } catch {
          // already gone
        }
      } else {
        const dir = path.substring(0, path.lastIndexOf('/')) || '/'
        await ensureDir(dir)
        await pfs.writeFile(path, fromB64(prev))
      }
    }
  }
  journal = journal.slice(0, idx)
  return true
}
```

Note for the journal test "restores files deleted via unlink": memfs `writeFile` stores whatever it is given — a `Uint8Array` — while the test compares to the string `'precious'`. Make the test robust instead of changing memfs semantics: in journal.ts `revertTo`, write back a **string when the bytes decode as UTF-8 text**, bytes otherwise:

```typescript
        const bytes = fromB64(prev)
        let content: string | Uint8Array = bytes
        try {
          content = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
        } catch {
          // keep raw bytes (e.g. SQLite DB)
        }
        await pfs.writeFile(path, content)
```

Use this variant in the final implementation (replace the plain `writeFile(path, fromB64(prev))` line above).

- [ ] **Step 5: Implement `src/checkpoints/truncate.ts`**

```typescript
import type { ChatMessage } from '../types'
import type { DisplayItem } from '../ui/MessageList'

/**
 * Compute the truncated conversation for a revert to display index `dispIndex`
 * (a user item). Context trimming means message indexes shift over time, so we
 * map display→messages by counting real user turns from the end. Tool results
 * for non-native providers are role:'user' with a "[Tool result for " prefix —
 * those are not user turns.
 */
export function truncateForRevert(
  messages: ChatMessage[],
  display: DisplayItem[],
  dispIndex: number,
): { messages: ChatMessage[]; display: DisplayItem[] } {
  const removedUserTurns = display.slice(dispIndex).filter((d) => d.kind === 'user').length
  const newDisplay = display.slice(0, dispIndex)
  if (removedUserTurns === 0) return { messages, display: newDisplay }
  const realUserIdxs = messages
    .map((m, i) => (m.role === 'user' && !m.content.startsWith('[Tool result for ') ? i : -1))
    .filter((i) => i >= 0)
  const cut = realUserIdxs[realUserIdxs.length - removedUserTurns] ?? 0
  return { messages: messages.slice(0, cut), display: newDisplay }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/checkpoints` — Expected: PASS (10 tests across both files).

- [ ] **Step 7: Commit**

```bash
git add src/checkpoints
git commit -m "feat: copy-on-write checkpoint journal with revert and conversation truncation"
```

### Task 10: Wire checkpoints into App: begin/end, persist, revert, edit & re-run

**Files:**
- Modify: `src/ui/MessageList.tsx` (user DisplayItem gains `cpId`), `src/store/sessions.ts` (SessionData.checkpoints), `src/ui/Composer.tsx` (draft prop), `src/App.tsx` (wiring)
- Test: extend `src/ui/Composer.test.tsx`

**Interfaces:**
- Consumes: everything Task 9 produced; `generateSessionId` from `src/store/sessions` (reused as checkpoint id generator).
- Produces: `DisplayItem` user variant becomes `{ kind: 'user'; text: string; cpId?: string }`; `ComposerProps` gains `draft?: { text: string; nonce: number; mode: 'replace' | 'append' }`; App handlers `handleRevert(dispIndex: number, prefill: boolean)` passed to MessageList in Task 11.

- [ ] **Step 1: Data model changes**

`src/ui/MessageList.tsx` line 4 — extend the user variant:

```typescript
  | { kind: 'user'; text: string; cpId?: string }
```

`src/store/sessions.ts` — extend SessionData (todos was added in Task 7):

```typescript
import type { Checkpoint } from '../checkpoints/journal'

export interface SessionData {
  messages: ChatMessage[]
  display: DisplayItem[]
  todos?: TodoItem[]
  checkpoints?: Checkpoint[]
}
```

- [ ] **Step 2: Composer draft prop with failing test**

Append to `src/ui/Composer.test.tsx` (follow its existing render helpers/imports — it uses @testing-library/react):

```tsx
it('applies an external draft: replace mode overwrites, append mode appends', () => {
  const { rerender } = render(<Composer busy={false} onSend={() => {}} onStop={() => {}} draft={{ text: 'hello', nonce: 1, mode: 'replace' }} />)
  const ta = screen.getByPlaceholderText(/Ask the agent/) as HTMLTextAreaElement
  expect(ta.value).toBe('hello')
  rerender(<Composer busy={false} onSend={() => {}} onStop={() => {}} draft={{ text: '> quoted', nonce: 2, mode: 'append' }} />)
  expect(ta.value).toBe('hello\n> quoted')
})
```

Run: `npx vitest run src/ui/Composer.test.tsx` — Expected: FAIL (unknown prop / value empty).

Implement in `src/ui/Composer.tsx`:

```typescript
interface ComposerProps {
  busy: boolean
  onSend: (text: string) => void
  onStop: () => void
  onCommand?: (command: string, args: string) => void
  commands?: SlashCommand[]
  draft?: { text: string; nonce: number; mode: 'replace' | 'append' }
}
```

In the component body (after the `text` state declaration, line ~32), add:

```typescript
  useEffect(() => {
    if (!draft) return
    setText((t) => (draft.mode === 'append' && t ? `${t}\n${draft.text}` : draft.text))
    textareaRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.nonce])
```

(add `draft` to the destructured props and `useEffect` to the react import if missing).

Run: `npx vitest run src/ui/Composer.test.tsx` — Expected: PASS.

- [ ] **Step 3: App wiring**

In `src/App.tsx`:

1. Imports:

```typescript
import { beginCheckpoint, endCheckpoint, getJournal, setJournal, installJournal, revertTo, countRevertFiles } from './checkpoints/journal'
import { truncateForRevert } from './checkpoints/truncate'
```

2. Install once — in the same init effect that calls `initAgentHome()`, add `installJournal()` as the first line.

3. Draft state: `const [draft, setDraft] = useState<{ text: string; nonce: number; mode: 'replace' | 'append' } | undefined>()` and pass `draft={draft}` to `<Composer …>`.

4. In `send()` (line ~354): begin a checkpoint when the user message is appended, and tag the display item. After the `const rawHistory` line:

```typescript
    const cpId = generateSessionId()
    beginCheckpoint(cpId)
```

Change the display append (line 368) to:

```typescript
    setDisplay((d) => [...d, { kind: 'user', text, cpId }])
```

In the `finally` block (line ~387), add `endCheckpoint()` before `abortRef.current = null`.

5. Persist: in `saveCurrentSession` include `checkpoints: getJournal()` in the SessionData object. In `loadSessionById` add `setJournal(data.checkpoints ?? [])`. In new-chat/clear paths (same spots as `setTodos([])` from Task 7) add `setJournal([])`.

6. Revert handler:

```typescript
  const handleRevert = async (dispIndex: number, prefill: boolean) => {
    if (busy) return
    const item = display[dispIndex]
    if (item?.kind !== 'user') return
    const fileCount = item.cpId ? countRevertFiles(item.cpId) : 0
    const removed = display.length - dispIndex
    const what = `Revert ${removed} message(s)${fileCount ? ` and restore ${fileCount} file change(s)` : ''}?`
    if (!window.confirm(what)) return
    if (item.cpId) await revertTo(item.cpId)
    const t = truncateForRevert(messages, display, dispIndex)
    setMessages(t.messages)
    setDisplay(t.display)
    if (currentSessionId) await saveCurrentSession(t.messages, t.display, currentSessionId)
    if (prefill) setDraft({ text: item.text, nonce: Date.now(), mode: 'replace' })
  }
```

(Old sessions saved before this feature have user items without `cpId` — revert then only truncates the conversation, which is the best available behavior.)

- [ ] **Step 4: Verify**

Run: `npm test && npm run lint && npm run build` — Expected: all PASS.
Manual check (`npm run dev`): send a message that writes a file (e.g. "create /home/user/t.txt with fs_write"), confirm the file exists via `/ls`, then nothing visible breaks — the revert UI arrives in Task 11.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/ui/Composer.tsx src/ui/Composer.test.tsx src/ui/MessageList.tsx src/store/sessions.ts
git commit -m "feat: per-message checkpoints wired into chat flow with session persistence"
```

### Task 11: Message actions — revert, edit & re-run, reply, reply-to-selection

**Files:**
- Modify: `src/ui/MessageList.tsx`, `src/App.tsx`
- Test: extend `src/ui/MessageList.test.tsx`

**Interfaces:**
- Consumes: `handleRevert` from Task 10; `setDraft` from Task 10.
- Produces: `MessageListProps` gains `onRevert?: (dispIndex: number) => void; onEditRerun?: (dispIndex: number) => void; onQuote?: (text: string) => void`.

- [ ] **Step 1: Write the failing tests**

Append to `src/ui/MessageList.test.tsx` (reuse its existing render pattern):

```tsx
describe('message actions', () => {
  const items: DisplayItem[] = [
    { kind: 'user', text: 'hello', cpId: 'cp1' },
    { kind: 'assistant', text: 'world' },
  ]

  it('fires onRevert/onEditRerun with the display index of the user message', () => {
    const onRevert = vi.fn()
    const onEditRerun = vi.fn()
    render(<MessageList items={items} onRevert={onRevert} onEditRerun={onEditRerun} />)
    fireEvent.click(screen.getByTitle('Revert to before this message'))
    expect(onRevert).toHaveBeenCalledWith(0)
    fireEvent.click(screen.getByTitle('Edit & re-run'))
    expect(onEditRerun).toHaveBeenCalledWith(0)
  })

  it('fires onQuote with the message text', () => {
    const onQuote = vi.fn()
    render(<MessageList items={items} onQuote={onQuote} />)
    fireEvent.click(screen.getAllByTitle('Quote in reply')[1])
    expect(onQuote).toHaveBeenCalledWith('world')
  })

  it('renders no action buttons when handlers are absent', () => {
    render(<MessageList items={items} />)
    expect(screen.queryByTitle('Revert to before this message')).toBeNull()
  })
})
```

(If MessageList's props are currently a different shape — check the component signature first — extend rather than replace them.)

Run: `npx vitest run src/ui/MessageList.test.tsx` — Expected: FAIL.

- [ ] **Step 2: Implement action buttons in MessageList**

Add the three optional props to the MessageList props interface and thread them into the item-rendering map. In the **user** item branch, render inside the message div after the text:

```tsx
{(onRevert || onEditRerun || onQuote) && (
  <div className="msg-actions" style={{ display: 'flex', gap: 8, marginTop: 4, opacity: 0.6, fontSize: '0.8em' }}>
    {onRevert && <button title="Revert to before this message" onClick={() => onRevert(i)}>↩ revert</button>}
    {onEditRerun && <button title="Edit & re-run" onClick={() => onEditRerun(i)}>✎ re-run</button>}
    {onQuote && <button title="Quote in reply" onClick={() => onQuote(item.text)}>❝ quote</button>}
  </div>
)}
```

In the **assistant** item branch (line ~172), render after `<AssistantBody …/>`:

```tsx
{onQuote && !item.streaming && (
  <div className="msg-actions" style={{ display: 'flex', gap: 8, marginTop: 4, opacity: 0.6, fontSize: '0.8em' }}>
    <button title="Quote in reply" onClick={() => onQuote(item.text)}>❝ quote</button>
  </div>
)}
```

- [ ] **Step 3: Selection quote**

In the MessageList component, add state and a mouseup handler on the scrolling container element (the one wrapping all items):

```tsx
const [selQuote, setSelQuote] = useState<{ x: number; y: number; text: string } | null>(null)

const handleMouseUp = () => {
  if (!onQuote) return
  const sel = window.getSelection()
  const text = sel?.toString().trim() ?? ''
  if (!text || !sel || sel.rangeCount === 0) {
    setSelQuote(null)
    return
  }
  const rect = sel.getRangeAt(0).getBoundingClientRect()
  setSelQuote({ x: rect.left + rect.width / 2, y: rect.top - 8, text })
}
```

Attach `onMouseUp={handleMouseUp}` to the container and render the floating button as its last child:

```tsx
{selQuote && (
  <button
    style={{ position: 'fixed', left: selQuote.x, top: selQuote.y, transform: 'translate(-50%, -100%)', zIndex: 10 }}
    onMouseDown={(e) => {
      e.preventDefault()
      onQuote?.(selQuote.text)
      setSelQuote(null)
    }}
  >
    ❝ quote
  </button>
)}
```

(`onMouseDown` + `preventDefault` so the click doesn't clear the selection before we read it.)

- [ ] **Step 4: App wiring**

Pass to `<MessageList …>` in the chat view:

```tsx
onRevert={(i) => void handleRevert(i, false)}
onEditRerun={(i) => void handleRevert(i, true)}
onQuote={(text) => setDraft({ text: `> ${text.split('\n').join('\n> ')}\n`, nonce: Date.now(), mode: 'append' })}
```

- [ ] **Step 5: Verify**

Run: `npx vitest run src/ui/MessageList.test.tsx` then `npm test` — Expected: PASS.
Manual (`npm run dev`): send two messages where the agent writes files; click **↩ revert** on the second → confirm dialog shows file count, chat truncates, `/ls` shows the file state rolled back; **✎ re-run** puts the old text in the composer; select text in a reply → floating quote button → composer gets a `> …` block.

- [ ] **Step 6: Commit**

```bash
git add src/ui/MessageList.tsx src/ui/MessageList.test.tsx src/App.tsx
git commit -m "feat: message actions — revert, edit & re-run, quote message or selection"
```

---

## Phase 4 — Live preview

### Task 12: Asset inliner + PreviewPane component

**Files:**
- Create: `src/preview/inline.ts`, `src/ui/PreviewPane.tsx`
- Test: `src/preview/inline.test.ts` (new)

**Interfaces:**
- Consumes: `pfs` from `src/fs/setup` (only in PreviewPane, not in inline.ts — the inliner takes a read callback so it stays pure).
- Produces: `export async function inlineAssets(html: string, basePath: string, readFile: (path: string) => Promise<Uint8Array | null>): Promise<string>`; `export const CONSOLE_CAPTURE: string` (inline.ts); `export interface PreviewSource { title: string; html?: string; path?: string }`; `export function PreviewPane({ source, onClose }: { source: PreviewSource; onClose: () => void })` (PreviewPane.tsx).

- [ ] **Step 1: Write the failing tests**

Create `src/preview/inline.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { inlineAssets } from './inline'

const enc = (s: string) => new TextEncoder().encode(s)

function reader(map: Record<string, string>) {
  return async (path: string) => (path in map ? enc(map[path]) : null)
}

describe('inlineAssets', () => {
  it('inlines relative scripts and stylesheets', async () => {
    const html = '<html><head><link rel="stylesheet" href="style.css"></head><body><script src="app.js"></script></body></html>'
    const out = await inlineAssets(html, '/home/user/site/index.html', reader({
      '/home/user/site/style.css': 'body{color:red}',
      '/home/user/site/app.js': 'console.log(1)',
    }))
    expect(out).toContain('<style>\nbody{color:red}\n</style>')
    expect(out).toContain('<script>\nconsole.log(1)\n</script>')
    expect(out).not.toContain('src="app.js"')
  })

  it('resolves ../ and leaves absolute URLs alone', async () => {
    const html = '<script src="../lib/a.js"></script><script src="https://cdn.example.com/x.js"></script>'
    const out = await inlineAssets(html, '/home/user/site/page/index.html', reader({
      '/home/user/site/lib/a.js': 'A()',
    }))
    expect(out).toContain('A()')
    expect(out).toContain('https://cdn.example.com/x.js')
  })

  it('turns missing assets into console warnings', async () => {
    const out = await inlineAssets('<script src="gone.js"></script>', '/home/user/i.html', reader({}))
    expect(out).toContain('missing asset: gone.js')
  })

  it('inlines images as data URIs', async () => {
    const out = await inlineAssets('<img src="p.png" alt="">', '/home/user/i.html', reader({ '/home/user/p.png': 'PNGDATA' }))
    expect(out).toContain('src="data:image/png;base64,')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/preview/inline.test.ts` — Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/preview/inline.ts`**

```typescript
/** Injected first so console output and errors are forwarded to the parent frame. */
export const CONSOLE_CAPTURE = `<script>(function () {
  function send(level, args) {
    try {
      parent.postMessage({ __preview: true, level: level, text: args.map(function (a) {
        try { return typeof a === 'object' ? JSON.stringify(a) : String(a) } catch (e) { return String(a) }
      }).join(' ') }, '*')
    } catch (e) { /* ignore */ }
  }
  ;['log', 'warn', 'error', 'info'].forEach(function (l) {
    var orig = console[l]
    console[l] = function () { send(l, [].slice.call(arguments)); orig.apply(console, arguments) }
  })
  window.addEventListener('error', function (e) {
    send('error', [e.message + ' (' + (e.filename || '') + ':' + e.lineno + ')'])
  })
})()</script>`

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  ico: 'image/x-icon',
}

function toB64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

async function replaceAsync(
  s: string,
  re: RegExp,
  fn: (...m: string[]) => Promise<string>,
): Promise<string> {
  const jobs: Promise<string>[] = []
  s.replace(re, (...m) => {
    jobs.push(fn(...(m as string[])))
    return ''
  })
  const results = await Promise.all(jobs)
  let i = 0
  return s.replace(re, () => results[i++])
}

/** Inline relative <script src>, <link rel=stylesheet href> and <img src> references from the virtual FS. */
export async function inlineAssets(
  html: string,
  basePath: string,
  readFile: (path: string) => Promise<Uint8Array | null>,
): Promise<string> {
  const resolve = (rel: string): string | null => {
    if (/^(https?:|data:|\/\/|#)/.test(rel)) return null
    const base = rel.startsWith('/') ? [''] : basePath.split('/').slice(0, -1)
    for (const part of rel.split('/')) {
      if (part === '..') base.pop()
      else if (part !== '.' && part) base.push(part)
    }
    const full = base.join('/')
    return full.startsWith('/') ? full : `/${full}`
  }
  const missing = (src: string) =>
    `<script>console.warn(${JSON.stringify(`[preview] missing asset: ${src}`)})</script>`
  const text = (b: Uint8Array) => new TextDecoder().decode(b)

  let out = await replaceAsync(html, /<script\s[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, async (m, src) => {
    const p = resolve(src)
    if (!p) return m
    const content = await readFile(p)
    return content === null ? missing(src) : `<script>\n${text(content)}\n</script>`
  })

  out = await replaceAsync(out, /<link\s[^>]*href=["']([^"']+)["'][^>]*>/gi, async (m, href) => {
    if (!/rel=["']?stylesheet/i.test(m)) return m
    const p = resolve(href)
    if (!p) return m
    const content = await readFile(p)
    return content === null ? missing(href) : `<style>\n${text(content)}\n</style>`
  })

  out = await replaceAsync(out, /(<img\s[^>]*src=)["']([^"']+)["']/gi, async (m, prefix, src) => {
    const p = resolve(src)
    if (!p) return m
    const content = await readFile(p)
    if (content === null) return m
    const ext = p.split('.').pop()?.toLowerCase() ?? ''
    const mime = MIME[ext] ?? 'application/octet-stream'
    return `${prefix}"data:${mime};base64,${toB64(content)}"`
  })

  return out
}
```

- [ ] **Step 4: Implement `src/ui/PreviewPane.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { pfs } from '../fs/setup'
import { CONSOLE_CAPTURE, inlineAssets } from '../preview/inline'

export interface PreviewSource {
  title: string
  html?: string
  path?: string
}

async function readBytes(path: string): Promise<Uint8Array | null> {
  try {
    const data = await pfs.readFile(path)
    return typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data as Uint8Array)
  } catch {
    return null
  }
}

export function PreviewPane({ source, onClose }: { source: PreviewSource; onClose: () => void }) {
  const [doc, setDoc] = useState('')
  const [logs, setLogs] = useState<Array<{ level: string; text: string }>>([])
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let live = true
    void (async () => {
      let html = source.html ?? ''
      if (source.path) {
        const bytes = await readBytes(source.path)
        html = bytes
          ? await inlineAssets(new TextDecoder().decode(bytes), source.path, readBytes)
          : `<p style="color:red">File not found: ${source.path}</p>`
      }
      if (live) {
        setLogs([])
        setDoc(CONSOLE_CAPTURE + html)
      }
    })()
    return () => {
      live = false
    }
  }, [source, nonce])

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data && e.data.__preview) {
        setLogs((l) => [...l.slice(-99), { level: String(e.data.level), text: String(e.data.text) }])
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  return (
    <div className="preview-pane" style={{ display: 'flex', flexDirection: 'column', width: '45%', minWidth: 280, borderLeft: '1px solid var(--border, #444)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderBottom: '1px solid var(--border, #444)' }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.title}</span>
        <button title="Reload from files" onClick={() => setNonce((n) => n + 1)}>↻</button>
        <button title="Close preview" onClick={onClose}>✕</button>
      </div>
      <iframe sandbox="allow-scripts" srcDoc={doc} title="preview" style={{ flex: 1, border: 0, background: '#fff' }} />
      {logs.length > 0 && (
        <div style={{ maxHeight: 120, overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.75em', padding: 4, borderTop: '1px solid var(--border, #444)' }}>
          {logs.map((l, i) => (
            <div key={i} style={{ color: l.level === 'error' ? '#f66' : l.level === 'warn' ? '#fc6' : 'inherit' }}>{l.text}</div>
          ))}
        </div>
      )}
    </div>
  )
}
```

On narrow screens the 45% pane is unusable — add a media-query class if the project's CSS file has one; otherwise accept the fixed split for now with a `// ponytail: fixed 45% split, add mobile overlay if users ask` comment.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/preview/inline.test.ts` — Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/preview src/ui/PreviewPane.tsx
git commit -m "feat: preview pane with virtual-FS asset inlining and console capture"
```

### Task 13: Preview entry points — code-block button, `preview` tool, /preview command

**Files:**
- Create: `src/tools/preview.ts`
- Modify: `src/ui/MessageList.tsx` (Preview buttons on html blocks), `src/App.tsx` (state, layout, tool registration, /preview command)
- Test: extend `src/ui/MessageList.test.tsx`

**Interfaces:**
- Consumes: `PreviewSource` from `src/ui/PreviewPane`; `resolvePath` from `src/tools/fs`.
- Produces: `export function makePreviewTool(open: (src: PreviewSource) => void): ToolDef`; `MessageListProps` gains `onPreview?: (html: string) => void`.

- [ ] **Step 1: Write the failing test**

Append to `src/ui/MessageList.test.tsx`:

```tsx
describe('html preview buttons', () => {
  it('shows a Preview button per ```html block and fires onPreview with its content', () => {
    const onPreview = vi.fn()
    const items: DisplayItem[] = [
      { kind: 'assistant', text: 'Here:\n```html\n<h1>Hi</h1>\n```\nand\n```js\nx()\n```' },
    ]
    render(<MessageList items={items} onPreview={onPreview} />)
    const btns = screen.getAllByText('▶ Preview HTML')
    expect(btns).toHaveLength(1)
    fireEvent.click(btns[0])
    expect(onPreview).toHaveBeenCalledWith('<h1>Hi</h1>\n')
  })
})
```

Run: `npx vitest run src/ui/MessageList.test.tsx` — Expected: FAIL.

- [ ] **Step 2: Implement the code-block button**

In `src/ui/MessageList.tsx` add:

```typescript
function extractHtmlBlocks(text: string): string[] {
  const out: string[] = []
  const re = /```html\n([\s\S]*?)```/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) out.push(m[1])
  return out
}
```

Thread an `onPreview?: (html: string) => void` prop from MessageList into `AssistantBody` and render at its end (after the streaming dots):

```tsx
{onPreview && !streaming && extractHtmlBlocks(text).map((html, i) => (
  <button key={`pv${i}`} style={{ display: 'block', marginTop: 4 }} onClick={() => onPreview(html)}>
    ▶ Preview HTML
  </button>
))}
```

- [ ] **Step 3: Implement `src/tools/preview.ts`**

```typescript
import type { ToolDef } from '../types'
import type { PreviewSource } from '../ui/PreviewPane'
import { resolvePath } from './fs'

export function makePreviewTool(open: (src: PreviewSource) => void): ToolDef {
  return {
    name: 'preview',
    description:
      'Show an HTML page to the user in the app preview pane. Pass a virtual-FS path to an .html file (relative script/css/img references are inlined automatically) or raw HTML.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to an HTML file in the virtual FS' },
        html: { type: 'string', description: 'Raw HTML (used when no path is given)' },
      },
    },
    source: 'builtin',
    async execute(args) {
      if (args.path) {
        const p = resolvePath(args.path)
        open({ title: p, path: p })
        return `Preview opened: ${p}`
      }
      const html = String(args.html ?? '')
      if (!html) return 'Error: provide either path or html'
      open({ title: 'Preview', html })
      return 'Preview opened'
    },
  }
}
```

- [ ] **Step 4: App wiring**

In `src/App.tsx`:
1. `import { PreviewPane, type PreviewSource } from './ui/PreviewPane'` and `import { makePreviewTool } from './tools/preview'`.
2. State: `const [preview, setPreview] = useState<PreviewSource | null>(null)`.
3. Register in `buildTools()`: `makePreviewTool(setPreview),`.
4. Layout: wrap the chat view (the block rendering `<MessageList …/>`, `<TodoPanel …/>`, `<Composer …/>`) in a horizontal flex container and render the pane as a sibling:

```tsx
<div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
    {/* existing MessageList + TodoPanel + Composer */}
  </div>
  {preview && <PreviewPane source={preview} onClose={() => setPreview(null)} />}
</div>
```

5. MessageList prop: `onPreview={(html) => setPreview({ title: 'Preview', html })}`.
6. Slash command: in `handleCommand`, add a `preview` case that calls `setPreview({ title: args, path: resolvePath(args) })` when args is non-empty (import `resolvePath` from `./tools/fs`), and add `{ name: 'preview', description: 'Preview an HTML file from the virtual FS' }` to the commands array passed to Composer.

- [ ] **Step 5: Verify**

Run: `npm test && npm run lint && npm run build` — Expected: PASS.
Manual (`npm run dev`): ask the agent to "create /home/user/site/index.html with a linked app.js that logs to console, then preview it" → pane opens, page renders, console strip shows the log; a ```html code block in a reply shows the ▶ Preview HTML button; `/preview /home/user/site/index.html` opens it too; ↻ reflects file edits.

- [ ] **Step 6: Commit**

```bash
git add src/tools/preview.ts src/ui/MessageList.tsx src/ui/MessageList.test.tsx src/App.tsx
git commit -m "feat: preview entry points — html code blocks, preview tool, /preview command"
```

---

### Task 14: Final integration pass

**Files:**
- Modify: only what the checks below reveal.

- [ ] **Step 1: Full verification**

Run each and confirm clean output:

```bash
npm test        # all suites pass
npm run lint    # no errors
npm run build   # tsc + vite build succeed (wasm ?url imports resolve)
```

- [ ] **Step 2: Browser smoke test (`npm run dev`)**

1. `run_python`: `print(1+1)` → `2`; `1/0` → `Error: ZeroDivisionError: …`; `import time\ntime.sleep(60)` → timeout message, then `print("ok")` works again (runtime reset).
2. `run_lua`: `print("hi")` → `hi`. `run_sql`: `SELECT 1` → table; with `db_path: '/home/user/test.db'` creates the file.
3. New prompt visible in Settings (or `fs_read /home/user/.agent/agent.md`) — OpenCode-style text, not the legacy AGENT.md text.
4. Multi-step request → agent calls todo_write → TodoPanel shows progress.
5. spawn_agent with `agent_type: "explorer"` works.
6. Revert/re-run/quote per Task 11 manual checks; preview per Task 13 manual checks.
7. Production check for the Python fix: `npm run build && npm run preview`, open the preview URL (no COOP/COEP headers, like GitHub Pages) and repeat check 1.

- [ ] **Step 3: Fix anything found, then commit**

```bash
git add -A && git commit -m "chore: integration fixes for agent parity release"
```

Only commit if there were fixes; otherwise nothing to do.

## Deviations from spec (intentional)

- Checkpoint retention: old checkpoints are **dropped**, not merged — records older than a revert target are never applied, so merging is unnecessary.
- "Manual open from the files view" became the `/preview <path>` slash command (the app has no standalone file-browser panel to hang a button on).
- Checkpoints are keyed by a per-message `cpId` on the user DisplayItem instead of adding `id` to every ChatMessage — providers never see extra fields, and context trimming can't desync ids (truncation maps display→messages by counting user turns; see `truncateForRevert`).
- The spec's "buildToolSystemPrompt gains usage notes per tool" is satisfied by the tool descriptions themselves (every new tool's description states when and how to use it, e.g. "Prefer this over fs_write…"); buildToolSystemPrompt already embeds descriptions verbatim, so no separate change is needed there.

