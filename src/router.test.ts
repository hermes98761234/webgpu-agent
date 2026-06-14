import { describe, it, expect, beforeEach, vi } from 'vitest'
import { parseHash, replaceHash, pushHash } from './router'

describe('parseHash', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  it('returns chat view for empty hash', () => {
    expect(parseHash()).toEqual({ view: 'chat' })
  })

  it('returns chat view for #/', () => {
    window.location.hash = '#/'
    expect(parseHash()).toEqual({ view: 'chat' })
  })

  it('parses #/chat', () => {
    window.location.hash = '#/chat'
    expect(parseHash()).toEqual({ view: 'chat' })
  })

  it('parses #/chat/<session-id>', () => {
    window.location.hash = '#/chat/abc123'
    expect(parseHash()).toEqual({ view: 'chat', sessionId: 'abc123' })
  })

  it('parses #/settings', () => {
    window.location.hash = '#/settings'
    expect(parseHash()).toEqual({ view: 'settings' })
  })

  it('parses #/files', () => {
    window.location.hash = '#/files'
    expect(parseHash()).toEqual({ view: 'files' })
  })

  it('parses #/terminal', () => {
    window.location.hash = '#/terminal'
    expect(parseHash()).toEqual({ view: 'terminal' })
  })

  it('parses #/log', () => {
    window.location.hash = '#/log'
    expect(parseHash()).toEqual({ view: 'log' })
  })

  it('parses #/about', () => {
    window.location.hash = '#/about'
    expect(parseHash()).toEqual({ view: 'about' })
  })

  it('defaults to chat for unknown view', () => {
    window.location.hash = '#/unknown'
    expect(parseHash()).toEqual({ view: 'chat' })
  })

  it('ignores extra path segments', () => {
    window.location.hash = '#/chat/abc123/extra'
    expect(parseHash()).toEqual({ view: 'chat', sessionId: 'abc123' })
  })

  it('handles session ID with special characters', () => {
    window.location.hash = '#/chat/abc-123_def'
    expect(parseHash()).toEqual({ view: 'chat', sessionId: 'abc-123_def' })
  })

  it('handles session ID with numbers only', () => {
    window.location.hash = '#/chat/12345'
    expect(parseHash()).toEqual({ view: 'chat', sessionId: '12345' })
  })
})

describe('replaceHash', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  it('replaces hash for chat view', () => {
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState')
    replaceHash({ view: 'chat' })
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '#/chat')
    replaceStateSpy.mockRestore()
  })

  it('replaces hash for chat view with session ID', () => {
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState')
    replaceHash({ view: 'chat', sessionId: 'abc123' })
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '#/chat/abc123')
    replaceStateSpy.mockRestore()
  })

  it('replaces hash for settings view', () => {
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState')
    replaceHash({ view: 'settings' })
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '#/settings')
    replaceStateSpy.mockRestore()
  })

  it('replaces hash for files view', () => {
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState')
    replaceHash({ view: 'files' })
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '#/files')
    replaceStateSpy.mockRestore()
  })

  it('replaces hash for terminal view', () => {
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState')
    replaceHash({ view: 'terminal' })
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '#/terminal')
    replaceStateSpy.mockRestore()
  })

  it('replaces hash for log view', () => {
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState')
    replaceHash({ view: 'log' })
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '#/log')
    replaceStateSpy.mockRestore()
  })

  it('replaces hash for about view', () => {
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState')
    replaceHash({ view: 'about' })
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '#/about')
    replaceStateSpy.mockRestore()
  })
})

describe('pushHash', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  it('pushes hash for chat view', () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState')
    pushHash({ view: 'chat' })
    expect(pushStateSpy).toHaveBeenCalledWith(null, '', '#/chat')
    pushStateSpy.mockRestore()
  })

  it('pushes hash for chat view with session ID', () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState')
    pushHash({ view: 'chat', sessionId: 'abc123' })
    expect(pushStateSpy).toHaveBeenCalledWith(null, '', '#/chat/abc123')
    pushStateSpy.mockRestore()
  })

  it('pushes hash for settings view', () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState')
    pushHash({ view: 'settings' })
    expect(pushStateSpy).toHaveBeenCalledWith(null, '', '#/settings')
    pushStateSpy.mockRestore()
  })

  it('pushes hash for files view', () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState')
    pushHash({ view: 'files' })
    expect(pushStateSpy).toHaveBeenCalledWith(null, '', '#/files')
    pushStateSpy.mockRestore()
  })

  it('pushes hash for terminal view', () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState')
    pushHash({ view: 'terminal' })
    expect(pushStateSpy).toHaveBeenCalledWith(null, '', '#/terminal')
    pushStateSpy.mockRestore()
  })

  it('pushes hash for log view', () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState')
    pushHash({ view: 'log' })
    expect(pushStateSpy).toHaveBeenCalledWith(null, '', '#/log')
    pushStateSpy.mockRestore()
  })

  it('pushes hash for about view', () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState')
    pushHash({ view: 'about' })
    expect(pushStateSpy).toHaveBeenCalledWith(null, '', '#/about')
    pushStateSpy.mockRestore()
  })
})
