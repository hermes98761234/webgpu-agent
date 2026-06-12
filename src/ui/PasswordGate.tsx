import { useState } from 'react'

interface PasswordGateProps {
  mode: 'setup' | 'unlock'
  onSubmit: (password: string) => void
  onSkip?: () => void
}

export function PasswordGate({ mode, onSubmit, onSkip }: PasswordGateProps) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = () => {
    setError('')
    if (mode === 'setup') {
      if (password.length < 8) {
        setError('Password must be at least 8 characters.')
        return
      }
      if (password !== confirm) {
        setError('Passwords do not match.')
        return
      }
    }
    if (!password) {
      setError('Please enter a password.')
      return
    }
    onSubmit(password)
  }

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.42)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  }

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-alt)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '32px',
    width: '100%',
    maxWidth: '420px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  }

  const titleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: '20px',
    fontWeight: 700,
  }

  const descStyle: React.CSSProperties = {
    margin: 0,
    color: 'var(--text-dim)',
    fontSize: '14px',
    lineHeight: 1.5,
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
  }

  const errorStyle: React.CSSProperties = {
    color: 'var(--error)',
    fontSize: '13px',
    margin: 0,
  }

  const skipBtnStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: 'var(--text-dim)',
    fontSize: '13px',
    cursor: 'pointer',
    padding: 0,
    textDecoration: 'underline',
    alignSelf: 'center',
  }

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <h2 style={titleStyle}>
          {mode === 'setup' ? 'Encrypt your data' : 'Unlock your data'}
        </h2>
        <p style={descStyle}>
          {mode === 'setup'
            ? 'Set a password to encrypt your API keys, chat history, and settings in local storage.'
            : 'Enter your password to decrypt and load your stored data.'}
        </p>

        <input
          type="password"
          placeholder="Password"
          style={inputStyle}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          autoFocus
        />

        {mode === 'setup' && (
          <input
            type="password"
            placeholder="Confirm password"
            style={inputStyle}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
        )}

        {error && <p style={errorStyle}>{error}</p>}

        <button onClick={handleSubmit}>
          {mode === 'setup' ? 'Encrypt & Save' : 'Unlock'}
        </button>

        {mode === 'setup' && onSkip && (
          <button style={skipBtnStyle} onClick={onSkip}>
            Skip encryption
          </button>
        )}
      </div>
    </div>
  )
}
