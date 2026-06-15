import { describe, expect, it } from 'vitest'
import { runAgent } from './loop'
import type { AgentEvent, ChatMessage, ChatResult, Provider, ToolDef } from '../types'

function fakeProvider(native: boolean, responses: ChatResult[]): Provider {
  let i = 0
  return {
    supportsNativeTools: native,
    async chat() {
      const r = responses[Math.min(i, responses.length - 1)]
      i += 1
      return r
    },
  }
}

const echoTool: ToolDef = {
  name: 'echo',
  description: 'Echoes input',
  parameters: { type: 'object', properties: { text: { type: 'string' } } },
  source: 'builtin',
  execute: async (args) => `echo:${String(args.text)}`,
}

describe('runAgent (native tools)', () => {
  it('executes tool calls then returns final answer', async () => {
    const provider = fakeProvider(true, [
      { content: '', toolCalls: [{ id: 'c1', name: 'echo', arguments: { text: 'hi' } }] },
      { content: 'final answer', toolCalls: [] },
    ])
    const events: AgentEvent[] = []
    const history: ChatMessage[] = [{ role: 'user', content: 'do it' }]
    const messages = await runAgent(history, provider, [echoTool], 'be helpful', (e) => events.push(e))
    const toolMsg = messages.find((m) => m.role === 'tool')
    expect(toolMsg?.content).toBe('echo:hi')
    expect(toolMsg?.toolCallId).toBe('c1')
    expect(messages[messages.length - 1]).toMatchObject({ role: 'assistant', content: 'final answer' })
    expect(events.some((e) => e.type === 'tool_result' && e.result === 'echo:hi')).toBe(true)
  })

  it('reports unknown tools as errors and continues', async () => {
    const provider = fakeProvider(true, [
      { content: '', toolCalls: [{ id: 'c1', name: 'nope', arguments: {} }] },
      { content: 'done', toolCalls: [] },
    ])
    const events: AgentEvent[] = []
    const messages = await runAgent(
      [{ role: 'user', content: 'x' }], provider, [echoTool], '', (e) => events.push(e),
    )
    const toolMsg = messages.find((m) => m.role === 'tool')
    expect(toolMsg?.content).toContain('unknown tool')
    expect(events.some((e) => e.type === 'tool_result' && e.isError)).toBe(true)
  })
})

describe('runAgent (prompt-based tools for local models)', () => {
  it('parses json tool call, feeds result back as user message', async () => {
    const provider = fakeProvider(false, [
      { content: '```json\n{"tool": "echo", "arguments": {"text": "yo"}}\n```', toolCalls: [] },
      { content: 'all done', toolCalls: [] },
    ])
    const messages = await runAgent(
      [{ role: 'user', content: 'x' }], provider, [echoTool], '', () => {},
    )
    const fed = messages.find((m) => m.role === 'user' && m.content.includes('echo:yo'))
    expect(fed).toBeDefined()
    expect(messages[messages.length - 1].content).toBe('all done')
  })

  it('plain text answer ends the loop immediately', async () => {
    const provider = fakeProvider(false, [{ content: 'just an answer', toolCalls: [] }])
    const messages = await runAgent(
      [{ role: 'user', content: 'x' }], provider, [echoTool], '', () => {},
    )
    expect(messages).toHaveLength(2)
  })
})

describe('runAgent (limits and errors)', () => {
  it('stops after maxIterations and emits iteration_limit event', async () => {
    const provider = fakeProvider(true, [
      { content: '', toolCalls: [{ id: 'c', name: 'echo', arguments: { text: 'x' } }] },
    ])
    const events: AgentEvent[] = []
    await runAgent(
      [{ role: 'user', content: 'x' }], provider, [echoTool], '', (e) => events.push(e),
      undefined, { temperature: 0.7, topP: 1, maxTokens: 2048, presencePenalty: 0, frequencyPenalty: 0, maxContextMessages: 40, maxIterations: 10 },
    )
    expect(events.some((e) => e.type === 'iteration_limit' && e.count === 10)).toBe(true)
  })

  it('emits error event when provider throws', async () => {
    const provider: Provider = {
      supportsNativeTools: true,
      async chat() {
        throw new Error('boom')
      },
    }
    const events: AgentEvent[] = []
    await runAgent([{ role: 'user', content: 'x' }], provider, [], '', (e) => events.push(e))
    expect(events.some((e) => e.type === 'error' && e.error.includes('boom'))).toBe(true)
  })
})
