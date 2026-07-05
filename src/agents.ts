import { AGENT_DIR, ensureDir, pfs } from './fs/setup'

export const AGENTS_DIR = `${AGENT_DIR}/agents`

export interface AgentType {
  name: string
  description: string
  prompt: string
}

export function parseAgentMd(raw: string): AgentType | null {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return null
  const meta: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/)
    if (kv) meta[kv[1]] = kv[2].trim()
  }
  if (!meta.name) return null
  return { name: meta.name, description: meta.description ?? '', prompt: m[2].trim() }
}

export const DEFAULT_AGENT_TYPES: AgentType[] = [
  {
    name: 'explorer',
    description: 'read-only research: finds files and answers questions without modifying anything',
    prompt:
      'You are a read-only research subagent. Investigate the task using fs_read, fs_list, grep, glob, git_log and git_diff. Do not create, modify, or delete any files. Finish with a concise report of findings including exact file paths.',
  },
  {
    name: 'coder',
    description: 'implementation: makes precise code changes and verifies them',
    prompt:
      'You are an implementation subagent. Make the requested change with the minimum diff: locate code with grep/glob, read before editing, prefer fs_edit for existing files, and verify your work by re-reading files or running code. Finish with a summary of what changed and how you verified it.',
  },
]

export async function seedDefaultAgents(): Promise<void> {
  await ensureDir(AGENTS_DIR)
  for (const a of DEFAULT_AGENT_TYPES) {
    const path = `${AGENTS_DIR}/${a.name}.md`
    try {
      await pfs.stat(path)
    } catch {
      await pfs.writeFile(path, `---\nname: ${a.name}\ndescription: ${a.description}\n---\n\n${a.prompt}\n`, 'utf8')
    }
  }
}

export async function loadAgentTypes(): Promise<AgentType[]> {
  try {
    const entries = await pfs.readdir(AGENTS_DIR)
    const out: AgentType[] = []
    for (const f of entries) {
      if (!f.endsWith('.md')) continue
      try {
        const t = parseAgentMd(String(await pfs.readFile(`${AGENTS_DIR}/${f}`, { encoding: 'utf8' })))
        if (t) out.push(t)
      } catch {
        // unreadable file — skip
      }
    }
    return out
  } catch {
    return []
  }
}
