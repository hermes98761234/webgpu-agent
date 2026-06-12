import type { ToolDef } from '../types'

let donkeyReady: Promise<{ execute: (code: string) => Promise<void>; evaluate: (expr: string) => Promise<string> }> | null = null

async function initDonkey() {
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

  const done = new Promise<void>((resolve) => {
    script.addEventListener('py:done', () => resolve(), { once: true })
  })
  document.body.appendChild(script)
  await done

  URL.revokeObjectURL(src)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { sync } = (script as any).xworker
  script.remove()

  const py = {
    execute: (code: string) => sync.execute(code) as Promise<void>,
    evaluate: (expr: string) => sync.evaluate(expr) as Promise<string>,
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

async function getDonkey() {
  if (!donkeyReady) donkeyReady = initDonkey()
  return donkeyReady
}

export const runPython: ToolDef = {
  name: 'run_python',
  description:
    'Run Python in a sandboxed PyScript worker (Pyodide). Use print() for output. Variables and imports persist between calls. 15 second timeout.',
  parameters: {
    type: 'object',
    properties: { code: { type: 'string', description: 'Python source code' } },
    required: ['code'],
  },
  source: 'builtin',
  async execute(args) {
    const code = String(args.code ?? '')
    try {
      const py = await getDonkey()
      const wrappedCode = `sys.stdout.clear()\n__err = None\ntry:\n    exec(${JSON.stringify(code)})\nexcept Exception as e:\n    __err = f"{type(e).__name__}: {e}"`
      await py.execute(wrappedCode)
      const output = await py.evaluate('sys.stdout.getvalue()')
      const error = await py.evaluate('__err')
      if (error) return `Error: ${error}`
      return output || '(no output)'
    } catch (e) {
      return `Error: ${String(e)}`
    }
  },
}
