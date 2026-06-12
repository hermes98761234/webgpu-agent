import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadMcpServers, sanitizeName, saveMcpServers } from './manager'

const mem = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => {
    mem.set(k, v)
  },
  removeItem: (k: string) => {
    mem.delete(k)
  },
})

beforeEach(() => {
  mem.clear()
})

describe('sanitizeName', () => {
  it('replaces unsafe characters', () => {
    expect(sanitizeName('My Server #1!')).toBe('My_Server__1_')
    expect(sanitizeName('ok-name_2')).toBe('ok-name_2')
  })
})

describe('mcp server persistence', () => {
  it('round-trips configs', () => {
    expect(loadMcpServers()).toEqual([])
    const cfg = [{ id: 'a', name: 'srv', url: 'https://mcp.example.com/mcp' }]
    saveMcpServers(cfg)
    expect(loadMcpServers()).toEqual(cfg)
  })
})
