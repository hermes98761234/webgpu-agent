import { AGENT_DIR, AGENT_MD, ensureDir, pfs, PLUGINS_DIR, SKILLS_DIR } from './fs/setup'
import { loadMcpServers, persistMcpServers } from './mcp/manager'
import { loadPlugins, persistPlugins } from './plugins/store'
import { DEFAULT_SKILLS } from './skills/defaults'
import { loadSkills, slugify, writeSkillFiles } from './skills/store'
import type { McpServerConfig, Plugin, Skill } from './types'

export const DEFAULT_SYSTEM_PROMPT = `You are a helpful agent running entirely in the user browser. You have access to built-in tools (get_time, fetch_url, run_javascript), file system tools (fs_*), git tools (git_*), web tools (weather_lookup, web_search), skills (use_skill), and can spawn sub-agents (spawn_agent). Connected MCP servers may add more tools. Your configuration lives in /home/user/.agent: agent.md (this prompt), skills/<name>/SKILL.md, plugins/*.json, mcp.json. Use tools when they help; prefer acting over asking.

# AGENT.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
\`\`\`
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
\`\`\`

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.`

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
