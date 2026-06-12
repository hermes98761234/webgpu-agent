import { useRef, useState } from 'react'
import { runAgent } from './agent/loop'
import { ApiProvider } from './providers/api'
import { LocalProvider, presetModels } from './providers/local'
import { builtinTools } from './tools/builtin'
import { fsTools } from './tools/fs'
import { gitTools } from './tools/git'
import { webTools } from './tools/web'
import { makeSpawnAgentTool } from './tools/multiagent'
import { loadSkills, makeUseSkillTool, upsertSkill } from './skills/store'
import { seedDefaultSkills } from './skills/defaults'
import { setStorePassword, detectEncryptionEnabled, hasPassword, clearAllStoreData } from './store/index'
import { loadPlugins } from './plugins/store'
import type { AgentEvent, AgentSettings, ApiConfig, ChatMessage, Plugin, Provider, Skill, SlashCommand, ToolDef } from './types'
import { Composer } from './ui/Composer'
import { MessageList, type DisplayItem } from './ui/MessageList'
import { ModelPicker, type ProviderMode } from './ui/ModelPicker'
import { usePersistedState } from './ui/usePersistedState'
import { SkillsPanel } from './ui/SkillsPanel'
import { McpPanel } from './ui/McpPanel'
import { PasswordGate } from './ui/PasswordGate'
import { SettingsPage } from './ui/SettingsPage'
import { SkillsGallery } from './ui/SkillsGallery'
import { PluginsPanel } from './ui/PluginsPanel'

const localProvider = new LocalProvider()

// Seed built-in skills on first load (idempotent)
seedDefaultSkills()

const DEFAULT_SETTINGS: AgentSettings = {
  temperature: 0.7,
  topP: 1.0,
  maxTokens: 2048,
  presencePenalty: 0,
  frequencyPenalty: 0,
  maxContextMessages: 40,
}

const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'clear', description: 'Clear the chat history', icon: '🗑️' },
  { name: 'settings', description: 'Open settings', icon: '⚙️' },
  { name: 'gallery', description: 'Browse skills gallery', icon: '🏪' },
  { name: 'skills', description: 'Manage skills', icon: '🎯' },
  { name: 'mcp', description: 'Manage MCP servers', icon: '🔌' },
  { name: 'help', description: 'Show available commands and tools', icon: '❓' },
  { name: 'git status', description: 'Show git repository status', icon: '🔀' },
  { name: 'ls', description: 'List files in current directory', icon: '📁' },
  { name: 'agent', description: 'Spawn a sub-agent with a task', icon: '🤖' },
]

