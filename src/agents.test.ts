import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./fs/setup', async () => await import('./test/memfs'))

import { files, resetMemfs } from './test/memfs'
import { AGENTS_DIR, loadAgentTypes, parseAgentMd, seedDefaultAgents } from './agents'

beforeEach(() => resetMemfs())

describe('parseAgentMd', () => {
  it('parses frontmatter and body', () => {
    const t = parseAgentMd('---\nname: explorer\ndescription: finds things\n---\n\nYou explore.\n')
    expect(t).toEqual({ name: 'explorer', description: 'finds things', prompt: 'You explore.' })
  })

  it('returns null without frontmatter or name', () => {
    expect(parseAgentMd('just text')).toBeNull()
    expect(parseAgentMd('---\ndescription: no name\n---\nbody')).toBeNull()
  })
})

describe('seed + load', () => {
  it('seeds explorer and coder, then loads them', async () => {
    await seedDefaultAgents()
    const types = await loadAgentTypes()
    expect(types.map((t) => t.name).sort()).toEqual(['coder', 'explorer'])
    expect(types.find((t) => t.name === 'explorer')!.prompt).toContain('read-only')
  })

  it('does not overwrite a customized agent file', async () => {
    files.set(`${AGENTS_DIR}/explorer.md`, '---\nname: explorer\ndescription: mine\n---\nCustom prompt')
    await seedDefaultAgents()
    const types = await loadAgentTypes()
    expect(types.find((t) => t.name === 'explorer')!.prompt).toBe('Custom prompt')
  })
})
