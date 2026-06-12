import { useState } from 'react'

export function Composer({ busy, onSend, onStop }: {
  busy: boolean
  onSend: (text: string) => void
  onStop: () => void
}) {
  const [text, setText] = useState('')
  const submit = () => {
    const t = text.trim()
    if (!t || busy) return
    setText('')
    onSend(t)
  }
  return (
    <div className="composer">
      <textarea
        value={text}
        placeholder="Ask the agent… (Enter to send, Shift+Enter for newline)"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
        rows={3}
      />
      {busy ? (
        <button onClick={onStop}>Stop</button>
      ) : (
        <button onClick={submit} disabled={!text.trim()}>Send</button>
      )}
    </div>
  )
}
