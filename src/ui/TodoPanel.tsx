import type { TodoItem } from '../types'

const ICONS: Record<TodoItem['status'], string> = { pending: '○', in_progress: '◐', completed: '●' }

export function TodoPanel({ todos }: { todos: TodoItem[] }) {
  if (todos.length === 0) return null
  const done = todos.filter((t) => t.status === 'completed').length
  return (
    <div className="todo-panel" style={{ fontSize: '0.85em', opacity: 0.9, padding: '4px 12px', borderTop: '1px solid var(--border, #333)' }}>
      <div style={{ fontWeight: 600 }}>Tasks {done}/{todos.length}</div>
      {todos.map((t, i) => (
        <div key={i} style={{ textDecoration: t.status === 'completed' ? 'line-through' : 'none', opacity: t.status === 'pending' ? 0.7 : 1 }}>
          {ICONS[t.status]} {t.content}
        </div>
      ))}
    </div>
  )
}
