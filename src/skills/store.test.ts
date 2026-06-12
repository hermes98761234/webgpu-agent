import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteSkill, loadSkills, makeUseSkillTool, upsertSkill } from './store'
import type { Skill } from '../types'

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

const skill: Skill = {
  id: 's1',
  name: 'haiku',
  description: 'Write haiku',
  instructions: 'Always answer in 5-7-5 haiku form.',
}

beforeEach(() => {
  mem.clear()
})

describe('skill store', () => {
  it('loads empty list initially', () => {
    expect(loadSkills()).toEqual([])
  })

  it('upserts and persists', () => {
    upsertSkill([], skill)
    expect(loadSkills()).toEqual([skill])
    const updated = { ...skill, description: 'changed' }
    upsertSkill(loadSkills(), updated)
    expect(loadSkills()).toEqual([updated])
  })

  it('deletes', () => {
    upsertSkill([], skill)
    deleteSkill(loadSkills(), 's1')
    expect(loadSkills()).toEqual([])
  })
})

describe('use_skill tool', () => {
  it('returns instructions for a known skill', async () => {
    const tool = makeUseSkillTool(() => [skill])
    expect(tool.description).toContain('haiku')
    const out = await tool.execute({ name: 'haiku' })
    expect(out).toContain('5-7-5')
  })

  it('returns helpful error for unknown skill', async () => {
    const tool = makeUseSkillTool(() => [skill])
    const out = await tool.execute({ name: 'nope' })
    expect(out).toContain('no skill named')
    expect(out).toContain('haiku')
  })
})
