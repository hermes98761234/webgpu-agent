declare const __GIT_SHA__: string
declare const __APP_VERSION__: string

const FEATURES = [
  'Local WebGPU LLM inference',
  'External API mode (OpenAI-compatible)',
  'Agent tool loop with sandboxed execution',
  'Persistent memory across sessions',
  'User-defined skills system',
  'Remote MCP server support',
]

export function AboutPanel() {
  return (
    <div className="log-panel" style={{ padding: '32px 24px', maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
        webgpu-agent
      </h2>
      <div className="dim" style={{ marginBottom: 16 }}>
        v{__APP_VERSION__} · {__GIT_SHA__}
      </div>
      <p style={{ margin: '0 0 20px', color: 'var(--text)' }}>
        AI agent that runs entirely in your browser
      </p>
      <div style={{ marginBottom: 20 }}>
        <div className="dim" style={{ marginBottom: 6, fontWeight: 600 }}>Top features</div>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8, color: 'var(--text)' }}>
          {FEATURES.map((f) => <li key={f}>{f}</li>)}
        </ul>
      </div>
      <a
        href="https://github.com/nicepkg/webgpu-agent"
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'var(--accent, #4ea8ff)', textDecoration: 'none' }}
      >
        GitHub →
      </a>
    </div>
  )
}
