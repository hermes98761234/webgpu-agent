import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeAll } from 'vitest'
import { MessageList } from './MessageList'
import type { DisplayItem } from './MessageList'

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

describe('MessageList', () => {
  it('shows empty state when no items', () => {
    render(<MessageList items={[]} />)
    expect(screen.getByText('WebGPU Agent')).toBeInTheDocument()
    expect(screen.getByText(/An AI agent that runs entirely in your browser/)).toBeInTheDocument()
  })

  it('renders user messages', () => {
    const items: DisplayItem[] = [{ kind: 'user', text: 'Hello world' }]
    render(<MessageList items={items} />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
    expect(screen.getByText('you')).toBeInTheDocument()
  })

  it('renders assistant messages', () => {
    const items: DisplayItem[] = [{ kind: 'assistant', text: 'I am the agent' }]
    render(<MessageList items={items} />)
    expect(screen.getByText('agent')).toBeInTheDocument()
    expect(screen.getByText('I am the agent')).toBeInTheDocument()
  })

  it('renders tool call entries', () => {
    const items: DisplayItem[] = [
      { kind: 'tool', name: 'fs_list', args: '{"/path"}', result: 'file1.txt', isError: false },
    ]
    render(<MessageList items={items} />)
    expect(screen.getByText(/fs_list/)).toBeInTheDocument()
  })

  it('renders error items', () => {
    const items: DisplayItem[] = [{ kind: 'error', text: 'Something went wrong' }]
    render(<MessageList items={items} />)
    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument()
  })

  it('shows tool as running when result is undefined', () => {
    const items: DisplayItem[] = [
      { kind: 'tool', name: 'git_status', args: '{}', isError: false },
    ]
    render(<MessageList items={items} />)
    expect(screen.getByText(/running/)).toBeInTheDocument()
  })

  it('shows timing when startTime and endTime are present', () => {
    const items: DisplayItem[] = [
      { kind: 'tool', name: 'fetch_url', args: '{}', result: 'ok', isError: false, startTime: 1000, endTime: 1250 },
    ]
    render(<MessageList items={items} />)
    expect(screen.getByText(/250ms/)).toBeInTheDocument()
  })

  it('renders a mix of user, assistant, and tool items', () => {
    const items: DisplayItem[] = [
      { kind: 'user', text: 'do something' },
      { kind: 'tool', name: 'run_javascript', args: '{}', result: '42', isError: false },
      { kind: 'assistant', text: 'Done!' },
    ]
    render(<MessageList items={items} />)
    expect(screen.getByText('do something')).toBeInTheDocument()
    expect(screen.getByText('Done!')).toBeInTheDocument()
  })
})
