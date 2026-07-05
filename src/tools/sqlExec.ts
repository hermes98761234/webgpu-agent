import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'

let sqlReady: Promise<SqlJsStatic> | null = null

function getSqlJs(locateFile?: (f: string) => string): Promise<SqlJsStatic> {
  if (!sqlReady) sqlReady = initSqlJs(locateFile ? { locateFile } : undefined)
  return sqlReady
}

const MAX_ROWS = 200

/** Execute SQL against a fresh in-memory DB (optionally seeded from bytes); returns formatted rows + exported DB bytes. Throws on SQL errors. */
export async function execSql(
  query: string,
  dbBytes?: Uint8Array,
  locateFile?: (f: string) => string,
): Promise<{ output: string; bytes: Uint8Array }> {
  const SQL = await getSqlJs(locateFile)
  const db: Database = dbBytes ? new SQL.Database(dbBytes) : new SQL.Database()
  try {
    const results = db.exec(query)
    const parts: string[] = []
    for (const r of results) {
      const rows = r.values.slice(0, MAX_ROWS)
      parts.push(
        [
          r.columns.join(' | '),
          ...rows.map((row) => row.map((v) => (v === null ? 'NULL' : String(v))).join(' | ')),
        ].join('\n'),
      )
      if (r.values.length > MAX_ROWS) parts.push(`[truncated: ${r.values.length} rows total]`)
    }
    return { output: parts.join('\n\n') || 'OK (no rows returned)', bytes: db.export() }
  } finally {
    db.close()
  }
}
