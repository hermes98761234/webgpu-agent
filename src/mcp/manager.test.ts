import { beforeEach, describe, expect, it, vi } from 'vitest'
import { files, resetMemfs } from '../test/memfs'
import {
  getMcpServersCached,
  loadMcpServers,
  persistMcpServers,
  resolveServerUrl,
  sanitizeName,
} from './manager'

vi.mock('../fs/setup', () => import('../test/memfs'))

beforeEach(() => {
  resetMemfs()
})

describe('sanitizeName', () => {
  it('replaces unsafe characters', () => {
    expect(sanitizeName('My Server #1!')).toBe('My_Server__1_')
    expect(sanitizeName('ok-name_2')).toBe('ok-name_2')
  })
})

describe('mcp server persistence (/home/user/.agent/mcp.json)', () => {
  it('round-trips configs through mcp.json', async () => {
    expect(await loadMcpServers()).toEqual([])
    const cfg = [{ id: 'a', name: 'srv', url: 'https://mcp.example.com/mcp' }]
    await persistMcpServers(cfg)
    expect(files.has('/home/user/.agent/mcp.json')).toBe(true)
    expect(await loadMcpServers()).toEqual(cfg)
    expect(getMcpServersCached()).toEqual(cfg)
  })
})

describe('resolveServerUrl', () => {
  const base = { id: 'a', name: 'srv', url: 'https://mcp.example.com/mcp' }

  it('uses the server url directly when no proxy is set', () => {
    expect(resolveServerUrl(base).href).toBe('https://mcp.example.com/mcp')
  })

  it('prefixes with the proxy url', () => {
    expect(resolveServerUrl({ ...base, proxy: 'https://proxy.dev/' }).href).toBe(
      'https://proxy.dev/https://mcp.example.com/mcp',
    )
  })

  it('substitutes {url} templates with the encoded target', () => {
    expect(resolveServerUrl({ ...base, proxy: 'https://proxy.dev/?target={url}' }).href).toBe(
      `https://proxy.dev/?target=${encodeURIComponent(base.url)}`,
    )
  })
})
