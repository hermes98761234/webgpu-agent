import type { AgentSettings, ApiConfig, ChatMessage, ChatResult, Provider, ToolCall, ToolDef } from '../types'

// All endpoints are OpenAI-compatible /chat/completions and allow browser CORS.
// `models` are typed suggestions (datalist), not a hard list — any id works.
export const API_PRESETS: Record<ApiConfig['kind'], { label: string; baseUrl: string; models: string[] }> = {
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-5.5', 'gpt-5', 'gpt-5-mini', 'gpt-4o-mini'],
  },
  anthropic: {
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5'],
  },
  google: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: ['gemini-3.1-pro', 'gemini-3.1-flash', 'gemini-2.5-flash'],
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['anthropic/claude-opus-4.8', 'openai/gpt-5.5', 'deepseek/deepseek-v4', 'moonshotai/kimi-k2.6', 'x-ai/grok-4.3'],
  },
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['llama-3.3-70b-versatile', 'qwen/qwen3-32b'],
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  mistral: {
    label: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    models: ['mistral-large-latest', 'mistral-small-latest'],
  },
  custom: { label: 'Custom (OpenAI-compatible)', baseUrl: '', models: [] },
}

// ponytail: per-baseUrl in-memory throttle; resets on page reload, which is fine for RPM limits
const lastRequestAt = new Map<string, number>()

async function throttle(config: ApiConfig, signal?: AbortSignal) {
  const intervalMs = (config.minRequestIntervalSec ?? 0) * 1000
  if (intervalMs > 0) {
    const waitMs = (lastRequestAt.get(config.baseUrl) ?? 0) + intervalMs - Date.now()
    if (waitMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, waitMs)
        signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(t)
            reject(new DOMException('Aborted', 'AbortError'))
          },
          { once: true },
        )
      })
    }
  }
  lastRequestAt.set(config.baseUrl, Date.now())
}

export function parseSseLines(buffer: string): { events: string[]; rest: string } {
  const events: string[] = []
  const lines = buffer.split('\n')
  const rest = lines.pop() ?? ''
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('data:')) {
      const data = trimmed.slice(5).trim()
      if (data && data !== '[DONE]') events.push(data)
    }
  }
  return { events, rest }
}

function toWireMessage(m: ChatMessage): Record<string, unknown> {
  if (m.role === 'tool') {
    return { role: 'tool', tool_call_id: m.toolCallId, content: m.content }
  }
  const wire: Record<string, unknown> = { role: m.role, content: m.content }
  if (m.toolCalls && m.toolCalls.length > 0) {
    wire.tool_calls = m.toolCalls.map((c) => ({
      id: c.id,
      type: 'function',
      function: { name: c.name, arguments: JSON.stringify(c.arguments) },
    }))
  }
  return wire
}

interface SseDelta {
  content?: string
  tool_calls?: Array<{
    index?: number
    id?: string
    function?: { name?: string; arguments?: string }
  }>
}

interface PartialToolCall {
  id: string
  name: string
  argsText: string
}

export class ApiProvider implements Provider {
  supportsNativeTools = true
  #config: ApiConfig

  constructor(config: ApiConfig) {
    this.#config = config
  }

  extraHeaders(): Record<string, string> {
    if (this.#config.kind === 'openrouter') {
      return {
        'HTTP-Referer': location.origin,
        'X-OpenRouter-Title': 'WebGPU Agent',
        'X-OpenRouter-Categories': 'personal-agent',
      }
    }
    if (this.#config.kind === 'anthropic') {
      // Required for Anthropic to accept requests directly from a browser
      return { 'anthropic-dangerous-direct-browser-access': 'true' }
    }
    return {}
  }

  async chat(
    messages: ChatMessage[],
    tools: ToolDef[],
    onDelta: (text: string) => void,
    signal?: AbortSignal,
    settings?: AgentSettings,
  ): Promise<ChatResult> {
    await throttle(this.#config, signal)
    const body: Record<string, unknown> = {
      model: this.#config.model,
      messages: messages.map(toWireMessage),
      stream: true,
    }
    if (settings?.temperature !== undefined) body.temperature = settings.temperature
    if (settings?.topP !== undefined) body.top_p = settings.topP
    if (settings?.maxTokens !== undefined) body.max_tokens = settings.maxTokens
    if (settings?.presencePenalty !== undefined) body.presence_penalty = settings.presencePenalty
    if (settings?.frequencyPenalty !== undefined) body.frequency_penalty = settings.frequencyPenalty
    if (tools.length > 0) {
      body.tools = tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }))
    }
    const res = await fetch(`${this.#config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.#config.apiKey}`,
        ...this.extraHeaders(),
      },
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      throw new Error(`API error ${res.status}: ${text.slice(0, 500)}`)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let content = ''
    const partials = new Map<number, PartialToolCall>()
    for (;;) {
      if (signal?.aborted) break
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const { events, rest } = parseSseLines(buffer)
      buffer = rest
      for (const data of events) {
        let parsed: unknown
        try {
          parsed = JSON.parse(data)
        } catch {
          continue
        }
        const delta = (parsed as { choices?: Array<{ delta?: SseDelta }> }).choices?.[0]?.delta
        if (!delta) continue
        if (typeof delta.content === 'string' && delta.content) {
          content += delta.content
          onDelta(delta.content)
        }
        for (const tc of delta.tool_calls ?? []) {
          const idx = tc.index ?? 0
          const partial = partials.get(idx) ?? { id: '', name: '', argsText: '' }
          if (tc.id) partial.id = tc.id
          if (tc.function?.name) partial.name = tc.function.name
          if (tc.function?.arguments) partial.argsText += tc.function.arguments
          partials.set(idx, partial)
        }
      }
    }
    const toolCalls: ToolCall[] = []
    for (const [, p] of [...partials.entries()].sort((a, b) => a[0] - b[0])) {
      let args: Record<string, unknown>
      try {
        args = JSON.parse(p.argsText || '{}') as Record<string, unknown>
      } catch {
        args = {}
      }
      toolCalls.push({ id: p.id || `call-${toolCalls.length}`, name: p.name, arguments: args })
    }
    return { content, toolCalls }
  }
}
