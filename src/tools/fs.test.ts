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

describe('fs_edit', () => {
  const edit = fsTools.find((t) => t.name === 'fs_edit')!

  it('replaces a unique exact string', async () => {
    files.set('/home/user/a.txt', 'hello world')
    const res = await edit.execute({ path: '/home/user/a.txt', old_string: 'world', new_string: 'there' })
    expect(res).toContain('Edited')
    expect(files.get('/home/user/a.txt')).toBe('hello there')
  })

  it('errors when old_string is missing from the file', async () => {
    files.set('/home/user/a.txt', 'hello')
    expect(await edit.execute({ path: '/home/user/a.txt', old_string: 'nope', new_string: 'x' })).toMatch(/^Error:.*not found/)
  })

  it('errors on ambiguous match without replace_all', async () => {
    files.set('/home/user/a.txt', 'aa aa')
    expect(await edit.execute({ path: '/home/user/a.txt', old_string: 'aa', new_string: 'b' })).toMatch(/^Error:.*2 times/)
  })

  it('replaces all occurrences with replace_all', async () => {
    files.set('/home/user/a.txt', 'aa aa')
    await edit.execute({ path: '/home/user/a.txt', old_string: 'aa', new_string: 'b', replace_all: true })
    expect(files.get('/home/user/a.txt')).toBe('b b')
  })

  it('errors on missing file and empty old_string', async () => {
    expect(await edit.execute({ path: '/home/user/none.txt', old_string: 'x', new_string: 'y' })).toMatch(/^Error:/)
    expect(await edit.execute({ path: '/home/user/a.txt', old_string: '', new_string: 'y' })).toMatch(/^Error:/)
  })
})
