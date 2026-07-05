import { useEffect, useState } from 'react'
import { pfs } from '../fs/setup'
import { CONSOLE_CAPTURE, inlineAssets } from '../preview/inline'

export interface PreviewSource {
  title: string
  html?: string
  path?: string
}

async function readBytes(path: string): Promise<Uint8Array | null> {
  try {
    const data = await pfs.readFile(path)
    return typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data as Uint8Array)
  } catch {
    return null
  }
}

export function PreviewPane({ source, onClose }: { source: PreviewSource; onClose: () => void }) {
  const [doc, setDoc] = useState('')
  const [logs, setLogs] = useState<Array<{ level: string; text: string }>>([])
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let live = true
    void (async () => {
      let html = source.html ?? ''
      if (source.path) {
        const bytes = await readBytes(source.path)
        html = bytes
          ? await inlineAssets(new TextDecoder().decode(bytes), source.path, readBytes)
          : `<p style="color:red">File not found: ${source.path}</p>`
      }
      if (live) {
        setLogs([])
        setDoc(CONSOLE_CAPTURE + html)
      }
    })()
    return () => {
      live = false
    }
  }, [source, nonce])

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data && e.data.__preview) {
        setLogs((l) => [...l.slice(-99), { level: String(e.data.level), text: String(e.data.text) }])
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  return (
    // ponytail: fixed 45% split, add mobile overlay if users ask
    <div className="preview-pane" style={{ display: 'flex', flexDirection: 'column', width: '45%', minWidth: 280, borderLeft: '1px solid var(--border, #444)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderBottom: '1px solid var(--border, #444)' }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.title}</span>
        <button title="Reload from files" onClick={() => setNonce((n) => n + 1)}>↻</button>
        <button title="Close preview" onClick={onClose}>✕</button>
      </div>
      <iframe sandbox="allow-scripts" srcDoc={doc} title="preview" style={{ flex: 1, border: 0, background: '#fff' }} />
      {logs.length > 0 && (
        <div style={{ maxHeight: 120, overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.75em', padding: 4, borderTop: '1px solid var(--border, #444)' }}>
          {logs.map((l, i) => (
            <div key={i} style={{ color: l.level === 'error' ? '#f66' : l.level === 'warn' ? '#fc6' : 'inherit' }}>{l.text}</div>
          ))}
        </div>
      )}
    </div>
  )
}
