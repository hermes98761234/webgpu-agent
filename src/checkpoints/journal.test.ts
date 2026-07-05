import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../fs/setup', async () => await import('../test/memfs'))

import { files, resetMemfs, pfs } from '../test/memfs'
import {
  beginCheckpoint,
  countRevertFiles,
  endCheckpoint,
  getJournal,
  installJournal,
  revertTo,
  setJournal,
} from './journal'

beforeEach(() => {
  resetMemfs()
  setJournal([])
  installJournal() // idempotent
})

describe('checkpoint journal', () => {
  it('records prior content on first write and restores it on revert', async () => {
    files.set('/home/user/a.txt', 'v1')
    beginCheckpoint('cp1')
    await pfs.writeFile('/home/user/a.txt', 'v2')
    await pfs.writeFile('/home/user/a.txt', 'v3') // second write same turn: not re-recorded
    endCheckpoint()
    expect(await revertTo('cp1')).toBe(true)
    expect(files.get('/home/user/a.txt')).toBe('v1')
    expect(getJournal()).toHaveLength(0)
  })

  it('deletes files that were created during the checkpoint', async () => {
    beginCheckpoint('cp1')
    await pfs.writeFile('/home/user/new.txt', 'x')
    endCheckpoint()
    await revertTo('cp1')
    expect(files.has('/home/user/new.txt')).toBe(false)
  })

  it('restores files deleted via unlink', async () => {
    files.set('/home/user/gone.txt', 'precious')
    beginCheckpoint('cp1')
    await pfs.unlink('/home/user/gone.txt')
    endCheckpoint()
    await revertTo('cp1')
    expect(files.get('/home/user/gone.txt')).toBe('precious')
  })

  it('reverts across multiple checkpoints, newest first', async () => {
    files.set('/home/user/a.txt', 'v1')
    beginCheckpoint('cp1')
    await pfs.writeFile('/home/user/a.txt', 'v2')
    endCheckpoint()
    beginCheckpoint('cp2')
    await pfs.writeFile('/home/user/a.txt', 'v3')
    await pfs.writeFile('/home/user/b.txt', 'b')
    endCheckpoint()
    expect(countRevertFiles('cp1')).toBe(3) // a@cp1, a@cp2, b@cp2
    await revertTo('cp1')
    expect(files.get('/home/user/a.txt')).toBe('v1')
    expect(files.has('/home/user/b.txt')).toBe(false)
  })

  it('reverting to a newer checkpoint keeps older ones intact', async () => {
    files.set('/home/user/a.txt', 'v1')
    beginCheckpoint('cp1')
    await pfs.writeFile('/home/user/a.txt', 'v2')
    endCheckpoint()
    beginCheckpoint('cp2')
    await pfs.writeFile('/home/user/a.txt', 'v3')
    endCheckpoint()
    await revertTo('cp2')
    expect(files.get('/home/user/a.txt')).toBe('v2')
    expect(getJournal().map((c) => c.id)).toEqual(['cp1'])
  })

  it('does not record outside an active checkpoint and returns false for unknown ids', async () => {
    await pfs.writeFile('/home/user/x.txt', 'x')
    expect(getJournal()).toHaveLength(0)
    expect(await revertTo('nope')).toBe(false)
  })

  it('caps retention at 50 checkpoints', () => {
    for (let i = 0; i < 60; i++) beginCheckpoint(`cp${i}`)
    endCheckpoint()
    expect(getJournal()).toHaveLength(50)
    expect(getJournal()[0].id).toBe('cp10')
  })
})
