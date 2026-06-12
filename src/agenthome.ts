import { AGENT_DIR, AGENT_MD, ensureDir, pfs, PLUGINS_DIR, SKILLS_DIR } from './fs/setup'
import { loadMcpServers, persistMcpServers } from './mcp/manager'
import { loadPlugins, persistPlugins } from './plugins/store'
import { DEFAULT_SKILLS } from './skills/defaults'
import { loadSkills, slugify, writeSkillFiles } from './skills/store'
import type { McpServerConfig, Plugin, Skill } from './types'

export const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful agent running entirely in the user browser. You have access to built-in tools (get_time, fetch_url, run_javascript), file system tools (fs_*), git tools (git_*), web tools (weather_lookup, web_search), skills (use_skill), and can spawn sub-agents (spawn_agent). Connected MCP servers may add more tools. Your configuration lives in /home/user/.agent: agent.md (this prompt), skills/<name>/SKILL.md, plugins/*.json, mcp.json. Use tools when they help; prefer acting over asking.'

const MARKER = `${AGENT_DIR}/.initialized`

export interface AgentHomeData {
  systemPrompt: string
  skills: Skill[]
  plugins: Plugin[]
  mcpServers: McpServerConfig[]
}

async function exists(path: string): Promise<boolean> {
  try {
    await pfs.stat(path)
    return true
  } catch {
    return false
  }
}

/** Read a legacy localStorage value (JSON as written by usePersistedState). */
function readLegacy<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? null : (JSON.parse(raw) as T)
  } catch {
    return null
  }
}

const LEGACY_KEYS = [
  'webgpu-agent.skills',
  'webgpu-agent.plugins',
  'webgpu-agent.mcpServers',
  'webgpu-agent.systemPrompt',
]

export async function writeAgentMd(content: string): Promise<void> {
  await ensureDir(AGENT_DIR)
  await pfs.writeFile(AGENT_MD, content, 'utf8')
}

/**
 * Ensure /home/user/.agent exists and is populated, then load everything from it.
 * On first run: seeds the two built-in skills, migrates any legacy localStorage
 * data (skills, plugins, MCP servers, system prompt) into files, writes agent.md.
 */
export async function initAgentHome(): Promise<AgentHomeData> {
  await ensureDir(SKILLS_DIR)
  await ensureDir(PLUGINS_DIR)

  if (!(await exists(MARKER))) {
    const seeded = new Map<string, Skill>(DEFAULT_SKILLS.map((s) => [s.id, s]))
    for (const s of readLegacy<Skill[]>('webgpu-agent.skills') ?? []) {
      const id = slugify(s.name)
      seeded.set(id, { ...s, id })
    }
    for (const s of seeded.values()) await writeSkillFiles(s)

    const legacyPlugins = readLegacy<Plugin[]>('webgpu-agent.plugins')
    if (legacyPlugins?.length) await persistPlugins(legacyPlugins)

    const legacyMcp = readLegacy<McpServerConfig[]>('webgpu-agent.mcpServers')
    if (legacyMcp?.length) await persistMcpServers(legacyMcp)

    if (!(await exists(AGENT_MD))) {
      const legacyPrompt = readLegacy<string>('webgpu-agent.systemPrompt')
      await writeAgentMd(
        typeof legacyPrompt === 'string' && legacyPrompt.trim() ? legacyPrompt : DEFAULT_SYSTEM_PROMPT,
      )
    }

    await pfs.writeFile(MARKER, `${new Date().toISOString()}\n`, 'utf8')
    for (const key of LEGACY_KEYS) localStorage.removeItem(key)
  }

  let systemPrompt: string
  try {
    systemPrompt = String(await pfs.readFile(AGENT_MD, 'utf8'))
  } catch {
    systemPrompt = DEFAULT_SYSTEM_PROMPT
    await writeAgentMd(systemPrompt)
  }

  const [skills, plugins, mcpServers] = await Promise.all([loadSkills(), loadPlugins(), loadMcpServers()])
  return { systemPrompt, skills, plugins, mcpServers }
}
