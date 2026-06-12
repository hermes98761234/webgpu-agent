import { beforeEach, describe, expect, it, vi } from 'vitest'
import { files, resetMemfs } from '../test/memfs'
import type { Skill } from '../types'
import { deleteSkill, loadSkills, makeUseSkillTool, slugify, upsertSkill, writeSkillFiles } from './store'

vi.mock('../fs/setup', () => import('../test/memfs'))

const skill: Skill = {
  id: 's1',
  name: 'haiku',
  description: 'Write haiku',
  instructions: 'Always answer in 5-7-5 haiku form.',
}
// upsertSkill re-keys skills by slug(name)
const saved: Skill = { ...skill, id: 'haiku' }

beforeEach(() => {
  resetMemfs()
})

describe('slugify', () => {
  it('produces fs-safe directory names', () => {
    expect(slugify('File System')).toBe('file-system')
    expect(slugify('  Héllo!! World ')).toBe('h-llo-world')
    expect(slugify('!!!')).toBe('skill')
  })
})

describe('skill store (files under /home/user/.agent/skills)', () => {
  it('loads empty list initially', async () => {
    expect(await loadSkills()).toEqual([])
  })

  it('writes SKILL.md with frontmatter and reloads it', async () => {
    await writeSkillFiles(saved)
    const raw = files.get('/home/user/.agent/skills/haiku/SKILL.md')
    expect(raw).toContain('name: haiku')
    expect(raw).toContain('description: Write haiku')
    expect(raw).toContain('5-7-5')
    expect(await loadSkills()).toEqual([saved])
  })

  it('upserts: returns the new list and persists to files', async () => {
    const list = upsertSkill([], skill)
    expect(list).toEqual([saved])
    await vi.waitFor(async () => {
      expect(await loadSkills()).toEqual([saved])
    })
    const updated = { ...saved, description: 'changed' }
    expect(upsertSkill(list, updated)).toEqual([updated])
    await vi.waitFor(async () => {
      expect(await loadSkills()).toEqual([updated])
    })
  })

  it('renaming moves the skill to a new directory', async () => {
    const list = upsertSkill([], skill)
    await vi.waitFor(async () => {
      expect(await loadSkills()).toHaveLength(1)
    })
    upsertSkill(list, { ...saved, name: 'Haiku Poems' })
    await vi.waitFor(async () => {
      expect(await loadSkills()).toEqual([{ ...saved, name: 'Haiku Poems', id: 'haiku-poems' }])
    })
  })

  it('deletes', async () => {
    const list = upsertSkill([], skill)
    await vi.waitFor(async () => {
      expect(await loadSkills()).toHaveLength(1)
    })
    expect(deleteSkill(list, 'haiku')).toEqual([])
    await vi.waitFor(async () => {
      expect(await loadSkills()).toEqual([])
    })
  })
})

describe('use_skill tool', () => {
  it('returns instructions for a known skill', async () => {
    const tool = makeUseSkillTool(() => [skill])
    expect(tool.description).toContain('# Skills')
    const out = await tool.execute({ name: 'haiku' })
    expect(out).toContain('5-7-5')
  })

  it('matches names case-insensitively and by slug', async () => {
    const tool = makeUseSkillTool(() => [{ ...skill, name: 'Haiku Poems', id: 'haiku-poems' }])
    expect(await tool.execute({ name: 'haiku poems' })).toContain('5-7-5')
    expect(await tool.execute({ name: 'haiku-poems' })).toContain('5-7-5')
    expect(await tool.execute({ name: ' Haiku Poems ' })).toContain('5-7-5')
  })

  it('returns helpful error for unknown skill', async () => {
    const tool = makeUseSkillTool(() => [skill])
    const out = await tool.execute({ name: 'nope' })
    expect(out).toContain('no skill named')
    expect(out).toContain('haiku')
  })
})
