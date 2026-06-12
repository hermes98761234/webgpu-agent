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
  it('exposes get_time, fetch_url, run_javascript, run_python', () => {
    expect(builtinTools.map((t) => t.name).sort()).toEqual([
      'fetch_url', 'get_time', 'run_javascript', 'run_python',
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
