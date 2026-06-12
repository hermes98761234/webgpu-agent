import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { McpServerConfig, ToolDef } from '../types'

export interface McpConnection {
  config: McpServerConfig
  client: Client
  tools: ToolDef[]
}

export function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_')
}

export async function connectMcpServer(config: McpServerConfig): Promise<McpConnection> {
  const client = new Client({ name: 'webgpu-agent', version: '0.1.0' })
  const transport = new StreamableHTTPClientTransport(new URL(config.url))
  await client.connect(transport)
  const { tools } = await client.listTools()
  const prefix = sanitizeName(config.name)
  const defs: ToolDef[] = tools.map((t) => ({
    name: `${prefix}__${t.name}`,
    description: t.description ?? '',
    parameters: (t.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
    source: 'mcp',
    async execute(args) {
      const result = await client.callTool({ name: t.name, arguments: args })
      const parts = Array.isArray(result.content) ? result.content : []
      const text = parts
        .map((p: { type?: string; text?: string }) => (p.type === 'text' ? (p.text ?? '') : `[${String(p.type)} content]`))
        .join('\n')
      return result.isError ? `Error: ${text}` : text || '(empty result)'
    },
  }))
  return { config, client, tools: defs }
}

export async function disconnectMcp(conn: McpConnection): Promise<void> {
  try {
    await conn.client.close()
  } catch {
    // already closed
  }
}

const KEY = 'webgpu-agent.mcpServers'

export function loadMcpServers(): McpServerConfig[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as McpServerConfig[]) : []
  } catch {
    return []
  }
}

export function saveMcpServers(servers: McpServerConfig[]): void {
  localStorage.setItem(KEY, JSON.stringify(servers))
}
