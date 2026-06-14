import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetMemfs, pfs, ensureDir } from '../test/memfs'

vi.mock('../fs/setup', () => ({
  pfs,
  ensureDir,
  ROOT: '/',
  HOME: '/home/user',
  AGENT_DIR: '/home/user/.agent',
  SKILLS_DIR: '/home/user/.agent/skills',
  PLUGINS_DIR: '/home/user/.agent/plugins',
  AGENT_MD: '/home/user/.agent/agent.md',
  MCP_CONFIG: '/home/user/.agent/mcp.json',
  MEMORY_DIR: '/home/user/.agent/memory',
  MEMORY_INDEX: '/home/user/.agent/memory/MEMORY.md',
}))

import {
  listGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  listSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  getDueSchedules,
  markScheduleRun,
} from './store'

describe('Goal Store', () => {
  beforeEach(() => {
    resetMemfs()
  })

  it('creates and lists goals', async () => {
    const goal = await createGoal('Test Goal', 'Description', Date.now() + 1000)
    expect(goal.title).toBe('Test Goal')
    expect(goal.status).toBe('active')

    const goals = await listGoals()
    expect(goals.length).toBe(1)
    expect(goals[0].id).toBe(goal.id)
  })

  it('updates goal', async () => {
    const goal = await createGoal('Original')
    const updated = await updateGoal(goal.id, { title: 'Updated', status: 'completed' })
    expect(updated?.title).toBe('Updated')
    expect(updated?.status).toBe('completed')
    expect(updated?.completedAt).toBeDefined()
  })

  it('deletes goal', async () => {
    const goal = await createGoal('To Delete')
    const deleted = await deleteGoal(goal.id)
    expect(deleted).toBe(true)

    const goals = await listGoals()
    expect(goals.length).toBe(0)
  })

  it('returns null for non-existent goal update', async () => {
    const result = await updateGoal('nonexistent', { title: 'X' })
    expect(result).toBeNull()
  })
})

describe('Schedule Store', () => {
  beforeEach(() => {
    resetMemfs()
  })

  it('creates and lists schedules', async () => {
    const schedule = await createSchedule('Test Schedule', 60000)
    expect(schedule.title).toBe('Test Schedule')
    expect(schedule.intervalMs).toBe(60000)
    expect(schedule.status).toBe('active')

    const schedules = await listSchedules()
    expect(schedules.length).toBe(1)
  })

  it('updates schedule', async () => {
    const schedule = await createSchedule('Original', 60000)
    const updated = await updateSchedule(schedule.id, { status: 'paused' })
    expect(updated?.status).toBe('paused')
  })

  it('deletes schedule', async () => {
    const schedule = await createSchedule('To Delete', 60000)
    const deleted = await deleteSchedule(schedule.id)
    expect(deleted).toBe(true)

    const schedules = await listSchedules()
    expect(schedules.length).toBe(0)
  })

  it('getDueSchedules returns past-due items', async () => {
    const schedule = await createSchedule('Due', 60000)
    await updateSchedule(schedule.id, { nextRun: Date.now() - 1000 })

    const due = await getDueSchedules()
    expect(due.length).toBe(1)
    expect(due[0].id).toBe(schedule.id)
  })

  it('markScheduleRun updates nextRun', async () => {
    const schedule = await createSchedule('Recurring', 60000)
    const before = Date.now()
    await markScheduleRun(schedule.id)

    const updated = (await listSchedules()).find((s) => s.id === schedule.id)
    expect(updated?.lastRun).toBeGreaterThanOrEqual(before)
    expect(updated?.nextRun).toBeGreaterThan(before)
  })
})
