// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { execSql } from './sqlExec'

describe('execSql', () => {
  it('runs a query and formats rows as a text table', async () => {
    const { output } = await execSql("SELECT 1 AS a, 'x' AS b")
    expect(output).toContain('a | b')
    expect(output).toContain('1 | x')
  })

  it('supports multiple statements and persists across them in one call', async () => {
    const { output } = await execSql(
      'CREATE TABLE t(x INTEGER); INSERT INTO t VALUES (1),(2); SELECT SUM(x) AS s FROM t;',
    )
    expect(output).toContain('s')
    expect(output).toContain('3')
  })

  it('round-trips through exported bytes', async () => {
    const first = await execSql('CREATE TABLE t(x); INSERT INTO t VALUES (42);')
    const second = await execSql('SELECT x FROM t', first.bytes)
    expect(second.output).toContain('42')
  })

  it('throws on invalid SQL (tool layer converts to Error: string)', async () => {
    await expect(execSql('NOT SQL')).rejects.toThrow()
  })

  it('renders NULL and reports statements with no rows', async () => {
    const { output } = await execSql('SELECT NULL AS n')
    expect(output).toContain('NULL')
    const ddl = await execSql('CREATE TABLE q(x)')
    expect(ddl.output).toBe('OK (no rows returned)')
  })
})
