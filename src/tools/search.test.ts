import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../fs/setup', async () => await import('../test/memfs'))

import { files, dirs, resetMemfs } from '../test/memfs'
import { globToRegex, searchTools } from './search'

const grep = () => searchTools.find((t) => t.name === 'grep')!
const glob = () => searchTools.find((t) => t.name === 'glob')!

beforeEach(() => {
  resetMemfs()
  dirs.add('/home')
  dirs.add('/home/user')
  dirs.add('/home/user/src')
  files.set('/home/user/src/a.ts', 'const foo = 1\nconst bar = 2\n')
  files.set('/home/user/src/b.md', 'foo docs\n')
  files.set('/home/user/readme.txt', 'nothing here\n')
})

describe('globToRegex', () => {
  it('handles *, ** and ?', () => {
    expect(globToRegex('*.ts').test('a.ts')).toBe(true)
    expect(globToRegex('*.ts').test('src/a.ts')).toBe(false)
    expect(globToRegex('**/*.ts').test('src/deep/a.ts')).toBe(true)
    expect(globToRegex('a?.ts').test('ab.ts')).toBe(true)
    expect(globToRegex('a?.ts').test('abc.ts')).toBe(false)
    expect(globToRegex('*.ts').test('a.tsx')).toBe(false)
  })
})

describe('grep', () => {
  it('returns path:line: text matches', async () => {
    const res = await grep().execute({ pattern: 'foo' })
    expect(res).toContain('/home/user/src/a.ts:1: const foo = 1')
    expect(res).toContain('/home/user/src/b.md:1: foo docs')
  })

  it('filters with include glob', async () => {
    const res = await grep().execute({ pattern: 'foo', include: '*.ts' })
    expect(res).toContain('a.ts')
    expect(res).not.toContain('b.md')
  })

  it('scopes to path and reports no matches', async () => {
    expect(await grep().execute({ pattern: 'nothing', path: '/home/user/src' })).toBe('No matches')
    expect(await grep().execute({ pattern: 'zzz' })).toBe('No matches')
  })

  it('rejects invalid regex with an Error string', async () => {
    expect(await grep().execute({ pattern: '(' })).toMatch(/^Error:.*regex/)
  })
})

describe('glob tool', () => {
  it('finds files by pattern', async () => {
    const res = await glob().execute({ pattern: '**/*.ts' })
    expect(res).toContain('/home/user/src/a.ts')
    expect(res).not.toContain('b.md')
  })

  it('matches bare filename patterns anywhere', async () => {
    const res = await glob().execute({ pattern: '*.md' })
    expect(res).toContain('/home/user/src/b.md')
  })
})
