export type DisplayItem =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string; streaming?: boolean }
  | { kind: 'tool'; name: string; args: string; result?: string; isError?: boolean }
  | { kind: 'error'; text: string }

export function MessageList({ items }: { items: DisplayItem[] }) {
  return (
    <div className="message-list">
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
              <div className="msg-role">agent{item.streaming ? ' …' : ''}</div>
              <div className="msg-body">{item.text}</div>
            </div>
          )
        }
        if (item.kind === 'tool') {
          return (
            <details key={i} className={`msg msg-tool${item.isError ? ' msg-tool-error' : ''}`} open={item.isError}>
              <summary>
                🔧 {item.name}({item.args}) {item.result === undefined ? '— running…' : item.isError ? '— error' : '— done'}
              </summary>
              {item.result !== undefined && <pre>{item.result}</pre>}
            </details>
          )
        }
        return (
          <div key={i} className="msg msg-error">
            ⚠️ {item.text}
          </div>
        )
      })}
    </div>
  )
}
