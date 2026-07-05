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
