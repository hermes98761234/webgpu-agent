import type { TodoItem, ToolDef } from '../types'

const STATUSES = ['pending', 'in_progress', 'completed'] as const

export function makeTodoTool(setTodos: (todos: TodoItem[]) => void): ToolDef {
  return {
    name: 'todo_write',
    description:
      'Replace your visible task list. Use for multi-step work: write all steps up front, keep exactly one in_progress, and update the list as you complete each step.',
    parameters: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: 'The full task list (replaces the previous one)',
          items: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'Short task description' },
              status: { type: 'string', enum: [...STATUSES] },
            },
            required: ['content', 'status'],
          },
        },
      },
      required: ['todos'],
    },
    source: 'builtin',
    async execute(args) {
      const raw = Array.isArray(args.todos) ? args.todos : []
      const todos: TodoItem[] = raw
        .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null)
        .map((t) => ({
          content: String(t.content ?? '').trim(),
          status: (STATUSES as readonly string[]).includes(String(t.status))
            ? (String(t.status) as TodoItem['status'])
            : 'pending',
        }))
        .filter((t) => t.content)
      setTodos(todos)
      return `Todo list updated (${todos.length} items)`
    },
  }
}
