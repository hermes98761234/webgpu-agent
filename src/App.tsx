import { useEffect, useRef, useState } from 'react'
import { parseHash, replaceHash, pushHash } from './router'
import { runAgent } from './agent/loop'
import { DEFAULT_SYSTEM_PROMPT, initAgentHome, writeAgentMd } from './agenthome'
import { loadAgentTypes, seedDefaultAgents, type AgentType } from './agents'
import { ApiProvider } from './providers/api'
import { LocalProvider, presetModels, webgpuAvailable, deviceModels } from './providers/local'
import { builtinTools } from './tools/builtin'
import { fsTools, resolvePath } from './tools/fs'
import { makePreviewTool } from './tools/preview'
import { searchTools } from './tools/search'
import { gitTools } from './tools/git'
import { webTools } from './tools/web'
import { makeSpawnAgentTool } from './tools/multiagent'
import { makeUseSkillTool } from './skills/store'
import { buildAgentSystemPrompt, buildDebugPrompt } from './agent/context'
import { contextWindowFor, estimateHistoryTokens, estimateTokens, historyBudget, priceFor, trimToTokenBudget } from './agent/tokens'
import { makeMemoryTools, readAllMemories } from './memory/store'
import { setStorePassword, verifyStorePassword, detectEncryptionEnabled, hasPassword, clearAllStoreData } from './store/index'
import { getMcpServersCached } from './mcp/manager'
import type { AgentEvent, AgentSettings, ApiConfig, ChatMessage, Plugin, Provider, Skill, SlashCommand, ToolDef, TodoItem } from './types'
import { makeTodoTool } from './tools/todo'
import { TodoPanel } from './ui/TodoPanel'
import { Composer } from './ui/Composer'
import { MessageList, type DisplayItem } from './ui/MessageList'
import { PreviewPane, type PreviewSource } from './ui/PreviewPane'
import { ModelPicker, type ProviderMode } from './ui/ModelPicker'
import { usePersistedState } from './ui/usePersistedState'
import { SkillsPanel } from './ui/SkillsPanel'
import { McpPanel } from './ui/McpPanel'
import { PasswordGate } from './ui/PasswordGate'
import { SettingsPage } from './ui/SettingsPage'
import { PluginsPanel } from './ui/PluginsPanel'
import { FileManager } from './ui/FileManager'
import { Terminal } from './ui/Terminal'
import { LogPanel } from './ui/LogPanel'
import { AboutPanel } from './ui/AboutPanel'
import { GoalPanel } from './ui/GoalPanel'
import { SchedulePanel } from './ui/SchedulePanel'
import { pushLlmRequest, pushLlmResponse } from './ui/logStore'
import { generateSessionId, listSessions, loadSession, saveSession, deleteSession, renameSession, type SessionMeta } from './store/sessions'
import { nameSession } from './agent/nameSession'
import { HistoryPanel } from './ui/HistoryPanel'
import { startWorker, stopWorker } from './schedule/workerManager'
import { beginCheckpoint, endCheckpoint, getJournal, setJournal, installJournal, revertTo, countRevertFiles, resumeCheckpoint } from './checkpoints/journal'
import { truncateForRevert } from './checkpoints/truncate'

const localProvider = new LocalProvider()

const DEFAULT_SETTINGS: AgentSettings = {
  temperature: 0.7,
  topP: 1.0,
  maxTokens: 2048,
  presencePenalty: 0,
  frequencyPenalty: 0,
  maxContextMessages: 40,
  maxContextTokens: 0, // 0 = auto from model context window
  maxIterations: 50,
}

const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'clear', description: 'Clear the chat history', icon: '🗑️' },
  { name: 'settings', description: 'Open settings', icon: '⚙️' },
  { name: 'skills', description: 'Manage skills', icon: '🎯' },
  { name: 'mcp', description: 'Manage MCP servers', icon: '🔌' },
  { name: 'help', description: 'Show available commands and tools', icon: '❓' },
  { name: 'usage', description: 'Show context size, token usage and cost', icon: '📊' },
  { name: 'git status', description: 'Show git repository status', icon: '🔀' },
  { name: 'ls', description: 'List files in current directory', icon: '📁' },
  { name: 'agent', description: 'Spawn a sub-agent with a task', icon: '🤖' },
  { name: 'files', description: 'Browse and edit files', icon: '📂' },
  { name: 'goal', description: 'Manage goals with deadlines', icon: '🎯' },
  { name: 'schedule', description: 'Manage scheduled tasks', icon: '📅' },
  { name: 'preview', description: 'Preview an HTML file from the virtual FS' },
]

