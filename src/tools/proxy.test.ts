import { describe, it, expect, vi, beforeEach } from 'vitest'
import { corsFetch, getCorsProxy } from './proxy'

describe('corsFetch', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('calls fetch directly when no proxy configured', async () => {
    const mockFetch = vi.fn(async () => new Response('ok'))
    vi.stubGlobal('fetch', mockFetch)
    await corsFetch('https://example.com/api')
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/api', undefined)
  })

  it('routes through proxy with {url} template', async () => {
    localStorage.setItem('webgpu-agent.corsProxy', 'https://proxy.example.com/?url={url}')
    const mockFetch = vi.fn(async () => new Response('ok'))
    vi.stubGlobal('fetch', mockFetch)
    await corsFetch('https://target.com/data')
    const expected = 'https://proxy.example.com/?url=' + encodeURIComponent('https://target.com/data')
    expect(mockFetch).toHaveBeenCalledWith(expected, undefined)
  })

  it('routes through proxy with prefix style', async () => {
    localStorage.setItem('webgpu-agent.corsProxy', 'https://proxy.example.com/proxy')
    const mockFetch = vi.fn(async () => new Response('ok'))
    vi.stubGlobal('fetch', mockFetch)
    await corsFetch('https://target.com/data')
    expect(mockFetch).toHaveBeenCalledWith('https://proxy.example.com/proxy/https://target.com/data', undefined)
  })

  it('forwards POST method and body', async () => {
    localStorage.setItem('webgpu-agent.corsProxy', 'https://proxy.example.com/?url={url}')
    const mockFetch = vi.fn(async () => new Response('ok'))
    vi.stubGlobal('fetch', mockFetch)
    await corsFetch('https://target.com/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'hello' }),
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const call = mockFetch.mock.calls[0] as unknown[]
    const init = call[1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"prompt":"hello"}')
  })

  it('forwards DELETE and PATCH methods', async () => {
    localStorage.setItem('webgpu-agent.corsProxy', 'https://proxy.example.com/?url={url}')
    const mockFetch = vi.fn(async () => new Response('ok'))
    vi.stubGlobal('fetch', mockFetch)
    await corsFetch('https://target.com/resource/1', { method: 'DELETE' })
    expect((mockFetch.mock.calls[0] as unknown[])[1] as RequestInit).toHaveProperty('method', 'DELETE')
    await corsFetch('https://target.com/resource/1', { method: 'PATCH' })
    expect((mockFetch.mock.calls[1] as unknown[])[1] as RequestInit).toHaveProperty('method', 'PATCH')
  })
})

describe('getCorsProxy', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns empty string when not set', () => {
    expect(getCorsProxy()).toBe('')
  })

  it('returns stored proxy URL', () => {
    localStorage.setItem('webgpu-agent.corsProxy', 'https://proxy.example.com/?url={url}')
    expect(getCorsProxy()).toBe('https://proxy.example.com/?url={url}')
  })
})
