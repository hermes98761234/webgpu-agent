import { useRef, useEffect } from 'react'

export type DisplayItem =
  | { kind: 'user'; text: string; cpId?: string }
  | { kind: 'assistant'; text: string; streaming?: boolean }
  | { kind: 'tool'; name: string; args: string; result?: string; isError?: boolean; startTime?: number; endTime?: number }
  | { kind: 'error'; text: string }
  | { kind: 'iteration_limit'; count: number }

const TYPING_STYLE = `
@keyframes typingPulse {
  0%, 100% { opacity: 0.2; }
  50% { opacity: 1; }
}
.typing-dots span {
  display: inline-block;
  animation: typingPulse 1.2s ease-in-out infinite;
  font-size: 10px;
}
.typing-dots span:nth-child(2) { animation-delay: 0.2s; }
.typing-dots span:nth-child(3) { animation-delay: 0.4s; }
`

function toolIcon(name: string): string {
  if (name.startsWith('fs_')) return '📁'
  if (name.startsWith('git_')) return '🔀'
  if (name.startsWith('weather_')) return '🌤️'
  if (name === 'web_search') return '🔍'
  if (name === 'spawn_agent') return '🤖'
  return '🔧'
}

/** Extract <webagent-ui>…</webagent-ui> blocks and return parts */
function splitWebAgentUI(text: string): Array<{ type: 'text' | 'ui'; content: string }> {
  const parts: Array<{ type: 'text' | 'ui'; content: string }> = []
  const re = /<webagent-ui>([\s\S]*?)<\/webagent-ui>/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'text', content: text.slice(last, m.index) })
    parts.push({ type: 'ui', content: m[1] })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ type: 'text', content: text.slice(last) })
  return parts
}

/** Simple regex-based markdown formatter */
function formatMarkdown(text: string): string {
  // Extract <think> blocks into placeholders before escaping
  const thinkingParts: string[] = []
  let s = text.replace(/<think>([\s\S]*?)<\/think>/gi, (_, inner) => {
    const idx = thinkingParts.length
    thinkingParts.push(inner)
    return `%%THINK_${idx}%%`
  })

  // Escape HTML entities
  s = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Code blocks
  s = s.replace(/```[\w]*\n?([\s\S]*?)```/g, '<pre><code>$1</code></pre>')

  // Inline code
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>')

  // Bold
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

  // Italic (single asterisk, not inside words)
  s = s.replace(/(?<!\*)\*(?!\*)([^*\n]+)(?<!\*)\*(?!\*)/g, '<em>$1</em>')

  // Newlines to <br> (but not inside pre blocks)
  s = s.replace(/(?<!<\/pre>)\n/g, '<br>')

  // Reinject thinking spoilers
  s = s.replace(/%%THINK_(\d+)%%/g, (_, i) => {
    const escaped = thinkingParts[Number(i)]
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    return `<details class="think-spoiler"><summary>thinking</summary><pre>${escaped}</pre></details>`
  })

  return s
}

interface UiFrameProps {
  html: string
}

function UiFrame({ html }: UiFrameProps) {
  const srcdoc = `<!DOCTYPE html><html><head><style>body{margin:0;background:#1a1f26;color:#e6e9ee;font-family:system-ui,sans-serif;}</style></head><body>${html}</body></html>`
  return (
    <iframe
      srcDoc={srcdoc}
      sandbox=""
      style={{
        width: '100%',
        height: '300px',
        border: 'none',
        borderRadius: '6px',
        background: '#1a1f26',
        display: 'block',
        marginTop: '6px',
      }}
    />
  )
}

interface AssistantBodyProps {
  text: string
  streaming?: boolean
}

function AssistantBody({ text, streaming }: AssistantBodyProps) {
  const parts = splitWebAgentUI(text)
  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'ui') {
          return <UiFrame key={i} html={part.content} />
        }
        if (!part.content.trim() && parts.length > 1) return null
        return (
          <div
            key={i}
            dangerouslySetInnerHTML={{ __html: formatMarkdown(part.content) }}
          />
        )
      })}
      {streaming && (
        <span className="typing-dots" style={{ marginLeft: '2px' }}>
          <span>⬤</span><span>⬤</span><span>⬤</span>
        </span>
      )}
    </>
  )
}

export function MessageList({ items, onContinue, busy }: { items: DisplayItem[]; onContinue?: () => void; busy?: boolean }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [items])

  return (
    <div className="message-list">
      <style>{TYPING_STYLE}</style>
      {items.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">⚡</div>
          <h2>WebGPU Agent</h2>
          <p>An AI agent that runs entirely in your browser — with a file system, git, web tools, skills and sub-agents.</p>
          <p>Pick a model in the sidebar, then ask anything. Type <code>/</code> for commands, or <code>/help</code> to see everything available.</p>
        </div>
      )}
      {items.map((item, i) => {
        if (item.kind === 'user') {
          return (
            <div key={i} className="msg msg-user">
              <div className="msg-role">you</div>
              <div className="msg-body">{item.text}</div>
            </div>
          )
        }

        if (item.kind === 'assistant') {
          return (
            <div key={i} className="msg msg-assistant">
              <div className="msg-role">agent</div>
              <div className="msg-body">
                <AssistantBody text={item.text} streaming={item.streaming} />
              </div>
            </div>
          )
        }

        if (item.kind === 'tool') {
          const icon = toolIcon(item.name)
          const isSubAgent = item.name === 'spawn_agent'

          if (isSubAgent && item.result !== undefined && !item.isError) {
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '85%', alignSelf: 'flex-start' }}>
                <details className={`msg msg-tool${item.isError ? ' msg-tool-error' : ''}`}>
                  <summary>
                    {icon} {item.name}({item.args}) — done
                  </summary>
                  {item.result !== undefined && <pre>{item.result}</pre>}
                </details>
                <div
                  className="msg msg-assistant"
                  style={{ marginLeft: '16px', borderLeft: '3px solid var(--border)', borderRadius: '0 8px 8px 0', paddingLeft: '12px' }}
                >
                  <div className="msg-role" style={{ color: 'var(--text-dim)' }}>Sub-agent:</div>
                  <div className="msg-body">
                    <AssistantBody text={item.result} />
                  </div>
                </div>
              </div>
            )
          }

          const elapsed = item.startTime && item.endTime ? ` (${item.endTime - item.startTime}ms)` : ''
          return (
            <details key={i} className={`msg msg-tool${item.isError ? ' msg-tool-error' : ''}`} open={item.isError}>
              <summary>
                {icon} {item.name}({item.args}){' '}
                {item.result === undefined
                  ? '— running…'
                  : item.isError
                  ? `— error${elapsed}`
                  : `— done${elapsed}`}
              </summary>
              {item.result !== undefined && <pre>{item.result}</pre>}
            </details>
          )
        }

        if (item.kind === 'iteration_limit') {
          const isLast = i === items.length - 1
          return (
            <div key={i} className="msg msg-error" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span>⚠️ Stopped after {item.count} tool iterations</span>
              {isLast && onContinue && (
                <button
                  onClick={onContinue}
                  disabled={busy}
                  style={{
                    background: 'var(--accent)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '4px 14px',
                    fontSize: '13px',
                    cursor: busy ? 'default' : 'pointer',
                    opacity: busy ? 0.5 : 1,
                    flexShrink: 0,
                  }}
                >
                  Continue
                </button>
              )}
            </div>
          )
        }

        return (
          <div key={i} className="msg msg-error">
            ⚠️ {item.text}
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
