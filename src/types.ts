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
}

export interface Provider {
  supportsNativeTools: boolean
  chat(
    messages: ChatMessage[],
    tools: ToolDef[],
    onDelta: (text: string) => void,
    signal?: AbortSignal,
    settings?: AgentSettings,
  ): Promise<ChatResult>
}

export interface ApiConfig {
  kind: 'openai' | 'openrouter' | 'custom'
  baseUrl: string
  apiKey: string
  model: string
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
  | { type: 'status'; text: string }
