import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GoalPanel } from './GoalPanel'

vi.mock('../schedule/store', () => ({
  listGoals: vi.fn().mockResolvedValue([]),
  createGoal: vi.fn().mockResolvedValue({ id: '1', title: 'Test', status: 'active', createdAt: Date.now() }),
  updateGoal: vi.fn().mockResolvedValue(null),
  deleteGoal: vi.fn().mockResolvedValue(true),
}))

describe('GoalPanel', () => {
  it('renders goal panel with title', () => {
    const onClose = vi.fn()
    render(<GoalPanel onClose={onClose} />)
    expect(screen.getByText('Goals')).toBeDefined()
  })

  it('renders create form', () => {
    const onClose = vi.fn()
    render(<GoalPanel onClose={onClose} />)
    expect(screen.getByPlaceholderText('Goal title')).toBeDefined()
    expect(screen.getByText('Add Goal')).toBeDefined()
  })

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn()
    render(<GoalPanel onClose={onClose} />)
    screen.getByText('✕').click()
    expect(onClose).toHaveBeenCalled()
  })
})
