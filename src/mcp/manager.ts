import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { AGENT_DIR, ensureDir, MCP_CONFIG, pfs } from '../fs/setup'
import type { McpServerConfig, ToolDef } from '../types'

export interface McpConnection {
  config: McpServerConfig
  client: Client
  tools: ToolDef[]
}

export function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_')
}

/**
 * Resolve the URL to connect to. WASM can't bypass CORS — everything in the
 * browser sandbox goes through fetch — so when the server itself doesn't send
 * CORS headers, the request must be routed through a proxy that does.
 * The proxy is either a prefix ("https://proxy.dev/" → proxy.dev/https://target)
 * or a template containing "{url}" which is replaced with the encoded target.
 */
export function resolveServerUrl(config: McpServerConfig): URL {
  const proxy = config.proxy?.trim()
  if (!proxy) return new URL(config.url)
  if (proxy.includes('{url}')) return new URL(proxy.replace('{url}', encodeURIComponent(config.url)))
  return new URL(`${proxy.replace(/\/+$/, '')}/${config.url}`)
}

export async function connectMcpServer(config: McpServerConfig): Promise<McpConnection> {
  const client = new Client({ name: 'webgpu-agent', version: '0.1.0' })
  const transport = new StreamableHTTPClientTransport(resolveServerUrl(config))
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

let cached: McpServerConfig[] = []

/** Read server list from /home/user/.agent/mcp.json */
export async function loadMcpServers(): Promise<McpServerConfig[]> {
  try {
    const raw = String(await pfs.readFile(MCP_CONFIG, 'utf8'))
    const parsed: unknown = JSON.parse(raw)
    const servers = (parsed as { servers?: unknown }).servers
    cached = Array.isArray(servers) ? (servers as McpServerConfig[]) : []
  } catch {
    cached = []
  }
  return cached
}

/** Last list read from or written to mcp.json (for sync consumers like /mcp). */
export function getMcpServersCached(): McpServerConfig[] {
  return cached
}

export async function persistMcpServers(servers: McpServerConfig[]): Promise<void> {
  cached = servers
  await ensureDir(AGENT_DIR)
  await pfs.writeFile(MCP_CONFIG, JSON.stringify({ servers }, null, 2), 'utf8')
}

export function saveMcpServers(servers: McpServerConfig[]): void {
  void persistMcpServers(servers).catch(console.error)
}
