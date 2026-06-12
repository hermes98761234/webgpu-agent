import type { ToolDef } from '../types'
import { pfs, ensureDir, AGENT_MD, HOME, MCP_CONFIG, SKILLS_DIR, PLUGINS_DIR } from '../fs/setup'

const MAX_READ_BYTES = 50 * 1024

const PROTECTED_PATHS = [AGENT_MD, MCP_CONFIG]
const PROTECTED_DIRS = [SKILLS_DIR, PLUGINS_DIR]

/** Models often pass "~/x", relative paths, or padded strings; resolve to a clean absolute path. */
function resolvePath(raw: unknown): string {
  let path = String(raw ?? '').trim()
  if (path === '~') path = HOME
  else if (path.startsWith('~/')) path = `${HOME}/${path.slice(2)}`
  if (!path.startsWith('/')) path = `${HOME}/${path}`
  return path.replace(/\/{2,}/g, '/')
}

function isProtected(path: string): boolean {
  const normalized = path.replace(/\/+$/, '')
  if (PROTECTED_PATHS.includes(normalized)) return true
  for (const dir of PROTECTED_DIRS) {
    if (normalized === dir || normalized.startsWith(dir + '/')) return true
  }
  return false
}

const fsRead: ToolDef = {
  name: 'fs_read',
  description: 'Read a file from the virtual filesystem.',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Absolute file path (~ and home-relative paths are resolved)' } },
    required: ['path'],
  },
  source: 'builtin',
  async execute(args) {
    try {
      const data = await pfs.readFile(resolvePath(args.path), { encoding: 'utf8' }) as string
      if (data.length > MAX_READ_BYTES) {
        return data.slice(0, MAX_READ_BYTES) + '\n[truncated at 50KB]'
      }
      return data
    } catch (e) {
      return `Error: ${String(e)}`
    }
  },
}

const fsWrite: ToolDef = {
  name: 'fs_write',
  description: 'Write content to a file, creating parent directories as needed.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute file path (~ and home-relative paths are resolved)' },
      content: { type: 'string', description: 'File content' },
    },
    required: ['path', 'content'],
  },
  source: 'builtin',
  async execute(args) {
    try {
      const path = resolvePath(args.path)
      if (isProtected(path)) return `Error: writing to system path '${path}' is not allowed`
      const dir = path.substring(0, path.lastIndexOf('/')) || '/'
      await ensureDir(dir)
      await pfs.writeFile(path, String(args.content), 'utf8')
      return `Written: ${path}`
    } catch (e) {
      return `Error: ${String(e)}`
    }
  },
}

const fsCreate: ToolDef = {
  name: 'fs_create',
  description: 'Create a file (empty unless content is given), creating parent directories as needed.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute file path (~ and home-relative paths are resolved)' },
      content: { type: 'string', description: 'Initial file content (defaults to empty)' },
    },
    required: ['path'],
  },
  source: 'builtin',
  async execute(args) {
    try {
      const path = resolvePath(args.path)
      if (isProtected(path)) return `Error: creating file at system path '${path}' is not allowed`
      const dir = path.substring(0, path.lastIndexOf('/')) || '/'
      await ensureDir(dir)
      await pfs.writeFile(path, String(args.content ?? ''), 'utf8')
      return `Created: ${path}`
    } catch (e) {
      return `Error: ${String(e)}`
    }
  },
}

const fsList: ToolDef = {
  name: 'fs_list',
  description: 'List directory contents.',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Absolute directory path (~ and home-relative paths are resolved)' } },
    required: ['path'],
  },
  source: 'builtin',
  async execute(args) {
    try {
      const path = resolvePath(args.path)
      const names = await pfs.readdir(path)
      const entries = await Promise.all(
        names.map(async (name: string) => {
          try {
            const stat = await pfs.stat(`${path}/${name}`)
            return {
              name,
              type: stat.isDirectory() ? 'directory' : 'file',
              size: stat.size,
            }
          } catch {
            return { name, type: 'unknown', size: 0 }
          }
        }),
      )
      return JSON.stringify(entries)
    } catch (e) {
      return `Error: ${String(e)}`
    }
  },
}

async function deleteRecursive(path: string): Promise<void> {
  const stat = await pfs.stat(path)
  if (stat.isDirectory()) {
    const names = await pfs.readdir(path)
    for (const name of names) {
      await deleteRecursive(`${path}/${name}`)
    }
    await pfs.rmdir(path)
  } else {
    await pfs.unlink(path)
  }
}

const fsDelete: ToolDef = {
  name: 'fs_delete',
  description: 'Delete a file or directory.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path to delete (~ and home-relative paths are resolved)' },
      recursive: { type: 'boolean', description: 'Delete directory recursively' },
    },
    required: ['path'],
  },
  source: 'builtin',
  async execute(args) {
    try {
      const path = resolvePath(args.path)
      if (isProtected(path)) return `Error: deleting system path '${path}' is not allowed`
      if (args.recursive) {
        await deleteRecursive(path)
      } else {
        const stat = await pfs.stat(path)
        if (stat.isDirectory()) {
          await pfs.rmdir(path)
        } else {
          await pfs.unlink(path)
        }
      }
      return `Deleted: ${path}`
    } catch (e) {
      return `Error: ${String(e)}`
    }
  },
}

const fsMkdir: ToolDef = {
  name: 'fs_mkdir',
  description: 'Create a directory (including parent directories).',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Absolute directory path (~ and home-relative paths are resolved)' } },
    required: ['path'],
  },
  source: 'builtin',
  async execute(args) {
    try {
      const path = resolvePath(args.path)
      if (isProtected(path)) return `Error: creating directory at system path '${path}' is not allowed`
      await ensureDir(path)
      return `Created: ${path}`
    } catch (e) {
      return `Error: ${String(e)}`
    }
  },
}

const fsMove: ToolDef = {
  name: 'fs_move',
  description: 'Rename or move a file or directory.',
  parameters: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'Source path (~ and home-relative paths are resolved)' },
      to: { type: 'string', description: 'Destination path (~ and home-relative paths are resolved)' },
    },
    required: ['from', 'to'],
  },
  source: 'builtin',
  async execute(args) {
    try {
      const from = resolvePath(args.from)
      const to = resolvePath(args.to)
      if (isProtected(from)) return `Error: moving system path '${from}' is not allowed`
      if (isProtected(to)) return `Error: moving to system path '${to}' is not allowed`
      await pfs.rename(from, to)
      return `Moved: ${from} → ${to}`
    } catch (e) {
      return `Error: ${String(e)}`
    }
  },
}

export const fsTools: ToolDef[] = [fsRead, fsWrite, fsCreate, fsList, fsDelete, fsMkdir, fsMove]
