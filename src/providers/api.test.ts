import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiProvider, parseSseLines } from './api'

function sseResponse(lines: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder()
      for (const line of lines) controller.enqueue(enc.encode(line + '\n'))
      controller.close()
    },
  })
  return new Response(body, { status: 200 })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseSseLines', () => {
  it('extracts data payloads and keeps the partial tail', () => {
    const { events, rest } = parseSseLines('data: {"a":1}\n\ndata: [DONE]\ndata: {"b"')
    expect(events).toEqual(['{"a":1}'])
    expect(rest).toBe('data: {"b"')
  })
})

describe('ApiProvider', () => {
  const config = { kind: 'custom' as const, baseUrl: 'https://x.test/v1', apiKey: 'k', model: 'm' }

  it('streams content deltas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}',
      'data: {"choices":[{"delta":{"content":"lo"}}]}',
      'data: [DONE]',
    ])))
    const deltas: string[] = []
    const provider = new ApiProvider(config)
    const result = await provider.chat(
      [{ role: 'user', content: 'hi' }], [], (t) => deltas.push(t),
    )
    expect(result.content).toBe('Hello')
    expect(deltas).toEqual(['Hel', 'lo'])
    expect(result.toolCalls).toEqual([])
  })

  it('assembles streamed tool calls', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"get_time","arguments":""}}]}}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"tz\\":\\""}}]}}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"utc\\"}"}}]}}]}',
      'data: [DONE]',
    ])))
    const provider = new ApiProvider(config)
    const result = await provider.chat([{ role: 'user', content: 'time?' }], [], () => {})
    expect(result.toolCalls).toEqual([
      { id: 'c1', name: 'get_time', arguments: { tz: 'utc' } },
    ])
  })

  it('throws a readable error on non-200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad key', { status: 401 })))
    const provider = new ApiProvider(config)
    await expect(
      provider.chat([{ role: 'user', content: 'hi' }], [], () => {}),
    ).rejects.toThrow(/401/)
  })

  it('waits minRequestIntervalSec between requests to the same baseUrl', async () => {
    vi.useFakeTimers()
    try {
      const mockFetch = vi.fn(async () =>
        sseResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}', 'data: [DONE]']),
      )
      vi.stubGlobal('fetch', mockFetch)
      const provider = new ApiProvider({
        ...config,
        baseUrl: 'https://throttled.test/v1',
        minRequestIntervalSec: 60,
      })
      await provider.chat([{ role: 'user', content: 'hi' }], [], () => {})
      const second = provider.chat([{ role: 'user', content: 'hi' }], [], () => {})
      await vi.advanceTimersByTimeAsync(59_000)
      expect(mockFetch).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1_000)
      await second
      expect(mockFetch).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('sends attribution headers when kind is openrouter', async () => {
    vi.stubGlobal('location', { origin: 'https://my.app' })
    const mockFetch = vi.fn(async () =>
      sseResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}', 'data: [DONE]']),
    )
    vi.stubGlobal('fetch', mockFetch)
    const provider = new ApiProvider({
      kind: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'k',
      model: 'm',
    })
    await provider.chat([{ role: 'user', content: 'hi' }], [], () => {})
    const [, init1] = mockFetch.mock.calls[0] as unknown as [unknown, RequestInit]
    const headers = init1.headers as Record<string, string>
    expect(headers['HTTP-Referer']).toBe('https://my.app')
    expect(headers['X-OpenRouter-Title']).toBe('WebGPU Agent')
    expect(headers['X-OpenRouter-Categories']).toBe('personal-agent')
  })

  it('does not send attribution headers when kind is not openrouter', async () => {
    const mockFetch = vi.fn(async () =>
      sseResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}', 'data: [DONE]']),
    )
    vi.stubGlobal('fetch', mockFetch)
    const provider = new ApiProvider({
      kind: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'k',
      model: 'm',
    })
    await provider.chat([{ role: 'user', content: 'hi' }], [], () => {})
    const [, init2] = mockFetch.mock.calls[0] as unknown as [unknown, RequestInit]
    const headers = init2.headers as Record<string, string>
    expect(headers['HTTP-Referer']).toBeUndefined()
    expect(headers['X-OpenRouter-Title']).toBeUndefined()
  })
})

describe('ApiProvider.extraHeaders', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns attribution headers when kind is openrouter', () => {
    vi.stubGlobal('location', { origin: 'https://test.app' })
    const provider = new ApiProvider({
      kind: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'k',
      model: 'm',
    })
    expect(provider.extraHeaders()).toEqual({
      'HTTP-Referer': 'https://test.app',
      'X-OpenRouter-Title': 'WebGPU Agent',
      'X-OpenRouter-Categories': 'personal-agent',
    })
  })

  it('returns empty object when kind is not openrouter', () => {
    const provider = new ApiProvider({
      kind: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'k',
      model: 'm',
    })
    expect(provider.extraHeaders()).toEqual({})
  })

  it('returns empty object when kind is custom', () => {
    const provider = new ApiProvider({
      kind: 'custom',
      baseUrl: 'https://x.test/v1',
      apiKey: 'k',
      model: 'm',
    })
    expect(provider.extraHeaders()).toEqual({})
  })
})
