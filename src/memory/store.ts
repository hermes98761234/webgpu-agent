import { ensureDir, MEMORY_DIR, MEMORY_INDEX, pfs } from '../fs/setup'
import type { ToolDef } from '../types'

export function memorySlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'memory'
  )
}

function serializeMemory(slug: string, description: string, content: string): string {
  return `---\nname: ${slug}\ndescription: ${description}\n---\n\n${content.trimEnd()}\n`
}

/** Read MEMORY.md; returns '' when no memory has been saved yet. */
export async function readMemoryIndex(): Promise<string> {
  try {
    return String(await pfs.readFile(MEMORY_INDEX, 'utf8'))
  } catch {
    return ''
  }
}

async function writeMemoryIndex(lines: string[]): Promise<void> {
  await ensureDir(MEMORY_DIR)
  await pfs.writeFile(MEMORY_INDEX, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8')
}

function indexLines(index: string): string[] {
  return index.split('\n').filter((l) => l.trim() !== '')
}

function lineFor(slug: string, description: string): string {
  return `- [${slug}](${MEMORY_DIR}/${slug}.md) — ${description}`
}

const lineSlug = (line: string): string | null => /^- \[([^\]]+)\]/.exec(line)?.[1] ?? null

/** Write one memory file and upsert its line in MEMORY.md. Returns the file path. */
export async function saveMemory(name: string, description: string, content: string): Promise<string> {
  const slug = memorySlug(name)
  await ensureDir(MEMORY_DIR)
  const path = `${MEMORY_DIR}/${slug}.md`
  await pfs.writeFile(path, serializeMemory(slug, description, content), 'utf8')
  const lines = indexLines(await readMemoryIndex()).filter((l) => lineSlug(l) !== slug)
  lines.push(lineFor(slug, description))
  await writeMemoryIndex(lines)
  return path
}

/** Delete a memory file and its index line. Returns false when it did not exist. */
export async function deleteMemory(name: string): Promise<boolean> {
  const slug = memorySlug(name)
  const lines = indexLines(await readMemoryIndex())
  const next = lines.filter((l) => lineSlug(l) !== slug)
  let removedFile = true
  try {
    await pfs.stat(`${MEMORY_DIR}/${slug}.md`)
    await pfs.unlink(`${MEMORY_DIR}/${slug}.md`)
  } catch {
    removedFile = false
  }
  if (!removedFile && next.length === lines.length) return false
  await writeMemoryIndex(next)
  return true
}

export function makeMemoryTools(): ToolDef[] {
  const memorySave: ToolDef = {
    name: 'memory_save',
    description:
      'Save one fact to persistent memory (survives across chats). Writes /home/user/.agent/memory/<name>.md and updates the MEMORY.md index shown in your system prompt. Saving an existing name overwrites it.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short kebab-case identifier, e.g. user-prefers-dark-theme' },
        description: { type: 'string', description: 'One-line summary shown in the memory index' },
        content: { type: 'string', description: 'The full fact in markdown' },
      },
      required: ['name', 'description', 'content'],
    },
    source: 'builtin',
    async execute(args) {
      const name = String(args.name ?? '').trim()
      const description = String(args.description ?? '').trim()
      const content = String(args.content ?? '')
      if (!name || !description || !content.trim()) {
        return 'Error: name, description and content are all required.'
      }
      const path = await saveMemory(name, description, content)
      return `Saved memory "${memorySlug(name)}" to ${path}`
    },
  }
  const memoryDelete: ToolDef = {
    name: 'memory_delete',
    description: 'Delete a saved memory by name (removes its file and index entry).',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Name (slug) of the memory to delete' } },
      required: ['name'],
    },
    source: 'builtin',
    async execute(args) {
      const name = String(args.name ?? '').trim()
      if (!name) return 'Error: name is required.'
      return (await deleteMemory(name))
        ? `Deleted memory "${memorySlug(name)}"`
        : `Error: no memory named "${memorySlug(name)}"`
    },
  }
  return [memorySave, memoryDelete]
}
