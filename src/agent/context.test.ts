import { describe, expect, it } from 'vitest'
import type { Skill, ToolDef } from '../types'
import {
  buildAgentSystemPrompt,
  buildMemorySection,
  buildSkillsSection,
  buildToolOverviewSection,
} from './context'

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
    expect(buildMemorySection('', [])).toContain('(no memories saved yet)')
  })

  it('embeds the index and tool guidance', () => {
    const out = buildMemorySection('- [a](a.md) — fact a\n', [])
    expect(out).toContain('- [a](a.md) — fact a')
    expect(out).toContain('memory_save')
  })

  it('inlines full memory file contents', () => {
    const files = [{ slug: 'a', path: 'a.md', content: 'The fact content here.' }]
    const out = buildMemorySection('- [a](a.md) — fact a\n', files)
    expect(out).toContain('## Memory contents')
    expect(out).toContain('### a')
    expect(out).toContain('The fact content here.')
  })
})

describe('buildAgentSystemPrompt', () => {
  it('joins base, skills and memory sections', () => {
    const out = buildAgentSystemPrompt('Base prompt.', skills, '')
    expect(out).toContain('Current time:')
    expect(out).toContain('Base prompt.')
    expect(out).toContain('# Skills')
    expect(out).toContain('# Memory')
  })

  it('omits the skills section when there are none', () => {
    const out = buildAgentSystemPrompt('Base.', [], '')
    expect(out).not.toContain('# Skills')
    expect(out).toContain('# Memory')
  })
})

const mkTool = (name: string, description: string): ToolDef => ({
  name,
  description,
  parameters: { type: 'object', properties: {} },
  source: 'builtin',
  execute: async () => '',
})

describe('buildToolOverviewSection', () => {
  it('groups tools by category with one line each', () => {
    const s = buildToolOverviewSection([
      mkTool('fs_read', 'Read a file from the virtual filesystem.'),
      mkTool('grep', 'Search file contents with a regular expression. Returns matching lines.'),
      mkTool('run_python', 'Run Python in a sandboxed worker. Use print() for output.'),
      mkTool('mystery_tool', 'Does something.'),
    ])
    expect(s).toContain('# Tools')
    expect(s).toContain('**Files**')
    expect(s).toContain('- fs_read: Read a file from the virtual filesystem.')
    expect(s).toContain('**Search**')
    expect(s).toContain('**Code execution**')
    expect(s).toContain('**Other**')
    // only the first sentence of a description
    expect(s).toContain('- grep: Search file contents with a regular expression.')
    expect(s).not.toContain('Returns matching lines')
  })

  it('is empty for no tools and included in the system prompt', () => {
    expect(buildToolOverviewSection([])).toBe('')
    const withTools = buildAgentSystemPrompt('base', [], '', [], [mkTool('fs_read', 'Read.')])
    expect(withTools).toContain('# Tools')
    const without = buildAgentSystemPrompt('base', [], '', [])
    expect(without).not.toContain('# Tools')
  })
})
