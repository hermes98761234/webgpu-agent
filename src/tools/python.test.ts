import { describe, expect, it } from 'vitest'
import { execPython, type PyRuntime } from './python'

function fakeRuntime(overrides: Partial<PyRuntime> = {}): PyRuntime & { terminated: boolean } {
  const state = { stdout: '', err: '' }
  const rt = {
    terminated: false,
    async execute(code: string) {
      // simulate the wrapped exec: real behavior is tested in-browser
      if (code.includes('boom')) state.err = 'ValueError: boom'
      else state.stdout = 'hello\n'
    },
    async evaluate(expr: string) {
      if (expr === '__err or ""') return state.err
      if (expr === 'sys.stdout.getvalue()') return state.stdout
      return ''
    },
    terminate() {
      this.terminated = true
    },
    ...overrides,
  }
  return rt as PyRuntime & { terminated: boolean }
}

describe('execPython', () => {
  it('returns captured stdout on success', async () => {
    const { output, timedOut } = await execPython('print("hello")', fakeRuntime())
    expect(output).toBe('hello\n')
    expect(timedOut).toBe(false)
  })

  it('returns Error: for python exceptions', async () => {
    const { output } = await execPython('raise ValueError("boom")', fakeRuntime())
    expect(output).toBe('Error: ValueError: boom')
  })

  it('returns (no output) when stdout is empty', async () => {
    const rt = fakeRuntime({ execute: async () => {}, evaluate: async () => '' })
    const { output } = await execPython('x = 1', rt)
    expect(output).toBe('(no output)')
  })

  it('terminates the runtime and reports timedOut on timeout', async () => {
    const rt = fakeRuntime({ execute: () => new Promise<void>(() => {}) })
    const { output, timedOut } = await execPython('while True: pass', rt, 30)
    expect(timedOut).toBe(true)
    expect(rt.terminated).toBe(true)
    expect(output).toContain('timed out')
  })

  it('never throws — bridge errors come back as Error: strings', async () => {
    const rt = fakeRuntime({ execute: async () => { throw new Error('JsNull') } })
    const { output, timedOut } = await execPython('x', rt)
    expect(output).toContain('Error:')
    expect(timedOut).toBe(false)
  })

  it('passes only string-producing expressions to evaluate (JsNull regression guard)', async () => {
    const seen: string[] = []
    const rt = fakeRuntime()
    const origEval = rt.evaluate.bind(rt)
    rt.evaluate = async (expr: string) => {
      seen.push(expr)
      return origEval(expr)
    }
    await execPython('x = 1', rt)
    expect(seen).toContain('__err or ""')
    expect(seen).not.toContain('__err')
  })
})
