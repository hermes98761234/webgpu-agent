import { beforeEach, describe, expect, it, vi } from 'vitest'
import { files, resetMemfs } from '../test/memfs'
import { fsTools } from './fs'

vi.mock('../fs/setup', () => import('../test/memfs'))

const tool = (name: string) => fsTools.find((t) => t.name === name)!

beforeEach(() => {
  resetMemfs()
  files.set('/home/user/.agent/memory/fav-color.md', 'green')
})

describe('fs path resolution', () => {
  it('reads absolute paths', async () => {
    expect(await tool('fs_read').execute({ path: '/home/user/.agent/memory/fav-color.md' })).toBe('green')
  })

  it('expands ~ to the home directory', async () => {
    expect(await tool('fs_read').execute({ path: '~/.agent/memory/fav-color.md' })).toBe('green')
  })

  it('resolves relative paths against /home/user', async () => {
    expect(await tool('fs_read').execute({ path: '.agent/memory/fav-color.md' })).toBe('green')
  })

  it('trims surrounding whitespace', async () => {
    expect(await tool('fs_read').execute({ path: ' /home/user/.agent/memory/fav-color.md ' })).toBe('green')
  })

  it('fs_write resolves ~ paths too', async () => {
    const out = await tool('fs_write').execute({ path: '~/notes.txt', content: 'hi' })
    expect(out).toBe('Written: /home/user/notes.txt')
    expect(files.get('/home/user/notes.txt')).toBe('hi')
  })

  it('normalizes .. segments in paths', async () => {
    const out = await tool('fs_write').execute({ path: '~/.agent/../notes.txt', content: 'test' })
    expect(out).toContain('/home/user/notes.txt')
    expect(files.get('/home/user/notes.txt')).toBe('test')
  })

  it('handles multiple .. segments', async () => {
    const out = await tool('fs_write').execute({ path: '~/.agent/memory/../../notes.txt', content: 'test2' })
    expect(out).toContain('/home/user/notes.txt')
  })
})
