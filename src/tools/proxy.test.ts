import { describe, it, expect, vi, beforeEach } from 'vitest'
import { corsFetch, getCorsProxy, setCorsProxy, getEffectiveProxy } from './proxy'

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

  it('throws helpful error when direct fetch fails due to CORS', async () => {
    const mockFetch = vi.fn(async () => { throw new TypeError('Failed to fetch') })
    vi.stubGlobal('fetch', mockFetch)
    await expect(corsFetch('https://blocked.com')).rejects.toThrow('CORS blocked')
  })

  it('returns successful response even without proxy', async () => {
    const mockFetch = vi.fn(async () => new Response('data', { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)
    const res = await corsFetch('https://cors-enabled.com/data')
    expect(res.ok).toBe(true)
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

describe('setCorsProxy', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('stores proxy URL', () => {
    setCorsProxy('https://proxy.example.com/?url={url}')
    expect(localStorage.getItem('webgpu-agent.corsProxy')).toBe('https://proxy.example.com/?url={url}')
  })

  it('overwrites existing proxy', () => {
    setCorsProxy('https://old.com/?url={url}')
    setCorsProxy('https://new.com/?url={url}')
    expect(getCorsProxy()).toBe('https://new.com/?url={url}')
  })
})

describe('getEffectiveProxy', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns default proxy when none configured', () => {
    expect(getEffectiveProxy()).toBe('https://corsproxy.io/?url={url}')
  })

  it('returns configured proxy over default', () => {
    localStorage.setItem('webgpu-agent.corsProxy', 'https://custom.com/proxy')
    expect(getEffectiveProxy()).toBe('https://custom.com/proxy')
  })
})
