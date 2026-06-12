import { describe, expect, it } from 'vitest'
import { buildToolSystemPrompt, parseToolCall } from './toolPrompt'
import type { ToolDef } from '../types'

const tools: ToolDef[] = [
  {
    name: 'get_time',
    description: 'Get current time',
    parameters: { type: 'object', properties: {} },
    source: 'builtin',
    execute: async () => 'now',
  },
]

describe('buildToolSystemPrompt', () => {
  it('lists tool names and protocol', () => {
    const p = buildToolSystemPrompt(tools)
    expect(p).toContain('get_time')
    expect(p).toContain('"tool"')
  })
  it('returns empty string for no tools', () => {
    expect(buildToolSystemPrompt([])).toBe('')
  })
})

describe('parseToolCall', () => {
  it('parses a fenced json block', () => {
    const call = parseToolCall('```json\n{"tool": "get_time", "arguments": {}}\n```')
    expect(call?.name).toBe('get_time')
    expect(call?.arguments).toEqual({})
  })
  it('parses fenced block surrounded by prose', () => {
    const call = parseToolCall('I will check.\n```json\n{"tool": "x", "arguments": {"a": 1}}\n```\nDone.')
    expect(call?.name).toBe('x')
    expect(call?.arguments).toEqual({ a: 1 })
  })
  it('parses bare json', () => {
    const call = parseToolCall('{"tool": "x", "arguments": {"q": "hi"}}')
    expect(call?.arguments).toEqual({ q: 'hi' })
  })
  it('returns null for plain text', () => {
    expect(parseToolCall('The answer is 42.')).toBeNull()
  })
  it('returns null for json without tool field', () => {
    expect(parseToolCall('{"answer": 42}')).toBeNull()
  })
  it('assigns unique ids', () => {
    const a = parseToolCall('{"tool": "x", "arguments": {}}')
    const b = parseToolCall('{"tool": "x", "arguments": {}}')
    expect(a?.id).not.toBe(b?.id)
  })
})
