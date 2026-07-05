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
    let worker: Worker
    try {
      worker = new Worker(new URL('./luaWorker.ts', import.meta.url), { type: 'module' })
    } catch (e) {
      return `Error: ${String(e)}`
    }
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
