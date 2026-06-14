import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SchedulePanel } from './SchedulePanel'

vi.mock('../schedule/store', () => ({
  listSchedules: vi.fn().mockResolvedValue([]),
  createSchedule: vi.fn().mockResolvedValue({ id: '1', title: 'Test', intervalMs: 60000, status: 'active', createdAt: Date.now(), nextRun: Date.now() }),
  updateSchedule: vi.fn().mockResolvedValue(null),
  deleteSchedule: vi.fn().mockResolvedValue(true),
}))

describe('SchedulePanel', () => {
  it('renders schedule panel with title', () => {
    const onClose = vi.fn()
    render(<SchedulePanel onClose={onClose} />)
    expect(screen.getByText('Schedules')).toBeDefined()
  })

  it('renders create form', () => {
    const onClose = vi.fn()
    render(<SchedulePanel onClose={onClose} />)
    expect(screen.getByPlaceholderText('Schedule title')).toBeDefined()
    expect(screen.getByText('Add Schedule')).toBeDefined()
  })

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn()
    render(<SchedulePanel onClose={onClose} />)
    screen.getByText('✕').click()
    expect(onClose).toHaveBeenCalled()
  })
})
