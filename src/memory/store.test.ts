import { beforeEach, describe, expect, it, vi } from 'vitest'
import { files, resetMemfs } from '../test/memfs'
import { deleteMemory, makeMemoryTools, memorySlug, readMemoryIndex, saveMemory } from './store'

vi.mock('../fs/setup', () => import('../test/memfs'))

beforeEach(() => {
  resetMemfs()
})

describe('memorySlug', () => {
  it('produces fs-safe names', () => {
    expect(memorySlug('User Prefers Dark')).toBe('user-prefers-dark')
    expect(memorySlug('!!!')).toBe('memory')
  })
})

describe('memory store (files under /home/user/.agent/memory)', () => {
  it('index is empty initially', async () => {
    expect(await readMemoryIndex()).toBe('')
  })

  it('saveMemory writes the file and adds an index line', async () => {
    const path = await saveMemory('Fav Color', 'User favorite color', 'The user prefers green.')
    expect(path).toBe('/home/user/.agent/memory/fav-color.md')
    const raw = files.get(path)
    expect(raw).toContain('name: fav-color')
    expect(raw).toContain('description: User favorite color')
    expect(raw).toContain('prefers green')
    expect(await readMemoryIndex()).toBe(
      '- [fav-color](/home/user/.agent/memory/fav-color.md) — User favorite color\n',
    )
  })

  it('saving the same name twice overwrites without duplicating the index line', async () => {
    await saveMemory('fav-color', 'old', 'old fact')
    await saveMemory('fav-color', 'new summary', 'new fact')
    const index = await readMemoryIndex()
    expect(index.trim().split('\n')).toHaveLength(1)
    expect(index).toContain('new summary')
    expect(files.get('/home/user/.agent/memory/fav-color.md')).toContain('new fact')
  })

  it('deleteMemory removes the file and the index line', async () => {
    await saveMemory('a', 'fact a', 'A.')
    await saveMemory('b', 'fact b', 'B.')
    expect(await deleteMemory('a')).toBe(true)
    expect(files.has('/home/user/.agent/memory/a.md')).toBe(false)
    const index = await readMemoryIndex()
    expect(index).not.toContain('fact a')
    expect(index).toContain('fact b')
  })

  it('deleteMemory returns false for unknown names', async () => {
    expect(await deleteMemory('nope')).toBe(false)
  })
})

describe('memory tools', () => {
  it('memory_save persists and reports the path', async () => {
    const [save] = makeMemoryTools()
    const out = await save.execute({ name: 'Build Cmd', description: 'How to build', content: 'Run npm run build.' })
    expect(out).toContain('/home/user/.agent/memory/build-cmd.md')
    expect(await readMemoryIndex()).toContain('How to build')
  })

  it('memory_save validates arguments', async () => {
    const [save] = makeMemoryTools()
    expect(await save.execute({ name: 'x' })).toContain('Error')
  })

  it('memory_delete removes a memory and errors on unknown', async () => {
    const [, del] = makeMemoryTools()
    await saveMemory('a', 'd', 'c')
    expect(await del.execute({ name: 'a' })).toContain('Deleted')
    expect(await del.execute({ name: 'a' })).toContain('Error')
  })
})
