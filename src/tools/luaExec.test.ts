// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { execLua } from './luaExec'

describe('execLua', () => {
  it('captures print output', async () => {
    expect(await execLua('print("hi") print(1 + 2)')).toBe('hi\n3')
  })

  it('prints the value of a return expression', async () => {
    expect(await execLua('return 6 * 7')).toBe('42')
  })

  it('returns Error: for syntax errors', async () => {
    expect(await execLua('this is not lua')).toMatch(/^Error:/)
  })

  it('returns Error: for runtime errors', async () => {
    expect(await execLua('error("boom")')).toMatch(/^Error:.*boom/)
  })

  it('returns (no output) for silent code', async () => {
    expect(await execLua('local x = 1')).toBe('(no output)')
  })
})
