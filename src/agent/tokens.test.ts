import { describe, expect, it } from 'vitest'
import { contextWindowFor, estimateHistoryTokens, estimateTokens, historyBudget, priceFor, trimToTokenBudget } from './tokens'
import type { ChatMessage } from '../types'

const msg = (role: ChatMessage['role'], content: string): ChatMessage => ({ role, content })

describe('estimateTokens', () => {
  it('uses ~4 chars per token', () => {
    expect(estimateTokens('abcdefgh')).toBe(2)
    expect(estimateTokens('')).toBe(0)
  })
})

describe('contextWindowFor', () => {
  it('returns 4096 for local models', () => {
    expect(contextWindowFor('Llama-3.2-1B-Instruct', true)).toBe(4096)
  })
  it('matches known API models and falls back for unknown', () => {
    expect(contextWindowFor('claude-sonnet-5', false)).toBe(200_000)
    expect(contextWindowFor('gemini-2.5-flash', false)).toBe(1_000_000)
    expect(contextWindowFor('some-unknown-model', false)).toBe(32_000)
  })
})

describe('priceFor', () => {
  it('matches known models, undefined for unknown', () => {
    expect(priceFor('gpt-4o-mini')).toEqual([0.15, 0.6])
    expect(priceFor('claude-sonnet-5')).toEqual([3, 15])
    expect(priceFor('mystery-model')).toBeUndefined()
  })
})

describe('historyBudget', () => {
  it('uses explicit setting when > 0', () => {
    expect(historyBudget(5000, 'gpt-4o', false, 1000, 2048)).toBe(5000)
  })
  it('derives from window minus system, output and margin when auto', () => {
    expect(historyBudget(0, 'unknown', false, 1000, 2048)).toBe(32_000 - 1000 - 2048 - 256)
  })
  it('never goes below 1024', () => {
    expect(historyBudget(0, 'local', true, 4000, 2048)).toBe(1024)
  })
})

describe('trimToTokenBudget', () => {
  const big = 'x'.repeat(400) // ~100 tokens each
  it('keeps everything under budget', () => {
    const msgs = [msg('user', big), msg('assistant', big)]
    expect(trimToTokenBudget(msgs, 10_000)).toEqual(msgs)
  })
  it('drops oldest messages and starts at a user message', () => {
    const msgs = [
      msg('user', big),
      msg('assistant', big),
      msg('user', big),
      msg('assistant', big),
      msg('user', big),
    ]
    const out = trimToTokenBudget(msgs, 250)
    expect(out.length).toBeLessThan(msgs.length)
    expect(out[0].role).toBe('user')
    expect(out[out.length - 1]).toBe(msgs[msgs.length - 1])
    expect(estimateHistoryTokens(out)).toBeLessThanOrEqual(250)
  })
  it('always keeps the last message even if over budget', () => {
    const msgs = [msg('user', big), msg('user', big)]
    expect(trimToTokenBudget(msgs, 10)).toEqual([msgs[1]])
  })
  it('returns as-is when budget is 0 (disabled)', () => {
    const msgs = [msg('user', big)]
    expect(trimToTokenBudget(msgs, 0)).toBe(msgs)
  })
})
