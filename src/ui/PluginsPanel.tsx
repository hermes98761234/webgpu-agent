import { useState } from 'react'
import { deletePlugin, savePlugins, upsertPlugin } from '../plugins/store'
import type { Plugin } from '../types'

interface PluginsPanelProps {
  disabled: boolean
  plugins: Plugin[]
  onPluginsChange: (plugins: Plugin[]) => void
}

export function PluginsPanel({ disabled, plugins, onPluginsChange }: PluginsPanelProps) {
  const [urlInput, setUrlInput] = useState('')
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState('')

  const installFromUrl = async () => {
    const url = urlInput.trim()
    if (!url) return
    setInstalling(true)
    setError('')
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: unknown = await res.json()
      if (typeof json !== 'object' || json === null || !('name' in json)) {
        throw new Error('Invalid plugin manifest: missing "name" field')
      }
      const manifest = json as Record<string, unknown>
      const plugin: Plugin = {
        id: crypto.randomUUID(),
        name: String(manifest.name ?? ''),
        description: String(manifest.description ?? ''),
        version: manifest.version ? String(manifest.version) : undefined,
        author:
          manifest.author && typeof manifest.author === 'object' && 'name' in manifest.author
            ? { name: String((manifest.author as Record<string, unknown>).name) }
            : undefined,
        homepage: manifest.homepage ? String(manifest.homepage) : undefined,
        enabled: true,
        skills: Array.isArray(manifest.skills) ? (manifest.skills as Plugin['skills']) : [],
        commands: Array.isArray(manifest.commands) ? (manifest.commands as Plugin['commands']) : [],
      }
      if (!plugin.name) throw new Error('Plugin manifest must have a non-empty "name"')
      const next = upsertPlugin(plugins, plugin)
      onPluginsChange(next)
      setUrlInput('')
    } catch (e) {
      setError(String(e))
    } finally {
      setInstalling(false)
    }
  }

  const toggleEnabled = (id: string) => {
    const next = plugins.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p))
    savePlugins(next)
    onPluginsChange(next)
  }

  const remove = (id: string) => {
    onPluginsChange(deletePlugin(plugins, id))
  }

  return (
    <details className="panel">
      <summary>
        Plugins ({plugins.filter((p) => p.enabled).length}/{plugins.length})
      </summary>
      {plugins.map((p) => (
        <div key={p.id} className="row panel-item" style={{ opacity: p.enabled ? 1 : 0.5 }}>
          <span
            title={`${p.description}${p.version ? ` v${p.version}` : ''}${p.homepage ? '\n' + p.homepage : ''}`}
            style={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 13,
            }}
          >
            {p.name}
          </span>
          <button
            onClick={() => toggleEnabled(p.id)}
            disabled={disabled}
            title={p.enabled ? 'Disable plugin' : 'Enable plugin'}
            style={{ fontSize: 11, minWidth: 32 }}
          >
            {p.enabled ? 'on' : 'off'}
          </button>
          <button onClick={() => remove(p.id)} disabled={disabled}>
            ✕
          </button>
        </div>
      ))}
      <div className="col" style={{ gap: 4, marginTop: 4 }}>
        <input
          placeholder="Plugin manifest URL"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !installing && installFromUrl()}
          disabled={disabled || installing}
        />
        {error && <span style={{ fontSize: 11, color: 'var(--error)' }}>{error}</span>}
        <button
          onClick={installFromUrl}
          disabled={disabled || installing || !urlInput.trim()}
        >
          {installing ? 'Installing…' : '+ Install from URL'}
        </button>
      </div>
    </details>
  )
}
