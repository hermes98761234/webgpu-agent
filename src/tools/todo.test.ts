import { describe, expect, it } from 'vitest'
import { makeTodoTool } from './todo'
import type { TodoItem } from '../types'

describe('todo_write', () => {
  it('replaces the list and reports the count', async () => {
    let current: TodoItem[] = []
    const tool = makeTodoTool((t) => { current = t })
    const res = await tool.execute({
      todos: [
        { content: 'step one', status: 'completed' },
        { content: 'step two', status: 'in_progress' },
      ],
    })
    expect(res).toBe('Todo list updated (2 items)')
    expect(current).toEqual([
      { content: 'step one', status: 'completed' },
      { content: 'step two', status: 'in_progress' },
    ])
  })

  it('sanitizes junk: bad statuses become pending, empty items dropped, non-array is empty', async () => {
    let current: TodoItem[] = []
    const tool = makeTodoTool((t) => { current = t })
    await tool.execute({ todos: [{ content: 'x', status: 'bogus' }, { content: '' }, 'nonsense'] })
    expect(current).toEqual([{ content: 'x', status: 'pending' }])
    await tool.execute({ todos: 'not an array' })
    expect(current).toEqual([])
  })
})
