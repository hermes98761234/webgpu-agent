import { useRef, useState } from 'react'
import { runAgent } from './agent/loop'
import { ApiProvider } from './providers/api'
import { LocalProvider, presetModels } from './providers/local'
import { builtinTools } from './tools/builtin'
import { loadSkills, makeUseSkillTool } from './skills/store'
import type { AgentEvent, ApiConfig, ChatMessage, Provider, ToolDef } from './types'
import { Composer } from './ui/Composer'
import { MessageList, type DisplayItem } from './ui/MessageList'
import { ModelPicker, type ProviderMode } from './ui/ModelPicker'
import { usePersistedState } from './ui/usePersistedState'
import { SkillsPanel } from './ui/SkillsPanel'
import { McpPanel } from './ui/McpPanel'

const localProvider = new LocalProvider()

export default function App() {
  const [mode, setMode] = usePersistedState<ProviderMode>('webgpu-agent.mode', 'local')
  const [localModel, setLocalModel] = usePersistedState('webgpu-agent.localModel', '')
  const [api, setApi] = usePersistedState<ApiConfig>('webgpu-agent.api', {
    kind: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: '',
    model: '',
  })
  const [systemPrompt, setSystemPrompt] = usePersistedState(
    'webgpu-agent.systemPrompt',
    'You are a helpful agent running entirely in the user browser. Use tools when they help.',
  )
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [display, setDisplay] = useState<DisplayItem[]>([])
  const [busy, setBusy] = useState(false)
  const [loadState, setLoadState] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; text: string }>({
    status: 'idle',
    text: '',
  })
  const [mcpTools, setMcpTools] = useState<ToolDef[]>([])
  const abortRef = useRef<AbortController | null>(null)

  if (!localModel) {
    // default to first preset once
    setLocalModel(presetModels()[0] ?? '')
  }

  const handleEvent = (e: AgentEvent) => {
    setDisplay((d) => {
      const next = [...d]
      if (e.type === 'assistant_delta') {
        const last = next[next.length - 1]
        if (last && last.kind === 'assistant' && last.streaming) {
          next[next.length - 1] = { ...last, text: last.text + e.text }
        } else {
          next.push({ kind: 'assistant', text: e.text, streaming: true })
        }
      } else if (e.type === 'assistant_message') {
        const last = next[next.length - 1]
        if (last && last.kind === 'assistant' && last.streaming) next.pop()
        if (e.message.content.trim()) next.push({ kind: 'assistant', text: e.message.content })
      } else if (e.type === 'tool_start') {
        next.push({ kind: 'tool', name: e.call.name, args: JSON.stringify(e.call.arguments) })
      } else if (e.type === 'tool_result') {
        for (let i = next.length - 1; i >= 0; i--) {
          const item = next[i]
          if (item.kind === 'tool' && item.result === undefined && item.name === e.call.name) {
            next[i] = { ...item, result: e.result, isError: e.isError }
            break
          }
        }
      } else if (e.type === 'error') {
        next.push({ kind: 'error', text: e.error })
      }
      return next
    })
  }

  const loadLocal = async () => {
    const model = localModel || ''
    if (!model) return
    setLoadState({ status: 'loading', text: 'Starting download…' })
    try {
      await localProvider.load(model, (text, progress) =>
        setLoadState({ status: 'loading', text: `${Math.round(progress * 100)}% — ${text}` }),
      )
      setLoadState({ status: 'ready', text: `Loaded ${model}` })
    } catch (e) {
      setLoadState({ status: 'error', text: String(e) })
    }
  }

  const send = async (text: string) => {
    if (busy) return
    setBusy(true)
    const history: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(history)
    setDisplay((d) => [...d, { kind: 'user', text }])
    let provider: Provider
    if (mode === 'local') {
      provider = localProvider
    } else {
      provider = new ApiProvider(api)
    }
    const tools: ToolDef[] = [...builtinTools, makeUseSkillTool(() => loadSkills()), ...mcpTools]
    const abort = new AbortController()
    abortRef.current = abort
    const final = await runAgent(history, provider, tools, systemPrompt, handleEvent, abort.signal)
    setMessages(final)
    setBusy(false)
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>WebGPU Agent</h1>
        <ModelPicker
          mode={mode}
          setMode={setMode}
          localModel={localModel || ''}
          setLocalModel={setLocalModel}
          api={api}
          setApi={setApi}
          loadState={loadState}
          onLoadLocal={loadLocal}
          busy={busy}
        />
        <label className="dim">System prompt</label>
        <textarea
          className="system-prompt"
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={4}
          disabled={busy}
        />
        <button
          onClick={() => {
            setMessages([])
            setDisplay([])
          }}
          disabled={busy}
        >
          New chat
        </button>
        <SkillsPanel disabled={busy} />
        <McpPanel disabled={busy} onToolsChange={setMcpTools} />
      </aside>
      <section className="chat">
        <MessageList items={display} />
        <Composer
          busy={busy}
          onSend={send}
          onStop={() => abortRef.current?.abort()}
        />
      </section>
    </div>
  )
}
