import { useRef, useState } from 'react'
import type { SlashCommand } from '../types'

export type { SlashCommand }

interface ComposerProps {
  busy: boolean
  onSend: (text: string) => void
  onStop: () => void
  onCommand?: (command: string, args: string) => void
  commands?: SlashCommand[]
}

const THINKING_STYLE = `
@keyframes agentPulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
.agent-thinking-dot {
  animation: agentPulse 1.2s ease-in-out infinite;
}
.agent-thinking-dot:nth-child(2) {
  animation-delay: 0.2s;
}
.agent-thinking-dot:nth-child(3) {
  animation-delay: 0.4s;
}
`

export function Composer({ busy, onSend, onStop, onCommand, commands = [] }: ComposerProps) {
  const [text, setText] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const filtered = text.startsWith('/')
    ? commands.filter((c) =>
        `/${c.name}`.startsWith(text.split(' ')[0].toLowerCase()) ||
        c.name.toLowerCase().startsWith(text.slice(1).split(' ')[0].toLowerCase())
      )
    : []

  const showDropdown = filtered.length > 0

  const selectCommand = (cmd: SlashCommand) => {
    const rest = text.includes(' ') ? text.slice(text.indexOf(' ') + 1) : ''
    setText('')
    if (onCommand) {
      onCommand(cmd.name, rest)
    }
  }

  const submit = () => {
    const t = text.trim()
    if (!t || busy) return

    if (t.startsWith('/') && onCommand) {
      const parts = t.slice(1).split(' ')
      const cmdName = parts[0].toLowerCase()
      const args = parts.slice(1).join(' ')
      const matched = commands.find((c) => c.name.toLowerCase() === cmdName)
      if (matched) {
        setText('')
        onCommand(matched.name, args)
        return
      }
    }

    setText('')
    onSend(t)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showDropdown && filtered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => (i + 1) % filtered.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        selectCommand(filtered[selectedIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setText('')
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const wrapperStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    borderTop: '1px solid var(--border)',
  }

  const thinkingBarStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 16px',
    fontSize: '13px',
    color: 'var(--text-dim)',
    borderBottom: '1px solid var(--border)',
  }

  const composerRowStyle: React.CSSProperties = {
    display: 'flex',
    gap: '8px',
    padding: '12px 16px',
    position: 'relative',
  }

  const dropdownStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    background: 'var(--bg-alt)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    overflow: 'hidden',
    zIndex: 50,
    marginBottom: '4px',
  }

  return (
    <div style={wrapperStyle}>
      <style>{THINKING_STYLE}</style>

      {busy && (
        <div style={thinkingBarStyle}>
          <span className="agent-thinking-dot" style={{ fontSize: '8px' }}>⬤</span>
          <span className="agent-thinking-dot" style={{ fontSize: '8px' }}>⬤</span>
          <span className="agent-thinking-dot" style={{ fontSize: '8px' }}>⬤</span>
          <span>Agent is thinking…</span>
        </div>
      )}

      <div style={composerRowStyle}>
        {showDropdown && filtered.length > 0 && (
          <div style={dropdownStyle}>
            {filtered.map((cmd, i) => (
              <div
                key={cmd.name}
                onClick={() => selectCommand(cmd)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  background: i === selectedIndex ? 'rgba(79,156,249,0.18)' : 'transparent',
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                }}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                {cmd.icon && (
                  <span style={{ fontSize: '16px', flexShrink: 0 }}>{cmd.icon}</span>
                )}
                <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--accent)' }}>
                  /{cmd.name}
                </span>
                <span style={{ fontSize: '13px', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {cmd.description}
                </span>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={text}
          placeholder="Ask the agent… (Enter to send, Shift+Enter for newline, / for commands)"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          style={{ flex: 1, resize: 'none' }}
        />
        {busy ? (
          <button onClick={onStop}>Stop</button>
        ) : (
          <button onClick={submit} disabled={!text.trim()}>Send</button>
        )}
      </div>
    </div>
  )
}
