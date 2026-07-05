import type { ToolDef } from '../types'
import { corsFetch } from './proxy'
import { runPython } from './python'
import { runLua } from './lua'

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
      const res = await corsFetch(url)
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

export const builtinTools: ToolDef[] = [getTime, fetchUrl, runJavascript, runPython, runLua]
