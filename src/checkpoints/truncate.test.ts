import { describe, expect, it } from 'vitest'
import { truncateForRevert } from './truncate'
import type { ChatMessage } from '../types'
import type { DisplayItem } from '../ui/MessageList'

const u = (content: string): ChatMessage => ({ role: 'user', content })
const a = (content: string): ChatMessage => ({ role: 'assistant', content })
const du = (text: string): DisplayItem => ({ kind: 'user', text })
const da = (text: string): DisplayItem => ({ kind: 'assistant', text })

describe('truncateForRevert', () => {
  it('cuts messages at the user message matching the display index', () => {
    const messages = [u('one'), a('r1'), u('two'), a('r2')]
    const display = [du('one'), da('r1'), du('two'), da('r2')]
    const t = truncateForRevert(messages, display, 2)
    expect(t.display).toEqual([du('one'), da('r1')])
    expect(t.messages).toEqual([u('one'), a('r1')])
  })

  it('ignores prompt-embedded tool results that use role user', () => {
    const messages = [u('one'), { role: 'user' as const, content: '[Tool result for grep]\nhits' }, a('r1'), u('two')]
    const display = [du('one'), da('r1'), du('two')]
    const t = truncateForRevert(messages, display, 2)
    expect(t.messages).toHaveLength(3)
    expect(t.messages[2].content).toBe('r1')
  })

  it('empties messages when context trimming dropped the older user turns', () => {
    const messages = [u('two')] // "one" was trimmed away
    const display = [du('one'), da('r1'), du('two')]
    const t = truncateForRevert(messages, display, 0)
    expect(t.messages).toEqual([])
    expect(t.display).toEqual([])
  })
})
