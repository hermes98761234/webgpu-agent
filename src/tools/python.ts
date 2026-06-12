import type { ToolDef } from '../types'

let donkeyReady: Promise<{ execute: (code: string) => Promise<void>; evaluate: (expr: string) => Promise<string> }> | null = null

async function initDonkey() {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error — CDN module has no type declarations
  const { donkey } = await import('https://pyscript.net/releases/2026.3.1/core.js')

  const terminal = document.createElement('div')
  terminal.id = 'pyscript-terminal-hidden'
  terminal.style.display = 'none'
  document.body.appendChild(terminal)

  const py = await donkey({
    type: 'py',
    persistent: true,
    terminal: '#pyscript-terminal-hidden',
  })

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
