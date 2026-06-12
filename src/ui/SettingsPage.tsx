import { useState } from 'react'

interface SettingsPageProps {
  onClose: () => void
  temperature: number
  topP: number
  maxTokens: number
  presencePenalty: number
  frequencyPenalty: number
  maxContextMessages: number
  theme: 'dark' | 'light'
  systemPrompt: string
  onTemperature: (v: number) => void
  onTopP: (v: number) => void
  onMaxTokens: (v: number) => void
  onPresencePenalty: (v: number) => void
  onFrequencyPenalty: (v: number) => void
  onMaxContextMessages: (v: number) => void
  onTheme: (v: 'dark' | 'light') => void
  onSystemPrompt: (v: string) => void
  onChangePassword: () => void
  onRemoveAllData: () => void
  onGetFullPrompt: () => Promise<string>
}

export function SettingsPage(props: SettingsPageProps) {
  const {
    onClose,
    temperature, topP, maxTokens, presencePenalty, frequencyPenalty, maxContextMessages,
    theme, systemPrompt,
    onTemperature, onTopP, onMaxTokens, onPresencePenalty, onFrequencyPenalty, onMaxContextMessages,
    onTheme, onSystemPrompt,
    onChangePassword, onRemoveAllData, onGetFullPrompt,
  } = props

  const [confirmText, setConfirmText] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [debugPrompt, setDebugPrompt] = useState<string | null>(null)
  const [debugLoading, setDebugLoading] = useState(false)

  async function handleDebug() {
    setDebugLoading(true)
    try {
      const full = await onGetFullPrompt()
      setDebugPrompt(full)
    } finally {
      setDebugLoading(false)
    }
  }

  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    background: 'var(--bg)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 100,
  }

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  }

  const titleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: '16px',
    fontWeight: 700,
  }

  const closeBtn: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: 'var(--text-dim)',
    fontSize: '20px',
    padding: '4px 8px',
    cursor: 'pointer',
    lineHeight: 1,
  }

  const scrollArea: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '28px',
  }

  const sectionStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  }

  const sectionTitle: React.CSSProperties = {
    margin: 0,
    fontSize: '13px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--text-dim)',
    paddingBottom: '4px',
    borderBottom: '1px solid var(--border)',
  }

  const sliderRow: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  }

  const sliderLabel: React.CSSProperties = {
    width: '160px',
    flexShrink: 0,
    fontSize: '14px',
  }

  const sliderBadge: React.CSSProperties = {
    background: 'var(--bg-alt)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '2px 8px',
    fontSize: '13px',
    minWidth: '52px',
    textAlign: 'center',
    flexShrink: 0,
  }

  const dangerBtn: React.CSSProperties = {
    background: 'none',
    border: '1px solid var(--error)',
    color: 'var(--error)',
    borderRadius: '6px',
    padding: '6px 14px',
    cursor: 'pointer',
    fontSize: '14px',
    alignSelf: 'flex-start',
  }

  const secondaryBtn: React.CSSProperties = {
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    borderRadius: '6px',
    padding: '6px 14px',
    cursor: 'pointer',
    fontSize: '14px',
    alignSelf: 'flex-start',
  }

  const themeToggle: React.CSSProperties = {
    display: 'flex',
    gap: '8px',
  }

  const themeOption = (active: boolean): React.CSSProperties => ({
    padding: '6px 16px',
    borderRadius: '6px',
    border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
    background: active ? 'rgba(79,156,249,0.12)' : 'none',
    color: active ? 'var(--accent)' : 'var(--text)',
    cursor: 'pointer',
    fontSize: '14px',
  })

  return (
    <div style={overlayStyle}>
      <div style={headerStyle}>
        <h2 style={titleStyle}>Settings</h2>
        <button style={closeBtn} onClick={onClose}>×</button>
      </div>

      <div style={scrollArea}>
        {/* Model Generation */}
        <div style={sectionStyle}>
          <p style={sectionTitle}>Model Generation</p>

          <div style={sliderRow}>
            <span style={sliderLabel}>Temperature</span>
            <input
              type="range"
              min={0} max={2.0} step={0.1}
              value={temperature}
              onChange={(e) => onTemperature(parseFloat(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={sliderBadge}>{temperature.toFixed(1)}</span>
          </div>

          <div style={sliderRow}>
            <span style={sliderLabel}>Top P</span>
            <input
              type="range"
              min={0} max={1.0} step={0.05}
              value={topP}
              onChange={(e) => onTopP(parseFloat(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={sliderBadge}>{topP.toFixed(2)}</span>
          </div>

          <div style={sliderRow}>
            <span style={sliderLabel}>Max Tokens</span>
            <input
              type="range"
              min={256} max={8192} step={256}
              value={maxTokens}
              onChange={(e) => onMaxTokens(parseInt(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={sliderBadge}>{maxTokens}</span>
          </div>

          <div style={sliderRow}>
            <span style={sliderLabel}>Presence Penalty</span>
            <input
              type="range"
              min={-2.0} max={2.0} step={0.1}
              value={presencePenalty}
              onChange={(e) => onPresencePenalty(parseFloat(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={sliderBadge}>{presencePenalty.toFixed(1)}</span>
          </div>

          <div style={sliderRow}>
            <span style={sliderLabel}>Frequency Penalty</span>
            <input
              type="range"
              min={-2.0} max={2.0} step={0.1}
              value={frequencyPenalty}
              onChange={(e) => onFrequencyPenalty(parseFloat(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={sliderBadge}>{frequencyPenalty.toFixed(1)}</span>
          </div>

          <div style={sliderRow}>
            <span style={sliderLabel}>Context Messages</span>
            <input
              type="range"
              min={10} max={200} step={10}
              value={maxContextMessages}
              onChange={(e) => onMaxContextMessages(parseInt(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={sliderBadge}>{maxContextMessages}</span>
          </div>
        </div>

        {/* Appearance */}
        <div style={sectionStyle}>
          <p style={sectionTitle}>Appearance</p>
          <div style={themeToggle}>
            <button style={themeOption(theme === 'dark')} onClick={() => onTheme('dark')}>
              Dark
            </button>
            <button style={themeOption(theme === 'light')} onClick={() => onTheme('light')}>
              Light
            </button>
          </div>
        </div>

        {/* System Prompt */}
        <div style={sectionStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={sectionTitle}>System Prompt</p>
            <button
              style={{ ...secondaryBtn, fontSize: '12px', padding: '3px 10px', alignSelf: 'auto' }}
              onClick={() => void handleDebug()}
              disabled={debugLoading}
            >
              {debugLoading ? '…' : 'Debug'}
            </button>
          </div>
          <textarea
            rows={6}
            style={{ width: '100%', resize: 'vertical' }}
            placeholder="Default system prompt sent to the model on every conversation…"
            value={systemPrompt}
            onChange={(e) => onSystemPrompt(e.target.value)}
          />
        </div>

        {/* Data & Security */}
        <div style={sectionStyle}>
          <p style={sectionTitle}>Data &amp; Security</p>

          <button style={secondaryBtn} onClick={onChangePassword}>
            Change Password
          </button>

          {!showDeleteConfirm ? (
            <button style={dangerBtn} onClick={() => setShowDeleteConfirm(true)}>
              Remove All Data
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '480px' }}>
              <p style={{ margin: 0, fontSize: '14px', color: 'var(--error)' }}>
                This will delete ALL your settings, skills, MCP servers, and chat history.
                Type <strong>CONFIRM</strong> to proceed.
              </p>
              <textarea
                rows={2}
                style={{ width: '100%', resize: 'none' }}
                placeholder="Type CONFIRM"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  style={{ ...dangerBtn, opacity: confirmText === 'CONFIRM' ? 1 : 0.4, cursor: confirmText === 'CONFIRM' ? 'pointer' : 'default' }}
                  disabled={confirmText !== 'CONFIRM'}
                  onClick={() => {
                    setShowDeleteConfirm(false)
                    setConfirmText('')
                    onRemoveAllData()
                  }}
                >
                  Delete Everything
                </button>
                <button
                  style={secondaryBtn}
                  onClick={() => {
                    setShowDeleteConfirm(false)
                    setConfirmText('')
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {debugPrompt !== null && (
        <div
          style={{
            position: 'absolute', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'stretch',
          }}
          onClick={() => setDebugPrompt(null)}
        >
          <div
            style={{
              margin: '32px auto',
              width: '90%',
              maxWidth: '860px',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>Full Prompt (sent to model)</span>
              <button style={closeBtn} onClick={() => setDebugPrompt(null)}>×</button>
            </div>
            <pre
              style={{
                flex: 1,
                margin: 0,
                padding: '16px',
                overflowY: 'auto',
                fontSize: '12px',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: 'var(--text)',
              }}
            >
              {debugPrompt}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
