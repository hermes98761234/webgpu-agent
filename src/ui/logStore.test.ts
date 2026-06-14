import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearLog, getEntries, pushLlmRequest, pushLlmResponse, subscribe } from './logStore'

beforeEach(() => {
  clearLog()
})

describe('logStore', () => {
  it('starts with empty entries', () => {
    expect(getEntries()).toHaveLength(0)
  })

  it('pushLlmRequest adds an entry', () => {
    pushLlmRequest([{ role: 'user', content: 'hi' }])
    const entries = getEntries()
    expect(entries).toHaveLength(1)
    expect(entries[0].kind).toBe('llm-request')
    expect(entries[0].ts).toBeGreaterThan(0)
  })

  it('pushLlmResponse adds an entry', () => {
    pushLlmResponse('hello')
    const entries = getEntries()
    expect(entries).toHaveLength(1)
    expect(entries[0].kind).toBe('llm-response')
    expect((entries[0] as { content: string }).content).toBe('hello')
  })

  it('clearLog empties all entries', () => {
    pushLlmRequest([])
    pushLlmResponse('x')
    clearLog()
    expect(getEntries()).toHaveLength(0)
  })

  it('subscribe notifies on changes', () => {
    const cb = vi.fn()
    const unsub = subscribe(cb)
    pushLlmRequest([])
    expect(cb).toHaveBeenCalledTimes(1)
    pushLlmResponse('y')
    expect(cb).toHaveBeenCalledTimes(2)
    unsub()
    pushLlmResponse('z')
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('caps entries at 2000', () => {
    for (let i = 0; i < 2010; i++) pushLlmRequest([])
    expect(getEntries().length).toBeLessThanOrEqual(2000)
  })

  it('entries have unique sequential ids', () => {
    pushLlmRequest([])
    pushLlmResponse('a')
    const e = getEntries()
    expect(e[1].id).toBe(e[0].id + 1)
  })
})
