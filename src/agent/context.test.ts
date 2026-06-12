import { describe, expect, it } from 'vitest'
import type { Skill } from '../types'
import { buildAgentSystemPrompt, buildMemorySection, buildSkillsSection } from './context'

const skills: Skill[] = [
  { id: 'haiku', name: 'haiku', description: 'Write haiku', instructions: 'Always 5-7-5.' },
  { id: 'git', name: 'Git', description: 'Use git tools', instructions: 'Use git_* tools.' },
]

describe('buildSkillsSection', () => {
  it('returns empty string with no skills', () => {
    expect(buildSkillsSection([])).toBe('')
  })

  it('lists headers only, not instructions', () => {
    const out = buildSkillsSection(skills)
    expect(out).toContain('# Skills')
    expect(out).toContain('- haiku: Write haiku')
    expect(out).toContain('use_skill')
    expect(out).not.toContain('5-7-5')
  })
})

describe('buildMemorySection', () => {
  it('shows placeholder when index is empty', () => {
    expect(buildMemorySection('')).toContain('(no memories saved yet)')
  })

  it('embeds the index and tool guidance', () => {
    const out = buildMemorySection('- [a](a.md) — fact a\n')
    expect(out).toContain('- [a](a.md) — fact a')
    expect(out).toContain('memory_save')
    expect(out).toContain('fs_read')
  })
})

describe('buildAgentSystemPrompt', () => {
  it('joins base, skills and memory sections', () => {
    const out = buildAgentSystemPrompt('Base prompt.', skills, '')
    expect(out.startsWith('Base prompt.')).toBe(true)
    expect(out).toContain('# Skills')
    expect(out).toContain('# Memory')
  })

  it('omits the skills section when there are none', () => {
    const out = buildAgentSystemPrompt('Base.', [], '')
    expect(out).not.toContain('# Skills')
    expect(out).toContain('# Memory')
  })
})
