// In-memory stand-in for src/fs/setup.ts, used via vi.mock in unit tests.
export const files = new Map<string, string>()
export const dirs = new Set<string>(['/'])

export function resetMemfs(): void {
  files.clear()
  dirs.clear()
  dirs.add('/')
}

const norm = (p: string): string => p.replace(/\/+$/, '') || '/'

export const ROOT = '/'
export const HOME = '/home/user'
export const AGENT_DIR = `${HOME}/.agent`
export const SKILLS_DIR = `${AGENT_DIR}/skills`
export const PLUGINS_DIR = `${AGENT_DIR}/plugins`
export const AGENT_MD = `${AGENT_DIR}/agent.md`
export const MCP_CONFIG = `${AGENT_DIR}/mcp.json`
export const MEMORY_DIR = `${AGENT_DIR}/memory`
export const MEMORY_INDEX = `${MEMORY_DIR}/MEMORY.md`

export const pfs = {
  async mkdir(p: string): Promise<void> {
    p = norm(p)
    if (dirs.has(p) || files.has(p)) throw new Error(`EEXIST: ${p}`)
    dirs.add(p)
  },
  async readdir(p: string): Promise<string[]> {
    p = norm(p)
    if (!dirs.has(p)) throw new Error(`ENOENT: ${p}`)
    const prefix = p === '/' ? '/' : `${p}/`
    const names = new Set<string>()
    for (const entry of [...files.keys(), ...dirs]) {
      if (entry !== p && entry.startsWith(prefix)) names.add(entry.slice(prefix.length).split('/')[0])
    }
    return [...names]
  },
  async readFile(p: string): Promise<string> {
    const v = files.get(norm(p))
    if (v === undefined) throw new Error(`ENOENT: ${p}`)
    return v
  },
  async writeFile(p: string, data: string): Promise<void> {
    files.set(norm(p), data)
  },
  async unlink(p: string): Promise<void> {
    files.delete(norm(p))
  },
  async rmdir(p: string): Promise<void> {
    dirs.delete(norm(p))
  },
  async stat(p: string): Promise<object> {
    p = norm(p)
    if (files.has(p) || dirs.has(p)) return {}
    throw new Error(`ENOENT: ${p}`)
  },
}

export const fs = { promises: pfs }

export async function ensureDir(path: string): Promise<void> {
  const parts = path.split('/').filter(Boolean)
  let current = ''
  for (const part of parts) {
    current += '/' + part
    dirs.add(current)
  }
}
