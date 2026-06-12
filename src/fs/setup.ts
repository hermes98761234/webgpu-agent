import LightningFS from '@isomorphic-git/lightning-fs'

export const fs = new LightningFS('webgpu-agent-fs')
export const pfs = fs.promises

export const ROOT = '/'

export async function ensureDir(path: string): Promise<void> {
  const parts = path.split('/').filter(Boolean)
  let current = ''
  for (const part of parts) {
    current += '/' + part
    try {
      await pfs.mkdir(current)
    } catch {
      // already exists
    }
  }
}
