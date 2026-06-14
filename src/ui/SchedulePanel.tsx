import { useEffect, useState } from 'react'
import type { ScheduleItem } from '../types'
import { listSchedules, createSchedule, updateSchedule, deleteSchedule } from '../schedule/store'

interface SchedulePanelProps {
  onClose: () => void
}

const INTERVAL_PRESETS = [
  { label: 'Every minute', ms: 60_000 },
  { label: 'Every 5 minutes', ms: 300_000 },
  { label: 'Every 15 minutes', ms: 900_000 },
  { label: 'Every hour', ms: 3_600_000 },
  { label: 'Every 6 hours', ms: 21_600_000 },
  { label: 'Daily', ms: 86_400_000 },
  { label: 'Weekly', ms: 604_800_000 },
]

export function SchedulePanel({ onClose }: SchedulePanelProps) {
  const [schedules, setSchedules] = useState<ScheduleItem[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [intervalMs, setIntervalMs] = useState(60_000)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    const items = await listSchedules()
    setSchedules(items.sort((a, b) => a.nextRun - b.nextRun))
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const items = await listSchedules()
      if (!cancelled) {
        setSchedules(items.sort((a, b) => a.nextRun - b.nextRun))
        setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  const handleCreate = async () => {
    if (!title.trim()) return
    await createSchedule(title.trim(), intervalMs, description.trim() || undefined)
    setTitle('')
    setDescription('')
    await refresh()
  }

  const handlePause = async (id: string, currentStatus: string) => {
    await updateSchedule(id, { status: currentStatus === 'active' ? 'paused' : 'active' })
    await refresh()
  }

  const handleDelete = async (id: string) => {
    await deleteSchedule(id)
    await refresh()
  }

  const formatTime = (ts: number) => new Date(ts).toLocaleString()
  const formatInterval = (ms: number) => {
    if (ms < 60_000) return `${ms / 1000}s`
    if (ms < 3_600_000) return `${ms / 60_000}m`
    if (ms < 86_400_000) return `${ms / 3_600_000}h`
    return `${ms / 86_400_000}d`
  }

  const activeSchedules = schedules.filter((s) => s.status === 'active')
  const pausedSchedules = schedules.filter((s) => s.status === 'paused')

  return (
    <div style={{ padding: 16, height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Schedules</h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input
          placeholder="Schedule title"
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
        <select
          value={intervalMs}
          onChange={(e) => setIntervalMs(Number(e.target.value))}
          style={{ width: '100%', marginBottom: 8, padding: '8px', borderRadius: 4, border: '1px solid var(--border)' }}
        >
          {INTERVAL_PRESETS.map((p) => (
            <option key={p.ms} value={p.ms}>{p.label}</option>
          ))}
        </select>
        <button onClick={() => void handleCreate()} disabled={!title.trim()} style={{ width: '100%', padding: '8px' }}>
          Add Schedule
        </button>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          <h3>Active ({activeSchedules.length})</h3>
          {activeSchedules.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No active schedules</p>}
          {activeSchedules.map((s) => (
            <div key={s.id} style={{ padding: '8px', marginBottom: 8, border: '1px solid var(--border)', borderRadius: 4 }}>
              <div style={{ fontWeight: 600 }}>{s.title}</div>
              {s.description && <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>{s.description}</div>}
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                Interval: {s.intervalMs ? formatInterval(s.intervalMs) : 'N/A'} | Next: {formatTime(s.nextRun)}
              </div>
              {s.lastRun && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Last run: {formatTime(s.lastRun)}</div>}
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button onClick={() => void handlePause(s.id, s.status)} style={{ fontSize: 12 }}>Pause</button>
                <button onClick={() => void handleDelete(s.id)} style={{ fontSize: 12, color: 'red' }}>Delete</button>
              </div>
            </div>
          ))}

          {pausedSchedules.length > 0 && (
            <>
              <h3>Paused ({pausedSchedules.length})</h3>
              {pausedSchedules.map((s) => (
                <div key={s.id} style={{ padding: '8px', marginBottom: 8, border: '1px solid var(--border)', borderRadius: 4, opacity: 0.6 }}>
                  <div style={{ fontWeight: 600 }}>{s.title}</div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                    <button onClick={() => void handlePause(s.id, s.status)} style={{ fontSize: 12 }}>Resume</button>
                    <button onClick={() => void handleDelete(s.id)} style={{ fontSize: 12, color: 'red' }}>Delete</button>
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}
