import { useEffect, useRef, useState } from 'react'
import {
  connectMcpServer,
  disconnectMcp,
  loadMcpServers,
  saveMcpServers,
  type McpConnection,
} from '../mcp/manager'
import type { McpServerConfig, ToolDef } from '../types'

export function McpPanel({ disabled, onToolsChange }: {
  disabled: boolean
  onToolsChange: (tools: ToolDef[]) => void
}) {
  const [servers, setServers] = useState<McpServerConfig[]>([])
  const [status, setStatus] = useState<Record<string, string>>({})
  const connections = useRef<Map<string, McpConnection>>(new Map())
  const [draft, setDraft] = useState<{ name: string; url: string; proxy: string } | null>(null)

  const publishTools = () => {
    const all: ToolDef[] = []
    for (const conn of connections.current.values()) all.push(...conn.tools)
    onToolsChange(all)
  }

  const connect = async (cfg: McpServerConfig) => {
    const existing = connections.current.get(cfg.id)
    if (existing) {
      connections.current.delete(cfg.id)
      void disconnectMcp(existing)
    }
    setStatus((s) => ({ ...s, [cfg.id]: 'connecting…' }))
    try {
      const conn = await connectMcpServer(cfg)
      connections.current.set(cfg.id, conn)
      setStatus((s) => ({ ...s, [cfg.id]: `connected — ${conn.tools.length} tools` }))
      publishTools()
    } catch (e) {
      setStatus((s) => ({ ...s, [cfg.id]: `error: ${String(e)} (server must allow CORS)` }))
    }
  }

  const remove = async (id: string) => {
    const conn = connections.current.get(id)
    if (conn) {
      await disconnectMcp(conn)
      connections.current.delete(id)
      publishTools()
    }
    const next = servers.filter((s) => s.id !== id)
    setServers(next)
    saveMcpServers(next)
  }

  // Load saved servers from /home/user/.agent/mcp.json and auto-connect them
  // on mount so their tools are available immediately.
  useEffect(() => {
    const conns = connections.current
    void (async () => {
      const saved = await loadMcpServers()
      setServers(saved)
      for (const s of saved) void connect(s)
    })()
    return () => {
      for (const conn of conns.values()) void disconnectMcp(conn)
      conns.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <details className="panel">
      <summary>MCP servers ({servers.length})</summary>
      <p className="dim">
        Remote MCP servers over Streamable HTTP, saved in /home/user/.agent/mcp.json. The server must allow
        browser (CORS) access — nothing in the browser sandbox (including WASM) can bypass CORS. If the server
        doesn't send CORS headers, set a CORS proxy that forwards requests.
      </p>
      {servers.map((s) => (
        <div key={s.id} className="col panel-item">
          <div className="row">
            <span title={s.url}>{s.name}</span>
            <button onClick={() => void connect(s)} disabled={disabled}>connect</button>
            <button onClick={() => void remove(s.id)} disabled={disabled}>✕</button>
          </div>
          {status[s.id] && <span className="dim">{status[s.id]}</span>}
        </div>
      ))}
      {draft ? (
        <div className="col">
          <input
            placeholder="name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <input
            placeholder="https://example.com/mcp"
            value={draft.url}
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
          />
          <input
            placeholder="CORS proxy (optional): prefix URL or template with {url}"
            value={draft.proxy}
            onChange={(e) => setDraft({ ...draft, proxy: e.target.value })}
          />
          <div className="row">
            <button
              disabled={!draft.name.trim() || !/^https?:\/\//.test(draft.url)}
              onClick={() => {
                const cfg: McpServerConfig = {
                  id: crypto.randomUUID(),
                  name: draft.name,
                  url: draft.url,
                  proxy: draft.proxy.trim() || undefined,
                }
                const next = [...servers, cfg]
                setServers(next)
                saveMcpServers(next)
                setDraft(null)
              }}
            >
              Save
            </button>
            <button onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setDraft({ name: '', url: '', proxy: '' })} disabled={disabled}>+ Add server</button>
      )}
    </details>
  )
}
