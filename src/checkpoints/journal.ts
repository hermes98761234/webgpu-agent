import { ensureDir, pfs } from '../fs/setup'

/** files: path -> base64 of prior bytes, or null if the file didn't exist. */
export interface Checkpoint {
  id: string
  files: Record<string, string | null>
}

const MAX_CHECKPOINTS = 50

let journal: Checkpoint[] = []
let active: Checkpoint | null = null
let installed = false

export function getJournal(): Checkpoint[] {
  return journal
}

export function setJournal(j: Checkpoint[]): void {
  journal = j
  active = null
}

export function beginCheckpoint(id: string): void {
  active = { id, files: {} }
  journal.push(active)
  // Old records are only needed to revert to their own (dropped) checkpoint — no merge needed.
  if (journal.length > MAX_CHECKPOINTS) journal.splice(0, journal.length - MAX_CHECKPOINTS)
}

export function endCheckpoint(): void {
  active = null
}

function toB64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function readBytes(path: string): Promise<Uint8Array | null> {
  try {
    const data = await pfs.readFile(path)
    return typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data as Uint8Array)
  } catch {
    return null
  }
}

async function record(path: string): Promise<void> {
  if (!active || path in active.files) return
  const prev = await readBytes(path)
  active.files[path] = prev === null ? null : toB64(prev)
}

/** Monkey-patch the shared pfs so every tool AND isomorphic-git go through the journal. */
export function installJournal(): void {
  if (installed) return
  installed = true
  const origWrite = pfs.writeFile.bind(pfs)
  const origUnlink = pfs.unlink.bind(pfs)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyPfs = pfs as any
  anyPfs.writeFile = async (path: string, data: unknown, opts?: unknown) => {
    await record(path)
    return origWrite(path, data as never, opts as never)
  }
  anyPfs.unlink = async (path: string) => {
    await record(path)
    return origUnlink(path)
  }
  if (typeof anyPfs.rename === 'function') {
    const origRename = anyPfs.rename.bind(pfs)
    anyPfs.rename = async (from: string, to: string) => {
      await record(from)
      await record(to)
      return origRename(from, to)
    }
  }
}

/** Number of file records that a revert to checkpointId would apply (for the confirm dialog). */
export function countRevertFiles(checkpointId: string): number {
  const idx = journal.findIndex((c) => c.id === checkpointId)
  if (idx < 0) return 0
  return journal.slice(idx).reduce((n, c) => n + Object.keys(c.files).length, 0)
}

/** Restore FS state to the moment checkpointId began; drops it and everything newer. */
export async function revertTo(checkpointId: string): Promise<boolean> {
  const idx = journal.findIndex((c) => c.id === checkpointId)
  if (idx < 0) return false
  active = null // restores below must not be re-recorded
  for (let i = journal.length - 1; i >= idx; i--) {
    for (const [path, prev] of Object.entries(journal[i].files)) {
      if (prev === null) {
        try {
          await pfs.unlink(path)
        } catch {
          // already gone
        }
      } else {
        const dir = path.substring(0, path.lastIndexOf('/')) || '/'
        await ensureDir(dir)
        const bytes = fromB64(prev)
        let content: string | Uint8Array = bytes
        try {
          content = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
        } catch {
          // keep raw bytes (e.g. SQLite DB)
        }
        await pfs.writeFile(path, content)
      }
    }
  }
  journal = journal.slice(0, idx)
  return true
}