type View = 'chat' | 'settings' | 'files' | 'terminal' | 'log' | 'about' | 'goal' | 'schedule'
type PasswordGateMode = 'setup' | 'unlock' | null

const trimContext = (msgs: ChatMessage[], max: number): ChatMessage[] => {
  if (max <= 0 || msgs.length <= max) return msgs
  let start = msgs.length - max
  while (start < msgs.length && msgs[start].role !== 'user') start++
  return msgs.slice(start)
}

export default function App() {
  const [mode, setMode] = usePersistedState<ProviderMode>('webgpu-agent.mode', 'local')
  const [localModel, setLocalModel] = usePersistedState('webgpu-agent.localModel', '')
  const [api, setApi] = usePersistedState<ApiConfig>('webgpu-agent.api', {
    kind: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: '',
    model: '',
  })
  // System prompt lives in /home/user/.agent/agent.md (loaded by initAgentHome)
  const [systemPrompt, setSystemPromptState] = useState(DEFAULT_SYSTEM_PROMPT)
  const promptSaveTimer = useRef<number | null>(null)
  const setSystemPrompt = (value: string) => {
    setSystemPromptState(value)
    if (promptSaveTimer.current !== null) window.clearTimeout(promptSaveTimer.current)
    promptSaveTimer.current = window.setTimeout(() => void writeAgentMd(value), 400)
  }
  const [agentSettings, setAgentSettings] = usePersistedState<AgentSettings>(
    'webgpu-agent.settings',
    DEFAULT_SETTINGS,
  )
  const [theme, setTheme] = usePersistedState<'dark' | 'light'>('webgpu-agent.theme', 'dark')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [display, setDisplay] = useState<DisplayItem[]>([])
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [draft, setDraft] = useState<{ text: string; nonce: number; mode: 'replace' | 'append' } | undefined>()
  const [busy, setBusy] = useState(false)
  const [loadState, setLoadState] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; text: string }>({
    status: 'idle',
    text: '',
  })
  const [mcpTools, setMcpTools] = useState<ToolDef[]>([])
  const [preview, setPreview] = useState<PreviewSource | null>(null)
  const initialRoute = parseHash()
  const [view, setView] = useState<View>(initialRoute.view)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const needsPasswordGate = detectEncryptionEnabled() && initialRoute.view === 'chat' && initialRoute.sessionId
  const [passwordGateMode, setPasswordGateMode] = useState<PasswordGateMode>(() => {
    if (needsPasswordGate) return 'unlock'
    if (detectEncryptionEnabled()) return 'unlock'
    return null
  })
  const [isUnlocked, setIsUnlocked] = useState(() => !detectEncryptionEnabled())
  const [skills, setSkills] = useState<Skill[]>([])
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const providerRef = useRef<Provider | null>(null)
  const toolsRef = useRef<ToolDef[]>([])
  const agentTypesRef = useRef<AgentType[]>([])
  const initStarted = useRef(false)

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [sessionName, setSessionName] = useState('New chat')
  const sessionNameRef = useRef('New chat')
  const sessionCreatedAtRef = useRef<number>(0)
  const sessionNamedRef = useRef(false)
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)
  const pendingSessionRef = useRef<string | null>(null)

  const saveCurrentSession = async (
    msgs: ChatMessage[],
    disp: DisplayItem[],
    sid: string,
    todosOverride?: TodoItem[],
  ) => {
    if (!sid || msgs.length === 0) return
    const firstUser = msgs.find((m) => m.role === 'user')
    const meta: SessionMeta = {
      id: sid,
      name: sessionNameRef.current,
      createdAt: sessionCreatedAtRef.current,
      updatedAt: Date.now(),
      preview: firstUser?.content.slice(0, 80) ?? '',
    }
    const cleanDisplay = disp.map((item) =>
      item.kind === 'assistant' && item.streaming ? { ...item, streaming: false } : item
    )
    await saveSession(meta, { messages: msgs, display: cleanDisplay, todos: todosOverride ?? todos, checkpoints: getJournal() })
    setHistoryRefreshKey((k) => k + 1)
  }

  const loadSessionById = async (id: string) => {
    if (currentSessionId && messages.length > 0) {
      await saveCurrentSession(messages, display, currentSessionId)
    }
    const data = await loadSession(id)
    if (!data) return
    const sessions = await listSessions()
    const meta = sessions.find((s) => s.id === id)
    setMessages(data.messages)
    setDisplay(data.display)
    setTodos(data.todos ?? [])
    setJournal(data.checkpoints ?? [])
    setCurrentSessionId(id)
    sessionNameRef.current = meta?.name ?? 'Chat'
    setSessionName(meta?.name ?? 'Chat')
    sessionNamedRef.current = true
    sessionCreatedAtRef.current = meta?.createdAt ?? Date.now()
    setSidebarOpen(false)
    replaceHash({ view: 'chat', sessionId: id })
  }

  const deleteSessionById = async (id: string) => {
    await deleteSession(id)
    if (currentSessionId === id) {
      setMessages([])
      setDisplay([])
      setTodos([])
      setJournal([])
      setCurrentSessionId(null)
      sessionNameRef.current = 'New chat'
      setSessionName('New chat')
      sessionNamedRef.current = false
      sessionCreatedAtRef.current = Date.now()
      replaceHash({ view: 'chat' })
    }
    setHistoryRefreshKey((k) => k + 1)
  }

  const getProvider = (): Provider => providerRef.current!
  const getTools = (): ToolDef[] => toolsRef.current

  // Cumulative estimated token usage since page load
  const usageRef = useRef({ requests: 0, prompt: 0, completion: 0 })

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
        next.push({ kind: 'tool', name: e.call.name, args: JSON.stringify(e.call.arguments), startTime: Date.now() })
      } else if (e.type === 'tool_result') {
        for (let i = next.length - 1; i >= 0; i--) {
          const item = next[i]
          if (item.kind === 'tool' && item.result === undefined && item.name === e.call.name) {
            next[i] = { ...item, result: e.result, isError: e.isError, endTime: Date.now() }
            break
          }
        }
      } else if (e.type === 'iteration_limit') {
        next.push({ kind: 'iteration_limit', count: e.count })
      } else if (e.type === 'error') {
        next.push({ kind: 'error', text: e.error })
      } else if (e.type === 'llm_request') {
        usageRef.current.requests++
        usageRef.current.prompt += estimateHistoryTokens(e.messages)
        pushLlmRequest(e.messages)
      } else if (e.type === 'llm_response') {
        usageRef.current.completion += estimateTokens(e.content)
        pushLlmResponse(e.content)
      }
      return next
    })
  }

  // Auto-save current session and trigger LLM naming when idle
  useEffect(() => {
    if (busy || !currentSessionId || messages.length === 0) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void saveCurrentSession(messages, display, currentSessionId)
    if (!sessionNamedRef.current && providerRef.current) {
      const userMsg = messages.find((m) => m.role === 'user')
      const assistantMsg = messages.find((m) => m.role === 'assistant')
      if (userMsg && assistantMsg) {
        sessionNamedRef.current = true
        const sid = currentSessionId
        void nameSession(providerRef.current, userMsg.content, assistantMsg.content, handleEvent)
          .then((name) => {
            sessionNameRef.current = name
            setSessionName(name)
            void renameSession(sid, name)
              .then(() => setHistoryRefreshKey((k) => k + 1))
              .catch((e) => console.error('Session rename failed:', e))
          })
          .catch((e) => {
            sessionNamedRef.current = false // retry on next idle
            console.error('Session naming failed:', e)
          })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy])

  const loadLocal = async (modelOverride?: string) => {
    const model = modelOverride ?? localModel ?? ''
    if (!model) return
    setLoadState({ status: 'loading', text: 'Starting download…' })
    try {
      await localProvider.load(model, (text, progress) =>
        setLoadState({ status: 'loading', text: `${Math.round(progress * 100)}% — ${text}` }),
      )
      setLoadState({ status: 'ready', text: `Loaded ${localProvider.loadedModel || model}` })
    } catch (e) {
      setLoadState({ status: 'error', text: String(e) })
    }
  }

  // One-time startup: populate /home/user/.agent (seeding built-in skills on
  // first run), load skills/plugins/system prompt from it, and auto-load the
  // last-used (or default) local model so chat works without pressing Load.
  useEffect(() => {
    if (initStarted.current) return
    initStarted.current = true
    installJournal()
    void (async () => {
      const home = await initAgentHome()
      await seedDefaultAgents()
      agentTypesRef.current = await loadAgentTypes()
      setSkills(home.skills)
      setPlugins(home.plugins)
      setSystemPromptState(home.systemPrompt)
      if (mode === 'local' && webgpuAvailable()) {
        const models = deviceModels().map((m) => m.id)
        let model = localModel || presetModels()[0] || ''
        if (model && !models.includes(model)) model = presetModels()[0] || ''
        if (model) {
          if (model !== localModel) setLocalModel(model)
          void loadLocal(model)
        }
      }
      startWorker((schedule) => {
        handleEvent({ type: 'status', text: `Schedule due: ${schedule.title}` })
      })
    })().catch((e) => {
      console.error('Agent home init failed:', e)
      handleEvent({ type: 'error', error: `Startup init failed: ${String(e)}` })
    })
    return () => stopWorker()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const route = parseHash()
    if (needsPasswordGate) {
      pendingSessionRef.current = route.sessionId ?? null
      return
    }
    if (route.view === 'chat' && route.sessionId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadSessionById(route.sessionId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handleHashChange = () => {
      const route = parseHash()
      setView(route.view)
      if (route.view === 'chat' && route.sessionId) {
        void loadSessionById(route.sessionId)
      }
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getAllSkills = (): Skill[] => [
    ...skills,
    ...plugins
      .filter((p) => p.enabled)
      .flatMap((p) =>
        p.skills.map((s) => ({
          id: `${p.name}:${s.name}`,
          name: `${p.name}:${s.name}`,
          description: s.description,
          instructions: s.instructions,
        }))
      ),
  ]

  const buildTools = (): ToolDef[] => {
    const allSkills = getAllSkills()
    const spawnTool = makeSpawnAgentTool(getProvider, getTools, () => abortRef.current?.signal, () => agentTypesRef.current)
    return [
      ...builtinTools,
      ...fsTools,
      ...searchTools,
      ...gitTools,
      ...webTools,
      ...makeMemoryTools(),
      makeUseSkillTool(() => allSkills),
      makeTodoTool(setTodos),
      makePreviewTool(setPreview),
      spawnTool,
      ...mcpTools,
    ]
  }

  const send = async (text: string) => {
    if (busy) return
    setBusy(true)
    if (!currentSessionId) {
      const newId = generateSessionId()
      setCurrentSessionId(newId)
      replaceHash({ view: 'chat', sessionId: newId })
      sessionCreatedAtRef.current = Date.now()
      sessionNamedRef.current = false
      sessionNameRef.current = 'New chat'
    }
    const rawHistory: ChatMessage[] = [...messages, { role: 'user', content: text }]
    const cpId = generateSessionId()
    beginCheckpoint(cpId)
    const countTrimmed = trimContext(rawHistory, agentSettings.maxContextMessages)
    setDisplay((d) => [...d, { kind: 'user', text, cpId }])
    let provider: Provider
    if (mode === 'local') {
      provider = localProvider
    } else {
      provider = new ApiProvider(api)
    }
    providerRef.current = provider
    const tools = buildTools()
    toolsRef.current = tools
    const abort = new AbortController()
    abortRef.current = abort
    try {
      const { index: memIdx, files: memFiles } = await readAllMemories()
      const effectiveSystem = buildAgentSystemPrompt(systemPrompt, getAllSkills(), memIdx, memFiles, tools)
      const budget = historyBudget(
        agentSettings.maxContextTokens ?? 0,
        mode === 'local' ? localModel : api.model,
        mode === 'local',
        estimateTokens(effectiveSystem),
        agentSettings.maxTokens,
      )
      const history = trimToTokenBudget(countTrimmed, budget)
      setMessages(history)
      const final = await runAgent(history, provider, tools, effectiveSystem, handleEvent, abort.signal, agentSettings)
      setMessages(final)
    } catch (e) {
      handleEvent({ type: 'error', error: String(e) })
    } finally {
      endCheckpoint()
      abortRef.current = null
      setBusy(false)
    }
  }

  const handleContinue = async () => {
    if (busy || !providerRef.current) return
    setBusy(true)
    const provider = providerRef.current
    const tools = buildTools()
    toolsRef.current = tools
    const abort = new AbortController()
    abortRef.current = abort
    // Reopen the checkpoint for the turn we're continuing so writes made during
    // this run are journaled under the same revert point (not silently dropped).
    const lastUser = [...display].reverse().find((d) => d.kind === 'user')
    const cpId = lastUser?.cpId
    if (cpId) resumeCheckpoint(cpId)
    try {
      const { index: memIdx, files: memFiles } = await readAllMemories()
      const effectiveSystem = buildAgentSystemPrompt(systemPrompt, getAllSkills(), memIdx, memFiles, tools)
      const budget = historyBudget(
        agentSettings.maxContextTokens ?? 0,
        mode === 'local' ? localModel : api.model,
        mode === 'local',
        estimateTokens(effectiveSystem),
        agentSettings.maxTokens,
      )
      const history = trimToTokenBudget(messages, budget)
      const final = await runAgent(history, provider, tools, effectiveSystem, handleEvent, abort.signal, agentSettings)
      setMessages(final)
    } catch (e) {
      handleEvent({ type: 'error', error: String(e) })
    } finally {
      if (cpId) endCheckpoint()
      abortRef.current = null
      setBusy(false)
    }
  }

  const handleRevert = async (dispIndex: number, prefill: boolean) => {
    if (busy) return
    const item = display[dispIndex]
    if (item?.kind !== 'user') return
    const fileCount = item.cpId ? countRevertFiles(item.cpId) : 0
    const removed = display.length - dispIndex
    const what = `Revert ${removed} message(s)${fileCount ? ` and restore ${fileCount} file change(s)` : ''}?`
    if (!window.confirm(what)) return
    if (item.cpId) await revertTo(item.cpId)
    const t = truncateForRevert(messages, display, dispIndex)
    setMessages(t.messages)
    setDisplay(t.display)
    setTodos([])
    if (currentSessionId) await saveCurrentSession(t.messages, t.display, currentSessionId, [])
    if (prefill) setDraft({ text: item.text, nonce: Date.now(), mode: 'replace' })
  }

  const allCommands: SlashCommand[] = [
    ...SLASH_COMMANDS,
    ...skills.map((s) => ({ name: `skill:${s.name}`, description: s.description, icon: '🎯' })),
    ...plugins
      .filter((p) => p.enabled)
      .flatMap((p) =>
        p.commands.map((c) => ({
          name: `${p.name}:${c.name}`,
          description: c.description,
          icon: c.icon ?? '🔌',
        }))
      ),
  ]

  const handleCommand = (command: string, args: string) => {
    if (command === 'clear') {
      setMessages([])
      setDisplay([])
      setTodos([])
      setJournal([])
      return
    }
    if (command === 'settings') {
      setView('settings')
      pushHash({ view: 'settings' })
      return
    }
    if (command === 'files') {
      setView('files')
      pushHash({ view: 'files' })
      return
    }
    if (command === 'goal') {
      setView('goal')
      pushHash({ view: 'goal' })
      return
    }
    if (command === 'schedule') {
      setView('schedule')
      pushHash({ view: 'schedule' })
      return
    }
    if (command === 'preview') {
      if (args.trim()) setPreview({ title: args, path: resolvePath(args) })
      return
    }
    if (command === 'usage') {
      const isLocal = mode === 'local'
      const modelName = (isLocal ? localModel : api.model) || '(no model selected)'
      const window = (agentSettings.maxContextTokens ?? 0) > 0
        ? agentSettings.maxContextTokens
        : contextWindowFor(modelName, isLocal)
      const ctx = estimateHistoryTokens(messages)
      const pct = Math.min(100, Math.round((ctx / window) * 100))
      const bar = '█'.repeat(Math.round(pct / 5)).padEnd(20, '░')
      const u = usageRef.current
      const price = isLocal ? [0, 0] as [number, number] : priceFor(modelName)
      const cost = price ? (u.prompt / 1e6) * price[0] + (u.completion / 1e6) * price[1] : undefined
      const status = isLocal
        ? `Local WebGPU — model ${loadState.status === 'ready' ? 'loaded ✅' : loadState.status}`
        : `API (${api.kind}) — ${api.baseUrl}${api.apiKey ? ' — key set ✅' : ' — ⚠️ no API key'}`
      const plan = isLocal
        ? 'Free — runs entirely on your GPU'
        : api.minRequestIntervalSec
          ? `Rate-limited: min ${api.minRequestIntervalSec}s between requests (free-tier throttle)`
          : 'No rate limit configured'
      const fmt = (n: number) => n.toLocaleString('en-US')
      setDisplay((d) => [...d, {
        kind: 'assistant',
        text: [
          '## Usage',
          `**Model:** \`${modelName}\``,
          `**Status:** ${status}`,
          `**Plan / limits:** ${plan}`,
          '',
          '### Context',
          `\`${bar}\` ${pct}%`,
          `~${fmt(ctx)} / ${fmt(window)} tokens · ${messages.length} messages in history`,
          `Auto-trim: keeps history under ${(agentSettings.maxContextTokens ?? 0) > 0 ? `${fmt(agentSettings.maxContextTokens)} tokens (manual)` : 'the model context window (auto)'} and ${agentSettings.maxContextMessages} messages`,
          '',
          '### Session totals (since page load)',
          `${u.requests} LLM request(s) · input ~${fmt(u.prompt)} tok · output ~${fmt(u.completion)} tok`,
          `**Estimated cost:** ${cost === undefined ? 'n/a (unknown model pricing)' : cost === 0 ? '$0.00 (free)' : `$${cost.toFixed(4)}`}`,
          '',
          '*Token counts are estimates (~4 chars/token).*',
        ].join('\n'),
      }])
      return
    }
    if (command === 'help') {
      const tools = buildTools()
      const groupOf = (t: ToolDef): string => {
        if (t.source === 'mcp') return 'MCP'
        if (t.name.startsWith('fs_')) return 'File system'
        if (t.name.startsWith('git_')) return 'Git'
        if (t.name === 'weather_lookup' || t.name === 'web_search') return 'Web'
        if (t.name.startsWith('memory_')) return 'Memory'
        if (t.name === 'spawn_agent' || t.name === 'use_skill') return 'Agent'
        return 'Built-in'
      }
      const groups = new Map<string, ToolDef[]>()
      for (const t of tools) {
        const g = groupOf(t)
        groups.set(g, [...(groups.get(g) ?? []), t])
      }
      const toolText = [...groups.entries()]
        .map(([g, ts]) => `**${g}:** ${ts.map((t) => `\`${t.name}\``).join(', ')}`)
        .join('\n')
      setDisplay((d) => [...d, {
        kind: 'assistant',
        text: `## Available Commands\n\n${allCommands.map((c) => `**/${c.name}** — ${c.description}`).join('\n')}\n\n## Available Tools\n\n${toolText}`,
      }])
      return
    }
    if (command === 'skills') {
      const lines = skills.length
        ? skills.map((s) => `**${s.name}** — ${s.description}`).join('\n')
        : '*No skills installed yet.*'
      setDisplay((d) => [...d, {
        kind: 'assistant',
        text: `## Installed Skills\n\n${lines}\n\nManage skills in the sidebar panel — they are stored as files in \`/home/user/.agent/skills/\`.`,
      }])
      return
    }
    if (command === 'mcp') {
      const servers = getMcpServersCached()
      const serverLines = servers.length
        ? servers.map((s) => `**${s.name}** — ${s.url}`).join('\n')
        : '*No MCP servers configured. Add one in the "MCP servers" panel in the sidebar.*'
      const toolLines = mcpTools.length
        ? mcpTools.map((t) => `\`${t.name}\` — ${t.description}`).join('\n')
        : '*No MCP tools connected.*'
      setDisplay((d) => [...d, {
        kind: 'assistant',
        text: `## MCP Servers\n\n${serverLines}\n\n## Connected MCP Tools\n\n${toolLines}`,
      }])
      return
    }
    if (command.startsWith('skill:')) {
      const skillName = command.slice(6)
      const skill = skills.find((s) => s.name === skillName)
      if (skill) {
        send(`Use the "${skillName}" skill.`)
        return
      }
    }
    const pluginCmd = plugins
      .filter((p) => p.enabled)
      .flatMap((p) => p.commands.map((c) => ({ full: `${p.name}:${c.name}`, template: c.template })))
      .find((c) => c.full === command)
    if (pluginCmd) {
      send(pluginCmd.template || `Run the ${command} command.`)
      return
    }
    // Pass other commands as text to the agent
    send(`/${command}${args ? ' ' + args : ''}`)
  }

  const handlePasswordSubmit = async (password: string): Promise<string | null> => {
    if (passwordGateMode === 'unlock') {
      const ok = await verifyStorePassword(password)
      if (!ok) return 'Incorrect password — please try again.'
    }
    await setStorePassword(password)
    setIsUnlocked(true)
    setPasswordGateMode(null)
    if (pendingSessionRef.current) {
      const sessionId = pendingSessionRef.current
      pendingSessionRef.current = null
      void loadSessionById(sessionId)
    }
    return null
  }

  const handlePasswordSkip = () => {
    setIsUnlocked(true)
    setPasswordGateMode(null)
    if (pendingSessionRef.current) {
      const sessionId = pendingSessionRef.current
      pendingSessionRef.current = null
      void loadSessionById(sessionId)
    }
  }

  const handleChangePassword = () => {
    setPasswordGateMode('setup')
  }

  const handleRemoveAllData = () => {
    clearAllStoreData()
    // Also drop the virtual filesystem (holds /home/user/.agent); completes once
    // the reload below closes the open connection.
    indexedDB.deleteDatabase('webgpu-agent-fs')
    setMessages([])
    setDisplay([])
    setTodos([])
    setJournal([])
    window.location.reload()
  }

  if (!isUnlocked && passwordGateMode === 'unlock') {
    return (
      <PasswordGate
        mode="unlock"
        onSubmit={handlePasswordSubmit}
      />
    )
  }

  return (
    <div className="app" style={{ flexDirection: 'column' }}>
      <div className="app-nav">
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarOpen((o) => !o)}
          aria-label="Toggle sidebar"
          aria-expanded={sidebarOpen}
        >
          ☰
        </button>
        <span style={{ fontWeight: 700, fontSize: 15, marginRight: 8, color: 'var(--text)' }}>{sessionName}</span>
        <button className={`nav-tab${view === 'chat' ? ' active' : ''}`} onClick={() => { setView('chat'); pushHash({ view: 'chat', sessionId: currentSessionId || undefined }) }}>Chat</button>
        <button className={`nav-tab${view === 'settings' ? ' active' : ''}`} onClick={() => { setView('settings'); pushHash({ view: 'settings' }) }}>Settings</button>
        <button className={`nav-tab${view === 'files' ? ' active' : ''}`} onClick={() => { setView('files'); pushHash({ view: 'files' }) }}>Files</button>
        <button className={`nav-tab${view === 'terminal' ? ' active' : ''}`} onClick={() => { setView('terminal'); pushHash({ view: 'terminal' }) }}>Terminal</button>
        <button className={`nav-tab${view === 'log' ? ' active' : ''}`} onClick={() => { setView('log'); pushHash({ view: 'log' }) }}>Log</button>
        <button className={`nav-tab${view === 'about' ? ' active' : ''}`} onClick={() => { setView('about'); pushHash({ view: 'about' }) }}>About</button>
        {!hasPassword() && (
          <button
            className="nav-tab"
            onClick={() => setPasswordGateMode('setup')}
            title="Enable encryption for your settings"
            style={{ marginLeft: 'auto', color: 'var(--text-dim)' }}
          >
            🔓 Encrypt
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
        <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
          <ModelPicker
            mode={mode}
            setMode={setMode}
            localModel={localModel || ''}
            setLocalModel={setLocalModel}
            api={api}
            setApi={setApi}
            loadState={loadState}
            onLoadLocal={() => void loadLocal()}
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
            onClick={async () => {
              if (currentSessionId && messages.length > 0) {
                await saveCurrentSession(messages, display, currentSessionId)
              }
              setMessages([])
              setDisplay([])
              setTodos([])
              setJournal([])
              setCurrentSessionId(null)
              sessionNameRef.current = 'New chat'
              setSessionName('New chat')
              sessionNamedRef.current = false
              sessionCreatedAtRef.current = Date.now()
              setHistoryRefreshKey((k) => k + 1)
              setSidebarOpen(false)
              replaceHash({ view: 'chat' })
            }}
            disabled={busy}
          >
            New chat
          </button>
          <HistoryPanel
            currentSessionId={currentSessionId}
            onLoad={loadSessionById}
            onDelete={deleteSessionById}
            refreshKey={historyRefreshKey}
          />
          <SkillsPanel
            disabled={busy}
            skills={skills}
            onSkillsChange={setSkills}
          />
          <McpPanel disabled={busy} onToolsChange={setMcpTools} />
          <PluginsPanel disabled={busy} plugins={plugins} onPluginsChange={setPlugins} />
        </aside>
        <section className="chat" style={{ position: 'relative' }}>
          {view === 'settings' && (
            <SettingsPage
              onClose={() => { setView('chat'); pushHash({ view: 'chat', sessionId: currentSessionId || undefined }) }}
              temperature={agentSettings.temperature}
              topP={agentSettings.topP}
              maxTokens={agentSettings.maxTokens}
              presencePenalty={agentSettings.presencePenalty}
              frequencyPenalty={agentSettings.frequencyPenalty}
              maxContextMessages={agentSettings.maxContextMessages}
              maxContextTokens={agentSettings.maxContextTokens ?? 0}
              maxIterations={agentSettings.maxIterations ?? 50}
              theme={theme}
              systemPrompt={systemPrompt}
              onTemperature={(v) => setAgentSettings({ ...agentSettings, temperature: v })}
              onTopP={(v) => setAgentSettings({ ...agentSettings, topP: v })}
              onMaxTokens={(v) => setAgentSettings({ ...agentSettings, maxTokens: v })}
              onPresencePenalty={(v) => setAgentSettings({ ...agentSettings, presencePenalty: v })}
              onFrequencyPenalty={(v) => setAgentSettings({ ...agentSettings, frequencyPenalty: v })}
              onMaxContextMessages={(v) => setAgentSettings({ ...agentSettings, maxContextMessages: v })}
              onMaxContextTokens={(v) => setAgentSettings({ ...agentSettings, maxContextTokens: v })}
              onMaxIterations={(v) => setAgentSettings({ ...agentSettings, maxIterations: v })}
              onTheme={setTheme}
              onSystemPrompt={setSystemPrompt}
              onChangePassword={handleChangePassword}
              onRemoveAllData={handleRemoveAllData}
              onGetFullPrompt={async () => {
                const { index: memIdx, files: memFiles } = await readAllMemories()
                const tools = buildTools()
                return buildDebugPrompt(systemPrompt, getAllSkills(), memIdx, memFiles, tools)
              }}
            />
          )}
          {view === 'files' && (
            <FileManager onClose={() => { setView('chat'); pushHash({ view: 'chat', sessionId: currentSessionId || undefined }) }} />
          )}
          <div style={{ display: view === 'terminal' ? 'flex' : 'none', flex: 1, flexDirection: 'column', minHeight: 0 }}>
            <Terminal onClose={() => { setView('chat'); pushHash({ view: 'chat', sessionId: currentSessionId || undefined }) }} active={view === 'terminal'} />
          </div>
          {view === 'log' && <LogPanel />}
          {view === 'about' && <AboutPanel />}
          {view === 'goal' && (
            <GoalPanel onClose={() => { setView('chat'); pushHash({ view: 'chat', sessionId: currentSessionId || undefined }) }} />
          )}
          {view === 'schedule' && (
            <SchedulePanel onClose={() => { setView('chat'); pushHash({ view: 'chat', sessionId: currentSessionId || undefined }) }} />
          )}
          {view === 'chat' && (
            <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                <MessageList
                  items={display}
                  onContinue={handleContinue}
                  busy={busy}
                  onRevert={(i) => void handleRevert(i, false)}
                  onEditRerun={(i) => void handleRevert(i, true)}
                  onQuote={(text) => setDraft({ text: `> ${text.split('\n').join('\n> ')}\n`, nonce: Date.now(), mode: 'append' })}
                  onPreview={(html) => setPreview({ title: 'Preview', html })}
                />
                <TodoPanel todos={todos} />
                <Composer
                  busy={busy}
                  onSend={send}
                  onStop={() => abortRef.current?.abort()}
                  onCommand={handleCommand}
                  commands={allCommands}
                  draft={draft}
                />
              </div>
              {preview && <PreviewPane source={preview} onClose={() => setPreview(null)} />}
            </div>
          )}
        </section>
      </div>
      {passwordGateMode === 'setup' && (
        <PasswordGate
          mode="setup"
          onSubmit={handlePasswordSubmit}
          onSkip={handlePasswordSkip}
        />
      )}
    </div>
  )
}
