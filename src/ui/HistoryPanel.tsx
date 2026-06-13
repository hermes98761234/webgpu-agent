import { useEffect, useState } from 'react'
import { listSessions, type SessionMeta } from '../store/sessions'

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}

interface HistoryPanelProps {
  currentSessionId: string | null
  onLoad: (id: string) => void
  onDelete: (id: string) => void
  refreshKey: number
}

export function HistoryPanel({ currentSessionId, onLoad, onDelete, refreshKey }: HistoryPanelProps) {
  const [sessions, setSessions] = useState<SessionMeta[]>([])

  useEffect(() => {
    listSessions().then(setSessions)
  }, [refreshKey, currentSessionId])

  return (
    <details className="panel">
      <summary>History</summary>
      {sessions.length === 0 ? (
        <p className="dim" style={{ margin: '8px 0', fontSize: 12 }}>No saved chats yet.</p>
      ) : (
        <ul className="history-list">
          {sessions.map((s) => (
            <li key={s.id} className={`history-item${s.id === currentSessionId ? ' active' : ''}`}>
              <button
                className="history-load"
                onClick={() => onLoad(s.id)}
                title={s.preview}
              >
                <span className="history-name">{s.name}</span>
                <span className="history-date dim">{relativeTime(s.updatedAt)}</span>
              </button>
              <button
                className="history-delete"
                onClick={() => {
                  if (window.confirm(`Delete "${s.name}"?`)) onDelete(s.id)
                }}
                title="Delete chat"
                aria-label="Delete chat"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}
