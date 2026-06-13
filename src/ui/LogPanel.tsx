import { useEffect, useRef, useState } from 'react'
import { clearLog, getEntries, subscribe, type LogEntry, type LogLevel } from './logStore'

export function LogPanel() {
  const [, tick] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => subscribe(() => tick((n) => n + 1)), [])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    // Auto-scroll only when already near the bottom
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (nearBottom) bottomRef.current?.scrollIntoView({ block: 'end' })
  })

  const entries = getEntries()

  return (
    <div className="log-panel">
      <div className="log-toolbar">
        <span className="dim">{entries.length} entries</span>
        <button className="log-clear-btn" onClick={clearLog}>Clear</button>
      </div>
      <div className="log-entries" ref={listRef}>
        {entries.length === 0 && (
          <div className="log-empty">No entries yet — LLM requests, console output, and JS errors appear here.</div>
        )}
        {entries.map((e) => <LogRow key={e.id} entry={e} />)}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

const LEVEL_CLASS: Record<LogLevel, string> = {
  log: 'log-lvl-log',
  info: 'log-lvl-info',
  warn: 'log-lvl-warn',
  error: 'log-lvl-error',
  debug: 'log-lvl-debug',
}

function LogRow({ entry }: { entry: LogEntry }) {
  const time = new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  if (entry.kind === 'console') {
    const isErr = entry.level === 'error'
    const isWarn = entry.level === 'warn'
    return (
      <div className={`log-row ${LEVEL_CLASS[entry.level]}${isErr ? ' log-row-error' : isWarn ? ' log-row-warn' : ''}`}>
        <span className="log-time">{time}</span>
        <span className="log-tag">{entry.level}</span>
        <span className="log-text">{entry.text}</span>
      </div>
    )
  }

  if (entry.kind === 'js-error') {
    return (
      <div className="log-row log-row-error">
        <span className="log-time">{time}</span>
        <span className="log-tag">js error</span>
        <span className="log-text">{entry.text}</span>
      </div>
    )
  }

  if (entry.kind === 'llm-request') {
    const msgs = entry.messages as Array<{ role: string; content: string }>
    const lastUser = [...msgs].reverse().find((m) => m.role === 'user')
    const preview = lastUser ? truncate(lastUser.content, 100) : `${msgs.length} messages`
    return (
      <details className="log-row log-row-request">
        <summary>
          <span className="log-time">{time}</span>
          <span className="log-tag log-tag-request">→ request</span>
          <span className="log-text log-preview">{msgs.length} msgs · {preview}</span>
        </summary>
        <pre className="log-json">{JSON.stringify(entry.messages, null, 2)}</pre>
      </details>
    )
  }

  // llm-response
  return (
    <details className="log-row log-row-response">
      <summary>
        <span className="log-time">{time}</span>
        <span className="log-tag log-tag-response">← response</span>
        <span className="log-text log-preview">{truncate(entry.content, 120)}</span>
      </summary>
      <pre className="log-json">{entry.content}</pre>
    </details>
  )
}

function truncate(s: string, n: number) {
  const flat = s.replace(/\n/g, ' ')
  return flat.length > n ? flat.slice(0, n) + '…' : flat
}
