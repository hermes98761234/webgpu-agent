import { describe, it, expect, vi, beforeEach } from 'vitest'
import { corsFetch, getCorsProxy, setCorsProxy, getSupportedMethods, isMethodSupported } from './proxy'

describe('corsFetch', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('calls fetch directly when no proxy configured and succeeds', async () => {
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
    expect(mockFetch).toHaveBeenCalledWith('https://proxy.example.com/proxy/https%3A%2F%2Ftarget.com%2Fdata', undefined)
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

  it('tries fallback proxies when direct fetch fails', async () => {
    let callCount = 0
    const mockFetch = vi.fn(async () => {
      callCount++
      if (callCount === 1) throw new TypeError('Failed to fetch')
      return new Response('fallback-ok')
    })
    vi.stubGlobal('fetch', mockFetch)
    const res = await corsFetch('https://blocked.com')
    expect(res.ok).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('skips failed fallback proxies and continues', async () => {
    let callCount = 0
    const mockFetch = vi.fn(async () => {
      callCount++
      if (callCount <= 2) throw new TypeError('Failed to fetch')
      return new Response('third-works')
    })
    vi.stubGlobal('fetch', mockFetch)
    const res = await corsFetch('https://blocked.com')
    expect(res.ok).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('returns non-200 responses from fallback without throwing', async () => {
    let callCount = 0
    const mockFetch = vi.fn(async () => {
      callCount++
      if (callCount === 1) throw new TypeError('Failed to fetch')
      return new Response('ok from proxy', { status: 200 })
    })
    vi.stubGlobal('fetch', mockFetch)
    const res = await corsFetch('https://blocked.com')
    expect(res.status).toBe(200)
  })

  it('throws when all fallbacks fail', async () => {
    const mockFetch = vi.fn(async () => { throw new TypeError('Failed to fetch') })
    vi.stubGlobal('fetch', mockFetch)
    await expect(corsFetch('https://blocked.com')).rejects.toThrow('All fallback proxies failed')
  })

  it('tries fallback proxies on non-OK from direct fetch', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response('error', { status: 502 }))
      .mockResolvedValueOnce(new Response('fallback ok'))
    vi.stubGlobal('fetch', mockFetch)
    const res = await corsFetch('https://example.com')
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(await res.text()).toBe('fallback ok')
  })

  it('tries fallback proxies on 4xx from direct fetch', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }))
      .mockResolvedValueOnce(new Response('fallback ok'))
    vi.stubGlobal('fetch', mockFetch)
    const res = await corsFetch('https://example.com')
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(await res.text()).toBe('fallback ok')
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

describe('getSupportedMethods', () => {
  it('returns array of supported HTTP methods', () => {
    const methods = getSupportedMethods()
    expect(methods).toContain('GET')
    expect(methods).toContain('POST')
    expect(methods).toContain('PUT')
    expect(methods).toContain('DELETE')
    expect(methods).toContain('PATCH')
  })
})

describe('isMethodSupported', () => {
  it('returns true for supported methods', () => {
    expect(isMethodSupported('GET')).toBe(true)
    expect(isMethodSupported('POST')).toBe(true)
    expect(isMethodSupported('PUT')).toBe(true)
    expect(isMethodSupported('DELETE')).toBe(true)
    expect(isMethodSupported('PATCH')).toBe(true)
  })

  it('returns false for unsupported methods', () => {
    expect(isMethodSupported('OPTIONS')).toBe(false)
    expect(isMethodSupported('HEAD')).toBe(false)
  })

  it('is case insensitive', () => {
    expect(isMethodSupported('get')).toBe(true)
    expect(isMethodSupported('post')).toBe(true)
  })
})
