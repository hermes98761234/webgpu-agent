import { describe, expect, it } from 'vitest'
import { buildToolSystemPrompt, parseToolCall, parseToolCalls } from './toolPrompt'
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
  it('assigns id to parsed call', () => {
    const a = parseToolCall('{"tool": "x", "arguments": {}}')
    expect(a?.id).toBeDefined()
    expect(a?.id).toMatch(/^local-\d+$/)
  })
})

describe('parseToolCalls', () => {
  it('returns empty array for plain text', () => {
    expect(parseToolCalls('The answer is 42.')).toEqual([])
  })

  it('parses a single inline tool call', () => {
    const calls = parseToolCalls('{"tool": "fs_list", "arguments": {"path": "/tmp"}}')
    expect(calls).toHaveLength(1)
    expect(calls[0].name).toBe('fs_list')
    expect(calls[0].arguments).toEqual({ path: '/tmp' })
  })

  it('parses multiple inline tool calls separated by prose', () => {
    const text = [
      '{"tool": "fs_list", "arguments": {"path": "/home"}}',
      '',
      'Waiting for listing...',
      '',
      '{"tool": "fs_read", "arguments": {"path": "/home/user/file.md"}}',
      '',
      'Reading file...',
    ].join('\n')
    const calls = parseToolCalls(text)
    expect(calls).toHaveLength(2)
    expect(calls[0].name).toBe('fs_list')
    expect(calls[1].name).toBe('fs_read')
    expect(calls[1].arguments).toEqual({ path: '/home/user/file.md' })
  })

  it('handles nested JSON in arguments', () => {
    const text = '{"tool": "run_javascript", "arguments": {"code": "var x = {a: 1}; console.log(x);"}}'
    const calls = parseToolCalls(text)
    expect(calls).toHaveLength(1)
    expect(calls[0].name).toBe('run_javascript')
  })

  it('skips non-tool JSON objects', () => {
    const text = '{"answer": 42}\n{"tool": "get_time", "arguments": {}}'
    const calls = parseToolCalls(text)
    expect(calls).toHaveLength(1)
    expect(calls[0].name).toBe('get_time')
  })

  it('assigns unique ids to each call', () => {
    const text = '{"tool": "a", "arguments": {}}\n{"tool": "b", "arguments": {}}'
    const calls = parseToolCalls(text)
    expect(calls[0].id).not.toBe(calls[1].id)
  })

  it('resets counter between calls', () => {
    const calls1 = parseToolCalls('{"tool": "x", "arguments": {}}')
    const calls2 = parseToolCalls('{"tool": "x", "arguments": {}}')
    expect(calls1[0].id).toBe('local-1')
    expect(calls2[0].id).toBe('local-1')
  })
})
