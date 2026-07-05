import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Composer } from './Composer'
import type { SlashCommand } from '../types'

const commands: SlashCommand[] = [
  { name: 'help', description: 'Show commands', icon: '?' },
  { name: 'clear', description: 'Clear chat', icon: '🗑' },
]

describe('Composer', () => {
  it('renders textarea and send button', () => {
    render(<Composer busy={false} onSend={vi.fn()} onStop={vi.fn()} />)
    expect(screen.getByPlaceholderText(/Ask the agent/)).toBeInTheDocument()
    expect(screen.getByText('Send')).toBeInTheDocument()
  })

  it('calls onSend with trimmed text on Enter', async () => {
    const onSend = vi.fn()
    render(<Composer busy={false} onSend={onSend} onStop={vi.fn()} />)
    const textarea = screen.getByPlaceholderText(/Ask the agent/)
    await userEvent.type(textarea, 'hello there{Enter}')
    expect(onSend).toHaveBeenCalledWith('hello there')
  })

  it('does not send when busy', async () => {
    const onSend = vi.fn()
    render(<Composer busy={true} onSend={onSend} onStop={vi.fn()} />)
    expect(screen.getByText('Stop')).toBeInTheDocument()
    expect(screen.queryByText('Send')).not.toBeInTheDocument()
  })

  it('calls onStop when stop button clicked', async () => {
    const onStop = vi.fn()
    render(<Composer busy={true} onSend={vi.fn()} onStop={onStop} />)
    await userEvent.click(screen.getByText('Stop'))
    expect(onStop).toHaveBeenCalled()
  })

  it('shows slash command dropdown', async () => {
    render(<Composer busy={false} onSend={vi.fn()} onStop={vi.fn()} commands={commands} />)
    const textarea = screen.getByPlaceholderText(/Ask the agent/)
    await userEvent.type(textarea, '/h')
    expect(screen.getByText('/help')).toBeInTheDocument()
    expect(screen.getByText('Show commands')).toBeInTheDocument()
  })

  it('calls onCommand when a slash command is selected', async () => {
    const onCommand = vi.fn()
    render(<Composer busy={false} onSend={vi.fn()} onStop={vi.fn()} commands={commands} onCommand={onCommand} />)
    const textarea = screen.getByPlaceholderText(/Ask the agent/)
    await userEvent.type(textarea, '/help{Enter}')
    expect(onCommand).toHaveBeenCalledWith('help', '')
  })

  it('does not send empty text', async () => {
    const onSend = vi.fn()
    render(<Composer busy={false} onSend={onSend} onStop={vi.fn()} />)
    const textarea = screen.getByPlaceholderText(/Ask the agent/)
    await userEvent.type(textarea, '   {Enter}')
    expect(onSend).not.toHaveBeenCalled()
  })

  it('applies an external draft: replace mode overwrites, append mode appends', () => {
    const { rerender } = render(<Composer busy={false} onSend={() => {}} onStop={() => {}} draft={{ text: 'hello', nonce: 1, mode: 'replace' }} />)
    const ta = screen.getByPlaceholderText(/Ask the agent/) as HTMLTextAreaElement
    expect(ta.value).toBe('hello')
    rerender(<Composer busy={false} onSend={() => {}} onStop={() => {}} draft={{ text: '> quoted', nonce: 2, mode: 'append' }} />)
    expect(ta.value).toBe('hello\n> quoted')
  })
})
