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
