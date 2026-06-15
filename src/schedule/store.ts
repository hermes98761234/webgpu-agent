import { pfs, ensureDir } from '../fs/setup'
import type { Goal, ScheduleItem } from '../types'

const SCHEDULE_DIR = '/home/user/.agent/schedule'
const GOALS_FILE = `${SCHEDULE_DIR}/goals.json`
const SCHEDULES_FILE = `${SCHEDULE_DIR}/schedules.json`

const locks = new Map<string, Promise<void>>()
function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  locks.set(key, next.then(() => {}))
  return next
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

async function readJson<T>(path: string): Promise<T[]> {
  try {
    const raw = await pfs.readFile(path, 'utf8')
    return JSON.parse(String(raw)) as T[]
  } catch {
    return []
  }
}

async function writeJson<T>(path: string, data: T[]): Promise<void> {
  await ensureDir(SCHEDULE_DIR)
  await pfs.writeFile(path, JSON.stringify(data, null, 2), 'utf8')
}

export async function listGoals(): Promise<Goal[]> {
  return readJson<Goal>(GOALS_FILE)
}

export async function createGoal(title: string, description?: string, deadline?: number): Promise<Goal> {
  return withLock(GOALS_FILE, async () => {
    const goals = await readJson<Goal>(GOALS_FILE)
    const goal: Goal = {
      id: generateId(),
      title,
      description,
      deadline,
      status: 'active',
      createdAt: Date.now(),
    }
    goals.push(goal)
    await writeJson(GOALS_FILE, goals)
    return goal
  })
}

export async function updateGoal(id: string, updates: Partial<Pick<Goal, 'title' | 'description' | 'deadline' | 'status'>>): Promise<Goal | null> {
  return withLock(GOALS_FILE, async () => {
    const goals = await readJson<Goal>(GOALS_FILE)
    const idx = goals.findIndex((g) => g.id === id)
    if (idx === -1) return null
    goals[idx] = { ...goals[idx], ...updates, completedAt: updates.status === 'completed' ? Date.now() : goals[idx].completedAt }
    await writeJson(GOALS_FILE, goals)
    return goals[idx]
  })
}

export async function deleteGoal(id: string): Promise<boolean> {
  return withLock(GOALS_FILE, async () => {
    const goals = await readJson<Goal>(GOALS_FILE)
    const filtered = goals.filter((g) => g.id !== id)
    if (filtered.length === goals.length) return false
    await writeJson(GOALS_FILE, filtered)
    return true
  })
}

export async function listSchedules(): Promise<ScheduleItem[]> {
  return readJson<ScheduleItem>(SCHEDULES_FILE)
}

export async function createSchedule(title: string, intervalMs: number, description?: string): Promise<ScheduleItem> {
  return withLock(SCHEDULES_FILE, async () => {
    const schedules = await readJson<ScheduleItem>(SCHEDULES_FILE)
    const item: ScheduleItem = {
      id: generateId(),
      title,
      description,
      intervalMs,
      nextRun: Date.now() + intervalMs,
      status: 'active',
      createdAt: Date.now(),
    }
    schedules.push(item)
    await writeJson(SCHEDULES_FILE, schedules)
    return item
  })
}

export async function updateSchedule(id: string, updates: Partial<Pick<ScheduleItem, 'title' | 'description' | 'intervalMs' | 'status' | 'nextRun' | 'lastRun'>>): Promise<ScheduleItem | null> {
  return withLock(SCHEDULES_FILE, async () => {
    const schedules = await readJson<ScheduleItem>(SCHEDULES_FILE)
    const idx = schedules.findIndex((s) => s.id === id)
    if (idx === -1) return null
    schedules[idx] = { ...schedules[idx], ...updates }
    await writeJson(SCHEDULES_FILE, schedules)
    return schedules[idx]
  })
}

export async function deleteSchedule(id: string): Promise<boolean> {
  return withLock(SCHEDULES_FILE, async () => {
    const schedules = await readJson<ScheduleItem>(SCHEDULES_FILE)
    const filtered = schedules.filter((s) => s.id !== id)
    if (filtered.length === schedules.length) return false
    await writeJson(SCHEDULES_FILE, filtered)
    return true
  })
}

export async function getDueSchedules(): Promise<ScheduleItem[]> {
  const schedules = await listSchedules()
  const now = Date.now()
  return schedules.filter((s) => s.status === 'active' && s.nextRun <= now)
}

export async function markScheduleRun(id: string): Promise<void> {
  await withLock(SCHEDULES_FILE, async () => {
    const schedules = await readJson<ScheduleItem>(SCHEDULES_FILE)
    const idx = schedules.findIndex((s) => s.id === id)
    if (idx === -1) return
    const s = schedules[idx]
    schedules[idx] = {
      ...s,
      lastRun: Date.now(),
      nextRun: s.intervalMs ? Date.now() + s.intervalMs : s.nextRun,
    }
    await writeJson(SCHEDULES_FILE, schedules)
  })
}
