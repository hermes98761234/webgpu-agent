import { describe, expect, it } from 'vitest'
import { DEFAULT_SKILLS } from './defaults'

describe('DEFAULT_SKILLS', () => {
  it('has at least one skill', () => {
    expect(DEFAULT_SKILLS.length).toBeGreaterThan(0)
  })

  it('each skill has required fields', () => {
    for (const skill of DEFAULT_SKILLS) {
      expect(typeof skill.id).toBe('string')
      expect(typeof skill.name).toBe('string')
      expect(typeof skill.description).toBe('string')
      expect(typeof skill.instructions).toBe('string')
      expect(skill.id.length).toBeGreaterThan(0)
      expect(skill.name.length).toBeGreaterThan(0)
      expect(skill.description.length).toBeGreaterThan(0)
      expect(skill.instructions.length).toBeGreaterThan(0)
    }
  })

  it('contains file-system skill', () => {
    expect(DEFAULT_SKILLS.some((s) => s.id === 'file-system')).toBe(true)
  })

  it('contains python skill', () => {
    expect(DEFAULT_SKILLS.some((s) => s.id === 'python')).toBe(true)
  })

  it('contains git skill', () => {
    expect(DEFAULT_SKILLS.some((s) => s.id === 'git')).toBe(true)
  })

  it('all ids are unique', () => {
    const ids = DEFAULT_SKILLS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