type View = 'chat' | 'settings' | 'gallery'
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
  const [systemPrompt, setSystemPrompt] = usePersistedState(
    'webgpu-agent.systemPrompt',
    'You are a helpful agent running entirely in the user browser. You have access to file system tools (fs_*), git tools (git_*), web tools (weather_lookup, web_search), and can spawn sub-agents (spawn_agent). Use tools when they help.',
  )
  const [agentSettings, setAgentSettings] = usePersistedState<AgentSettings>(
    'webgpu-agent.settings',
    DEFAULT_SETTINGS,
  )

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [display, setDisplay] = useState<DisplayItem[]>([])
  const [busy, setBusy] = useState(false)
  const [loadState, setLoadState] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; text: string }>({
    status: 'idle',
    text: '',
  })
  const [mcpTools, setMcpTools] = useState<ToolDef[]>([])
  const [view, setView] = useState<View>('chat')
  const [passwordGateMode, setPasswordGateMode] = useState<PasswordGateMode>(() => {
    if (detectEncryptionEnabled()) return 'unlock'
    return null
  })
  const [isUnlocked, setIsUnlocked] = useState(() => !detectEncryptionEnabled())
  const [skills, setSkills] = useState<Skill[]>(() => loadSkills())
  const [plugins, setPlugins] = useState<Plugin[]>(() => loadPlugins())
  const abortRef = useRef<AbortController | null>(null)
  const providerRef = useRef<Provider | null>(null)
  const toolsRef = useRef<ToolDef[]>([])

  if (!localModel) {
    setLocalModel(presetModels()[0] ?? '')
  }

  const getProvider = (): Provider => providerRef.current!
  const getTools = (): ToolDef[] => toolsRef.current

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

  const buildTools = (): ToolDef[] => {
    const allSkills: Skill[] = [
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
    const spawnTool = makeSpawnAgentTool(getProvider, getTools)
    return [
      ...builtinTools,
      ...fsTools,
      ...gitTools,
      ...webTools,
      makeUseSkillTool(() => allSkills),
      spawnTool,
      ...mcpTools,
    ]
  }

  const send = async (text: string) => {
    if (busy) return
    setBusy(true)
    const rawHistory: ChatMessage[] = [...messages, { role: 'user', content: text }]
    const history = trimContext(rawHistory, agentSettings.maxContextMessages)
    setMessages(history)
    setDisplay((d) => [...d, { kind: 'user', text }])
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
    const final = await runAgent(history, provider, tools, systemPrompt, handleEvent, abort.signal, agentSettings)
    setMessages(final)
    setBusy(false)
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
      return
    }
    if (command === 'settings') {
      setView('settings')
      return
    }
    if (command === 'gallery') {
      setView('gallery')
      return
    }
    if (command === 'help') {
      setDisplay((d) => [...d, {
        kind: 'assistant',
        text: `## Available Commands\n\n${allCommands.map((c) => `**/${c.name}** — ${c.description}`).join('\n')}\n\n## Available Tools\n\nBuilt-in: get_time, fetch_url, run_javascript\nFile system: fs_read, fs_write, fs_list, fs_delete, fs_mkdir, fs_move\nGit: git_init, git_status, git_add, git_commit, git_log, git_push, git_pull, git_clone, git_diff\nWeb: weather_lookup, web_search\nAgent: spawn_agent, use_skill`,
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

  const handlePasswordSubmit = (password: string) => {
    setStorePassword(password)
    setIsUnlocked(true)
    setPasswordGateMode(null)
  }

  const handlePasswordSkip = () => {
    setIsUnlocked(true)
    setPasswordGateMode(null)
  }

  const handleChangePassword = () => {
    setPasswordGateMode('setup')
  }

  const handleRemoveAllData = () => {
    clearAllStoreData()
    setMessages([])
    setDisplay([])
    window.location.reload()
  }

  const handleInstallSkill = (skill: Omit<Skill, 'id'>) => {
    const newSkill: Skill = { ...skill, id: crypto.randomUUID() }
    const next = upsertSkill(skills, newSkill)
    setSkills(next)
    setDisplay((d) => [...d, {
      kind: 'assistant',
      text: `✓ Skill "${skill.name}" installed successfully.`,
    }])
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
        <span style={{ fontWeight: 700, fontSize: 15, marginRight: 8, color: 'var(--text)' }}>WebGPU Agent</span>
        <button className={`nav-tab${view === 'chat' ? ' active' : ''}`} onClick={() => setView('chat')}>Chat</button>
        <button className={`nav-tab${view === 'settings' ? ' active' : ''}`} onClick={() => setView('settings')}>Settings</button>
        <button className={`nav-tab${view === 'gallery' ? ' active' : ''}`} onClick={() => setView('gallery')}>Gallery</button>
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
        <aside className="sidebar">
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
          <SkillsPanel
            disabled={busy}
            skills={skills}
            onSkillsChange={setSkills}
            onOpenGallery={() => setView('gallery')}
          />
          <McpPanel disabled={busy} onToolsChange={setMcpTools} />
          <PluginsPanel disabled={busy} plugins={plugins} onPluginsChange={setPlugins} />
        </aside>
        <section className="chat" style={{ position: 'relative' }}>
          {view === 'settings' && (
            <SettingsPage
              onClose={() => setView('chat')}
              temperature={agentSettings.temperature}
              topP={agentSettings.topP}
              maxTokens={agentSettings.maxTokens}
              presencePenalty={agentSettings.presencePenalty}
              frequencyPenalty={agentSettings.frequencyPenalty}
              maxContextMessages={agentSettings.maxContextMessages}
              theme="dark"
              systemPrompt={systemPrompt}
              onTemperature={(v) => setAgentSettings({ ...agentSettings, temperature: v })}
              onTopP={(v) => setAgentSettings({ ...agentSettings, topP: v })}
              onMaxTokens={(v) => setAgentSettings({ ...agentSettings, maxTokens: v })}
              onPresencePenalty={(v) => setAgentSettings({ ...agentSettings, presencePenalty: v })}
              onFrequencyPenalty={(v) => setAgentSettings({ ...agentSettings, frequencyPenalty: v })}
              onMaxContextMessages={(v) => setAgentSettings({ ...agentSettings, maxContextMessages: v })}
              onTheme={() => {}}
              onSystemPrompt={setSystemPrompt}
              onChangePassword={handleChangePassword}
              onRemoveAllData={handleRemoveAllData}
            />
          )}
          {view === 'gallery' && (
            <SkillsGallery
              onInstall={handleInstallSkill}
              onClose={() => setView('chat')}
            />
          )}
          <MessageList items={display} />
          <Composer
            busy={busy}
            onSend={send}
            onStop={() => abortRef.current?.abort()}
            onCommand={handleCommand}
            commands={allCommands}
          />
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
