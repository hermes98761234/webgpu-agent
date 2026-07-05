import { beforeEach, describe, expect, it, vi } from 'vitest'
import { files, resetMemfs } from './test/memfs'
import { DEFAULT_SYSTEM_PROMPT, initAgentHome, LEGACY_DEFAULT_PROMPT, writeAgentMd } from './agenthome'

vi.mock('./fs/setup', () => import('./test/memfs'))

beforeEach(() => {
  resetMemfs()
  localStorage.clear()
})

describe('initAgentHome migration', () => {
  it('replaces the legacy stock prompt with the new default', async () => {
    // Simulate a prior install: marker + agent.md already present with the legacy prompt.
    await writeAgentMd(LEGACY_DEFAULT_PROMPT)
    files.set('/home/user/.agent/.initialized', new Date().toISOString())

    const data = await initAgentHome()

    expect(data.systemPrompt).toBe(DEFAULT_SYSTEM_PROMPT)
    expect(files.get('/home/user/.agent/agent.md')).toBe(DEFAULT_SYSTEM_PROMPT)
  })

  it('leaves a customized prompt untouched', async () => {
    await writeAgentMd('my custom prompt')
    files.set('/home/user/.agent/.initialized', new Date().toISOString())

    const data = await initAgentHome()

    expect(data.systemPrompt).toBe('my custom prompt')
    expect(files.get('/home/user/.agent/agent.md')).toBe('my custom prompt')
  })
})
