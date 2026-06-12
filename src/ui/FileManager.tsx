import { useCallback, useEffect, useState } from 'react'
import { ensureDir, pfs } from '../fs/setup'

interface Entry {
  name: string
  type: 'file' | 'directory' | 'unknown'
  size: number
}

interface Props {
  onClose: () => void
}

const join = (base: string, name: string) => (base === '/' ? `/${name}` : `${base}/${name}`)

async function deleteRecursive(p: string): Promise<void> {
  const stat = await pfs.stat(p)
  if (stat.isDirectory()) {
    const names = await pfs.readdir(p)
    for (const name of names) await deleteRecursive(join(p, name))
    await pfs.rmdir(p)
  } else {
    await pfs.unlink(p)
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function FileManager({ onClose }: Props) {
  const [path, setPath] = useState('/')
  const [entries, setEntries] = useState<Entry[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState<'file' | 'dir' | null>(null)
  const [newName, setNewName] = useState('')
  const [newFileContent, setNewFileContent] = useState('')
  const [dirty, setDirty] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const names: string[] = await pfs.readdir(path)
      const es = await Promise.all(
        names.map(async (name) => {
          try {
            const stat = await pfs.stat(join(path, name))
            return { name, type: stat.isDirectory() ? 'directory' : 'file', size: stat.size } as Entry
          } catch {
            return { name, type: 'unknown' as const, size: 0 }
          }
        }),
      )
      es.sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1
        if (a.type !== 'directory' && b.type === 'directory') return 1
        return a.name.localeCompare(b.name)
      })
      setEntries(es)
    } catch (e) {
      setError(String(e))
    }
    setLoading(false)
  }, [path])

  useEffect(() => {
    // Defer so the synchronous setState inside refresh() runs outside the effect body.
    const id = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(id)
  }, [refresh])

  const navigate = (name: string) => {
    setPath(join(path, name))
    setSelectedFile(null)
    setFileContent(null)
    setDirty(false)
  }

  const goUp = () => {
    if (path === '/') return
    const parent = path.substring(0, path.lastIndexOf('/')) || '/'
    setPath(parent)
    setSelectedFile(null)
    setFileContent(null)
    setDirty(false)
  }

  const openFile = async (name: string) => {
    const filePath = join(path, name)
    setSelectedFile(filePath)
    setDirty(false)
    try {
      const data = (await pfs.readFile(filePath, { encoding: 'utf8' })) as string
      setFileContent(data.length > 50000 ? data.slice(0, 50000) + '\n[truncated]' : data)
    } catch (e) {
      setFileContent(`Error: ${e}`)
    }
  }

  const saveFile = async () => {
    if (!selectedFile || fileContent === null) return
    try {
      await pfs.writeFile(selectedFile, fileContent, 'utf8')
      setDirty(false)
    } catch (e) {
      setError(String(e))
    }
  }

  const deleteEntry = async (entry: Entry) => {
    const p = join(path, entry.name)
    if (!window.confirm(`Delete "${p}"?`)) return
    try {
      if (entry.type === 'directory') {
        await deleteRecursive(p)
      } else {
        await pfs.unlink(p)
      }
      if (selectedFile === p) {
        setSelectedFile(null)
        setFileContent(null)
      }
      refresh()
    } catch (e) {
      setError(String(e))
    }
  }

  const createEntry = async () => {
    if (!newName.trim()) return
    const p = join(path, newName.trim())
    try {
      if (creating === 'dir') {
        await ensureDir(p)
      } else {
        const dir = p.substring(0, p.lastIndexOf('/')) || '/'
        await ensureDir(dir)
        await pfs.writeFile(p, newFileContent, 'utf8')
      }
      setCreating(null)
      setNewName('')
      setNewFileContent('')
      refresh()
    } catch (e) {
      setError(String(e))
    }
  }

  // Build breadcrumb segments
  const parts = path === '/' ? [] : path.slice(1).split('/')
  const crumbs = [
    { label: '/', path: '/' },
    ...parts.map((p, i) => ({ label: p, path: '/' + parts.slice(0, i + 1).join('/') })),
  ]

  return (
    <div className="overlay-page">
      <div className="overlay-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <h2>Files</h2>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 13 }}>
            {crumbs.map((crumb, i) => (
              <span key={crumb.path} style={{ display: 'flex', alignItems: 'center' }}>
                {i > 0 && <span style={{ color: 'var(--text-dim)', margin: '0 2px' }}>/</span>}
                <button
                  onClick={() => { setPath(crumb.path); setSelectedFile(null); setFileContent(null) }}
                  style={{
                    background: 'none', border: 'none', padding: '2px 4px', fontSize: 13,
                    color: i === crumbs.length - 1 ? 'var(--text)' : 'var(--accent)',
                    cursor: i === crumbs.length - 1 ? 'default' : 'pointer',
                  }}
                >
                  {crumb.label}
                </button>
              </span>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn-ghost" onClick={refresh} title="Refresh" style={{ padding: '4px 10px' }}>↺</button>
          <button className="btn-ghost" onClick={onClose} style={{ padding: '4px 10px' }}>✕</button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Directory listing */}
        <div style={{ width: selectedFile ? '38%' : '100%', display: 'flex', flexDirection: 'column', borderRight: selectedFile ? '1px solid var(--border)' : 'none' }}>
          {/* Toolbar */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, flexShrink: 0 }}>
            {path !== '/' && (
              <button className="btn-ghost" onClick={goUp} style={{ fontSize: 12, padding: '4px 8px' }}>↑ Up</button>
            )}
            <button
              className="btn-ghost"
              onClick={() => { setCreating('dir'); setNewName('') }}
              style={{ fontSize: 12, padding: '4px 8px' }}
            >
              + Folder
            </button>
            <button
              className="btn-ghost"
              onClick={() => { setCreating('file'); setNewName(''); setNewFileContent('') }}
              style={{ fontSize: 12, padding: '4px 8px' }}
            >
              + File
            </button>
          </div>

          {/* New entry form */}
          {creating && (
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--bg-alt)', flexShrink: 0 }}>
              <input
                autoFocus
                placeholder={creating === 'dir' ? 'Folder name' : 'File name'}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') createEntry(); if (e.key === 'Escape') setCreating(null) }}
                style={{ fontSize: 13 }}
              />
              {creating === 'file' && (
                <textarea
                  placeholder="Initial content (optional)"
                  value={newFileContent}
                  onChange={(e) => setNewFileContent(e.target.value)}
                  rows={3}
                  style={{ fontSize: 12, fontFamily: 'monospace' }}
                />
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={createEntry} style={{ fontSize: 12, padding: '4px 10px' }}>Create</button>
                <button className="btn-ghost" onClick={() => setCreating(null)} style={{ fontSize: 12, padding: '4px 10px' }}>Cancel</button>
              </div>
            </div>
          )}

          {error && <p className="warn" style={{ margin: 0, padding: '8px 12px', flexShrink: 0 }}>{error}</p>}

          {/* Entries */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading && <p className="dim" style={{ padding: '12px 16px' }}>Loading…</p>}
            {!loading && entries.length === 0 && (
              <p className="dim" style={{ padding: '12px 16px' }}>Empty directory</p>
            )}
            {entries.map((entry) => {
              const fullPath = join(path, entry.name)
              const isSelected = selectedFile === fullPath
              return (
                <div
                  key={entry.name}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                    borderBottom: '1px solid var(--border)',
                    background: isSelected ? 'rgba(79,156,249,0.1)' : 'transparent',
                    cursor: 'default',
                  }}
                >
                  <span style={{ fontSize: 15, flexShrink: 0 }}>{entry.type === 'directory' ? '📁' : '📄'}</span>
                  <span
                    style={{
                      flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      cursor: 'pointer',
                      color: entry.type === 'directory' ? 'var(--accent)' : 'var(--text)',
                    }}
                    onClick={() => entry.type === 'directory' ? navigate(entry.name) : openFile(entry.name)}
                    title={entry.name}
                  >
                    {entry.name}
                  </span>
                  {entry.type === 'file' && (
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>{formatSize(entry.size)}</span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteEntry(entry) }}
                    style={{ fontSize: 11, padding: '2px 6px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--error)', flexShrink: 0 }}
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* File editor */}
        {selectedFile && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: 'var(--text-dim)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedFile}
              </span>
              {dirty && (
                <button onClick={saveFile} style={{ fontSize: 12, padding: '4px 10px' }}>Save</button>
              )}
              <button
                className="btn-ghost"
                onClick={() => { setSelectedFile(null); setFileContent(null); setDirty(false) }}
                style={{ fontSize: 12, padding: '4px 8px' }}
              >
                ✕
              </button>
            </div>
            <textarea
              value={fileContent ?? ''}
              onChange={(e) => { setFileContent(e.target.value); setDirty(true) }}
              style={{
                flex: 1, resize: 'none', fontFamily: 'monospace', fontSize: 13,
                padding: 12, border: 'none', borderRadius: 0, background: 'var(--bg)',
                color: 'var(--text)', outline: 'none',
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
