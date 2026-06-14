import { useEffect, useState } from 'react'
import type { Goal } from '../types'
import { listGoals, createGoal, updateGoal, deleteGoal } from '../schedule/store'

interface GoalPanelProps {
  onClose: () => void
}

export function GoalPanel({ onClose }: GoalPanelProps) {
  const [goals, setGoals] = useState<Goal[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [deadline, setDeadline] = useState('')
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    const items = await listGoals()
    setGoals(items.sort((a, b) => (a.deadline ?? Infinity) - (b.deadline ?? Infinity)))
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const items = await listGoals()
      if (!cancelled) {
        setGoals(items.sort((a, b) => (a.deadline ?? Infinity) - (b.deadline ?? Infinity)))
        setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  const handleCreate = async () => {
    if (!title.trim()) return
    const dl = deadline ? new Date(deadline).getTime() : undefined
    await createGoal(title.trim(), description.trim() || undefined, dl)
    setTitle('')
    setDescription('')
    setDeadline('')
    await refresh()
  }

  const handleComplete = async (id: string) => {
    await updateGoal(id, { status: 'completed' })
    await refresh()
  }

  const handleCancel = async (id: string) => {
    await updateGoal(id, { status: 'cancelled' })
    await refresh()
  }

  const handleDelete = async (id: string) => {
    await deleteGoal(id)
    await refresh()
  }

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString()

  const activeGoals = goals.filter((g) => g.status === 'active')
  const completedGoals = goals.filter((g) => g.status !== 'active')

  return (
    <div style={{ padding: 16, height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Goals</h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input
          placeholder="Goal title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ width: '100%', marginBottom: 8, padding: '8px', borderRadius: 4, border: '1px solid var(--border)' }}
        />
        <input
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ width: '100%', marginBottom: 8, padding: '8px', borderRadius: 4, border: '1px solid var(--border)' }}
        />
        <input
          type="date"
          placeholder="Deadline (optional)"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          style={{ width: '100%', marginBottom: 8, padding: '8px', borderRadius: 4, border: '1px solid var(--border)' }}
        />
        <button onClick={() => void handleCreate()} disabled={!title.trim()} style={{ width: '100%', padding: '8px' }}>
          Add Goal
        </button>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          <h3>Active ({activeGoals.length})</h3>
          {activeGoals.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No active goals</p>}
          {activeGoals.map((g) => (
            <div key={g.id} style={{ padding: '8px', marginBottom: 8, border: '1px solid var(--border)', borderRadius: 4 }}>
              <div style={{ fontWeight: 600 }}>{g.title}</div>
              {g.description && <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>{g.description}</div>}
              {g.deadline && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Due: {formatDate(g.deadline)}</div>}
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button onClick={() => void handleComplete(g.id)} style={{ fontSize: 12 }}>Complete</button>
                <button onClick={() => void handleCancel(g.id)} style={{ fontSize: 12 }}>Cancel</button>
                <button onClick={() => void handleDelete(g.id)} style={{ fontSize: 12, color: 'red' }}>Delete</button>
              </div>
            </div>
          ))}

          {completedGoals.length > 0 && (
            <>
              <h3>Completed ({completedGoals.length})</h3>
              {completedGoals.map((g) => (
                <div key={g.id} style={{ padding: '8px', marginBottom: 8, border: '1px solid var(--border)', borderRadius: 4, opacity: 0.6 }}>
                  <div style={{ fontWeight: 600 }}>{g.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{g.status}</div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}
