import { describe, it, expect, beforeEach } from 'vitest'
import { parseHash } from './router'

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
})
