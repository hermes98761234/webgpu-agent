import type { ToolDef } from '../types'
import { pfs, ensureDir } from '../fs/setup'

const MAX_READ_BYTES = 50 * 1024

const fsRead: ToolDef = {
  name: 'fs_read',
  description: 'Read a file from the virtual filesystem.',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Absolute file path' } },
    required: ['path'],
  },
  source: 'builtin',
  async execute(args) {
    try {
      const data = await pfs.readFile(String(args.path), { encoding: 'utf8' }) as string
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
      path: { type: 'string', description: 'Absolute file path' },
      content: { type: 'string', description: 'File content' },
    },
    required: ['path', 'content'],
  },
  source: 'builtin',
  async execute(args) {
    try {
      const path = String(args.path)
      const dir = path.substring(0, path.lastIndexOf('/')) || '/'
      await ensureDir(dir)
      await pfs.writeFile(path, String(args.content), 'utf8')
      return `Written: ${path}`
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
    properties: { path: { type: 'string', description: 'Absolute directory path' } },
    required: ['path'],
  },
  source: 'builtin',
  async execute(args) {
    try {
      const path = String(args.path)
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
      path: { type: 'string', description: 'Absolute path to delete' },
      recursive: { type: 'boolean', description: 'Delete directory recursively' },
    },
    required: ['path'],
  },
  source: 'builtin',
  async execute(args) {
    try {
      const path = String(args.path)
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
    properties: { path: { type: 'string', description: 'Absolute directory path' } },
    required: ['path'],
  },
  source: 'builtin',
  async execute(args) {
    try {
      await ensureDir(String(args.path))
      return `Created: ${args.path}`
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
      from: { type: 'string', description: 'Source path' },
      to: { type: 'string', description: 'Destination path' },
    },
    required: ['from', 'to'],
  },
  source: 'builtin',
  async execute(args) {
    try {
      await pfs.rename(String(args.from), String(args.to))
      return `Moved: ${args.from} → ${args.to}`
    } catch (e) {
      return `Error: ${String(e)}`
    }
  },
}

export const fsTools: ToolDef[] = [fsRead, fsWrite, fsList, fsDelete, fsMkdir, fsMove]
