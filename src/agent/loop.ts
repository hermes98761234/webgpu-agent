import type { AgentEvent, AgentSettings, ChatMessage, Provider, ToolDef } from '../types'
import { buildToolSystemPrompt, parseToolCalls } from './toolPrompt'

const MAX_ITERATIONS = 10

export async function runAgent(
  history: ChatMessage[],
  provider: Provider,
  tools: ToolDef[],
  systemPrompt: string,
  onEvent: (e: AgentEvent) => void,
  signal?: AbortSignal,
  settings?: AgentSettings,
): Promise<ChatMessage[]> {
  const messages: ChatMessage[] = [...history]
  const toolMap = new Map(tools.map((t) => [t.name, t]))
  let system = systemPrompt
  if (!provider.supportsNativeTools && tools.length > 0) {
    system = [systemPrompt, buildToolSystemPrompt(tools)].filter(Boolean).join('\n\n')
  }
  const withSystem = (): ChatMessage[] =>
    system ? [{ role: 'system', content: system }, ...messages] : [...messages]

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const outgoing = withSystem()
    onEvent({ type: 'llm_request', messages: outgoing })
    let result
    try {
      result = await provider.chat(
        outgoing,
        provider.supportsNativeTools ? tools : [],
        (text) => onEvent({ type: 'assistant_delta', text }),
        signal,
        settings,
      )
    } catch (e) {
      onEvent({ type: 'error', error: String(e) })
      return messages
    }

    let calls = result.toolCalls
    if (!provider.supportsNativeTools && tools.length > 0) {
      calls = parseToolCalls(result.content)
    }

    onEvent({ type: 'llm_response', content: result.content })
    const assistant: ChatMessage = { role: 'assistant', content: result.content }
    if (calls.length > 0) assistant.toolCalls = calls
    messages.push(assistant)
    onEvent({ type: 'assistant_message', message: assistant })

    if (calls.length === 0) return messages

    for (const call of calls) {
      onEvent({ type: 'tool_start', call })
      const tool = toolMap.get(call.name)
      let output: string
      let isError = false
      if (!tool) {
        output = `Error: unknown tool "${call.name}"`
        isError = true
      } else {
        try {
          output = await tool.execute(call.arguments)
        } catch (e) {
          output = `Error: ${String(e)}`
          isError = true
        }
      }
      onEvent({ type: 'tool_result', call, result: output, isError })
      if (provider.supportsNativeTools) {
        messages.push({ role: 'tool', content: output, toolCallId: call.id })
      } else {
        messages.push({ role: 'user', content: `[Tool result for ${call.name}]\n${output}` })
      }
    }
  }
  onEvent({ type: 'error', error: `Stopped after ${MAX_ITERATIONS} tool iterations` })
  return messages
}
