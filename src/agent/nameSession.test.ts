import { describe, expect, it, vi } from 'vitest'
import { nameSession } from './nameSession'
import type { Provider } from '../types'

function fakeProvider(response: string): Provider {
  return {
    supportsNativeTools: true,
    async chat() {
      return { content: response, toolCalls: [] }
    },
  }
}

describe('nameSession', () => {
  it('returns the provider response trimmed and cleaned', async () => {
    const name = await nameSession(fakeProvider('"My Chat Name"'), 'hello', 'hi there')
    expect(name).toBe('My Chat Name')
  })

  it('strips quotes from response', async () => {
    const name = await nameSession(fakeProvider("  'Test Session'  "), 'a', 'b')
    expect(name).toBe('Test Session')
  })

  it('truncates long names to 60 chars', async () => {
    const long = 'a'.repeat(100)
    const name = await nameSession(fakeProvider(long), 'a', 'b')
    expect(name.length).toBeLessThanOrEqual(60)
  })

  it('falls back to truncated user message on empty response', async () => {
    const name = await nameSession(fakeProvider(''), 'hello world', 'ok')
    expect(name).toBe('hello world')
  })

  it('falls back to "New chat" for empty user message', async () => {
    const name = await nameSession(fakeProvider(''), '', 'ok')
    expect(name).toBe('New chat')
  })

  it('falls back when provider throws', async () => {
    const provider: Provider = {
      supportsNativeTools: true,
      async chat() { throw new Error('boom') },
    }
    const name = await nameSession(provider, 'fallback text', 'ok')
    expect(name).toBe('fallback text')
  })

  it('emits llm_request and llm_response events via onEvent', async () => {
    const onEvent = vi.fn()
    const name = await nameSession(fakeProvider('Test Name'), 'hello', 'hi', onEvent)
    expect(name).toBe('Test Name')
    expect(onEvent).toHaveBeenCalledTimes(2)
    expect(onEvent.mock.calls[0][0]).toMatchObject({ type: 'llm_request', messages: [{ role: 'user', content: expect.stringContaining('Name this conversation') }] })
    expect(onEvent.mock.calls[1][0]).toMatchObject({ type: 'llm_response', content: 'Test Name' })
  })

  it('emits error event when provider throws', async () => {
    const provider: Provider = {
      supportsNativeTools: true,
      async chat() { throw new Error('boom') },
    }
    const onEvent = vi.fn()
    const name = await nameSession(provider, 'text', 'ok', onEvent)
    expect(name).toBe('text')
    expect(onEvent).toHaveBeenCalledTimes(2)
    expect(onEvent.mock.calls[0][0]).toMatchObject({ type: 'llm_request' })
    expect(onEvent.mock.calls[1][0]).toMatchObject({ type: 'error', error: 'Error: boom' })
  })
})
