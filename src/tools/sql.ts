import type { ToolDef } from '../types'
import { execSql } from './sqlExec'
import { pfs, ensureDir } from '../fs/setup'
import { resolvePath } from './fs'

async function readDbBytes(path: string): Promise<Uint8Array | undefined> {
  try {
    const data = await pfs.readFile(path)
    return typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data as Uint8Array)
  } catch {
    return undefined
  }
}

export const runSql: ToolDef = {
  name: 'run_sql',
  description:
    'Run SQL against SQLite (WASM). With db_path, the database file is loaded from the virtual FS and saved back afterwards; without it, a temporary in-memory database is used. Multiple statements allowed. Returns rows as a text table (max 200 rows per statement).',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'SQL to execute (one or more statements)' },
      db_path: { type: 'string', description: 'Optional path to a SQLite database file in the virtual FS' },
    },
    required: ['query'],
  },
  source: 'builtin',
  async execute(args) {
    try {
      const wasmUrl = (await import('sql.js/dist/sql-wasm.wasm?url')).default
      const query = String(args.query ?? '')
      const dbPath = args.db_path ? resolvePath(args.db_path) : ''
      const bytes = dbPath ? await readDbBytes(dbPath) : undefined
      const res = await execSql(query, bytes, () => wasmUrl)
      if (dbPath) {
        const dir = dbPath.substring(0, dbPath.lastIndexOf('/')) || '/'
        await ensureDir(dir)
        await pfs.writeFile(dbPath, res.bytes)
        return `${res.output}\n\n[database saved to ${dbPath}]`
      }
      return res.output
    } catch (e) {
      return `Error: ${String(e)}`
    }
  },
}
