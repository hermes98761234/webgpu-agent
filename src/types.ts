export type Role = 'system' | 'user' | 'assistant' | 'tool'

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface ChatMessage {
  role: Role
  content: string
  toolCalls?: ToolCall[]
  toolCallId?: string
}

export interface ToolDef {
  name: string
  description: string
  parameters: Record<string, unknown>
  source: 'builtin' | 'skill' | 'mcp'
  execute(args: Record<string, unknown>): Promise<string>
}

export interface ChatResult {
  content: string
  toolCalls: ToolCall[]
}

export interface AgentSettings {
  temperature: number
  topP: number
  maxTokens: number
  presencePenalty: number
  frequencyPenalty: number
  maxContextMessages: number
  /** Token budget for conversation history (0 = auto from model context window). */
  maxContextTokens: number
  maxIterations: number
}

export interface Provider {
  supportsNativeTools: boolean
  extraHeaders?(): Record<string, string>
  chat(
    messages: ChatMessage[],
    tools: ToolDef[],
    onDelta: (text: string) => void,
    signal?: AbortSignal,
    settings?: AgentSettings,
  ): Promise<ChatResult>
}

export interface ApiConfig {
  kind: 'openai' | 'anthropic' | 'google' | 'openrouter' | 'groq' | 'deepseek' | 'mistral' | 'custom'
  baseUrl: string
  apiKey: string
  model: string
  /** Min seconds between requests to this provider (0/undefined = off). For free-tier RPM limits, e.g. 10 RPM -> 6. */
  minRequestIntervalSec?: number
}

export interface Skill {
  id: string
  name: string
  description: string
  instructions: string
}

export interface McpServerConfig {
  id: string
  name: string
  url: string
  /** Optional CORS proxy: a prefix URL, or a template containing "{url}". */
  proxy?: string
}

export interface SlashCommand {
  name: string
  description: string
  icon?: string
}

export interface PluginSkill {
  name: string
  description: string
  instructions: string
}

export interface PluginCommand {
  name: string
  description: string
  icon?: string
  template?: string
}

export interface Plugin {
  id: string
  name: string
  description: string
  version?: string
  author?: { name: string }
  homepage?: string
  enabled: boolean
  skills: PluginSkill[]
  commands: PluginCommand[]
}

export type AgentEvent =
  | { type: 'assistant_delta'; text: string }
  | { type: 'assistant_message'; message: ChatMessage }
  | { type: 'tool_start'; call: ToolCall }
  | { type: 'tool_result'; call: ToolCall; result: string; isError: boolean }
  | { type: 'error'; error: string }
  | { type: 'iteration_limit'; count: number }
  | { type: 'status'; text: string }
  | { type: 'llm_request'; messages: ChatMessage[] }
  | { type: 'llm_response'; content: string }

export interface Goal {
  id: string
  title: string
  description?: string
  deadline?: number
  status: 'active' | 'completed' | 'cancelled'
  createdAt: number
  completedAt?: number
}

export interface TodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

export interface ScheduleItem {
  id: string
  title: string
  description?: string
  intervalMs?: number
  nextRun: number
  lastRun?: number
  status: 'active' | 'paused' | 'completed'
  createdAt: number
}
