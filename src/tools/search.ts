import type { ToolDef } from '../types'
import { pfs, HOME } from '../fs/setup'
import { resolvePath } from './fs'

export function globToRegex(glob: string): RegExp {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*'
        i++
        if (glob[i + 1] === '/') i++
      } else {
        re += '[^/]*'
      }
    } else if (c === '?') {
      re += '[^/]'
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`^${re}$`)
}

const MAX_MATCHES = 100
const MAX_FILES = 2000

async function walk(dir: string, out: string[], depth = 0): Promise<void> {
  if (depth > 20 || out.length >= MAX_FILES) return
  let entries: string[]
  try {
    entries = await pfs.readdir(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (name === '.git') continue
    const full = dir === '/' ? `/${name}` : `${dir}/${name}`
    try {
      const st = (await pfs.stat(full)) as { type?: string }
      if (st.type === 'dir') await walk(full, out, depth + 1)
      else out.push(full)
    } catch {
      // vanished between readdir and stat — skip
    }
  }
}

/** Match either the full path or the basename, so "*.ts" works anywhere. */
function matches(re: RegExp, path: string): boolean {
  return re.test(path) || re.test(path.replace(/^\//, '')) || re.test(path.split('/').pop() ?? '')
}

const grepTool: ToolDef = {
  name: 'grep',
  description:
    'Search file contents with a regular expression. Returns matching lines as path:line: text (max 100 matches). Searches under path (default: home directory); include filters files with a glob like "*.ts" or "src/**/*.md".',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'JavaScript regular expression' },
      path: { type: 'string', description: 'Directory to search (default /home/user)' },
      include: { type: 'string', description: 'Glob filter on file paths' },
    },
    required: ['pattern'],
  },
  source: 'builtin',
  async execute(args) {
    try {
      let re: RegExp
      try {
        re = new RegExp(String(args.pattern ?? ''))
      } catch (e) {
        return `Error: invalid regex: ${String(e)}`
      }
      const root = args.path ? resolvePath(args.path) : HOME
      const inc = args.include ? globToRegex(String(args.include)) : null
      const paths: string[] = []
      await walk(root, paths)
      const out: string[] = []
      for (const f of paths) {
        if (inc && !matches(inc, f)) continue
        let data: string
        try {
          data = String(await pfs.readFile(f, { encoding: 'utf8' }))
        } catch {
          continue
        }
        if (data.includes('\u0000')) continue // binary
        const lines = data.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (re.test(lines[i])) {
            out.push(`${f}:${i + 1}: ${lines[i].slice(0, 200)}`)
            if (out.length >= MAX_MATCHES) return out.join('\n') + `\n[truncated at ${MAX_MATCHES} matches]`
          }
        }
      }
      return out.length ? out.join('\n') : 'No matches'
    } catch (e) {
      return `Error: ${String(e)}`
    }
  },
}

const globTool: ToolDef = {
  name: 'glob',
  description:
    'Find files by glob pattern (supports *, ** and ?), e.g. "**/*.ts" or "*.md". Searches under path (default: home directory). Returns matching file paths.',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern' },
      path: { type: 'string', description: 'Directory to search (default /home/user)' },
    },
    required: ['pattern'],
  },
  source: 'builtin',
  async execute(args) {
    try {
      const re = globToRegex(String(args.pattern ?? ''))
      const root = args.path ? resolvePath(args.path) : HOME
      const paths: string[] = []
      await walk(root, paths)
      const out = paths.filter((p) => matches(re, p)).slice(0, 200)
      return out.length ? out.join('\n') : 'No matches'
    } catch (e) {
      return `Error: ${String(e)}`
    }
  },
}

export const searchTools: ToolDef[] = [grepTool, globTool]
