import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PasswordGate } from './PasswordGate'

describe('PasswordGate', () => {
  describe('unlock mode', () => {
    it('shows unlock title and password input', () => {
      render(<PasswordGate mode="unlock" onSubmit={vi.fn()} />)
      expect(screen.getByText('Unlock your data')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()
      expect(screen.queryByPlaceholderText('Confirm password')).not.toBeInTheDocument()
    })

    it('calls onSubmit with the password', async () => {
      const onSubmit = vi.fn(async () => null)
      render(<PasswordGate mode="unlock" onSubmit={onSubmit} />)
      const input = screen.getByPlaceholderText('Password')
      await userEvent.type(input, 'mypassword')
      await userEvent.click(screen.getByText('Unlock'))
      expect(onSubmit).toHaveBeenCalledWith('mypassword')
    })

    it('shows error returned by onSubmit', async () => {
      const onSubmit = vi.fn(async () => 'Wrong password')
      render(<PasswordGate mode="unlock" onSubmit={onSubmit} />)
      await userEvent.type(screen.getByPlaceholderText('Password'), 'x')
      await userEvent.click(screen.getByText('Unlock'))
      expect(await screen.findByText('Wrong password')).toBeInTheDocument()
    })

    it('rejects empty password', async () => {
      const onSubmit = vi.fn()
      render(<PasswordGate mode="unlock" onSubmit={onSubmit} />)
      await userEvent.click(screen.getByText('Unlock'))
      expect(screen.getByText('Please enter a password.')).toBeInTheDocument()
      expect(onSubmit).not.toHaveBeenCalled()
    })
  })

  describe('setup mode', () => {
    it('shows setup title and confirm input', () => {
      render(<PasswordGate mode="setup" onSubmit={vi.fn()} />)
      expect(screen.getByText('Encrypt your data')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Confirm password')).toBeInTheDocument()
    })

    it('rejects short passwords', async () => {
      const onSubmit = vi.fn()
      render(<PasswordGate mode="setup" onSubmit={onSubmit} />)
      await userEvent.type(screen.getByPlaceholderText('Password'), 'short')
      await userEvent.type(screen.getByPlaceholderText('Confirm password'), 'short')
      await userEvent.click(screen.getByText('Encrypt & Save'))
      expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument()
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('rejects mismatched passwords', async () => {
      const onSubmit = vi.fn()
      render(<PasswordGate mode="setup" onSubmit={onSubmit} />)
      await userEvent.type(screen.getByPlaceholderText('Password'), 'longpassword')
      await userEvent.type(screen.getByPlaceholderText('Confirm password'), 'differentpw')
      await userEvent.click(screen.getByText('Encrypt & Save'))
      expect(screen.getByText('Passwords do not match.')).toBeInTheDocument()
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('calls onSubmit when passwords match and are long enough', async () => {
      const onSubmit = vi.fn(async () => null)
      render(<PasswordGate mode="setup" onSubmit={onSubmit} />)
      await userEvent.type(screen.getByPlaceholderText('Password'), 'longpassword')
      await userEvent.type(screen.getByPlaceholderText('Confirm password'), 'longpassword')
      await userEvent.click(screen.getByText('Encrypt & Save'))
      expect(onSubmit).toHaveBeenCalledWith('longpassword')
    })

    it('shows skip button when onSkip is provided', () => {
      const onSkip = vi.fn()
      render(<PasswordGate mode="setup" onSubmit={vi.fn()} onSkip={onSkip} />)
      expect(screen.getByText('Skip encryption')).toBeInTheDocument()
    })

    it('calls onSkip when skip is clicked', async () => {
      const onSkip = vi.fn()
      render(<PasswordGate mode="setup" onSubmit={vi.fn()} onSkip={onSkip} />)
      await userEvent.click(screen.getByText('Skip encryption'))
      expect(onSkip).toHaveBeenCalled()
    })
  })
})
