import LightningFS from '@isomorphic-git/lightning-fs'

export const fs = new LightningFS('webgpu-agent-fs')
export const pfs = fs.promises

export const ROOT = '/'

// Agent home layout (like ~/.claude in Claude Code): all agent data lives in files here.
export const HOME = '/home/user'
export const AGENT_DIR = `${HOME}/.agent`
export const SKILLS_DIR = `${AGENT_DIR}/skills`
export const PLUGINS_DIR = `${AGENT_DIR}/plugins`
export const AGENT_MD = `${AGENT_DIR}/agent.md`
export const MCP_CONFIG = `${AGENT_DIR}/mcp.json`

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
