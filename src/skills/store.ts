import { ensureDir, pfs, SKILLS_DIR } from '../fs/setup'
import type { Skill, ToolDef } from '../types'

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'skill'
  )
}

function serializeSkill(skill: Skill): string {
  return `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n${skill.instructions}\n`
}

function parseSkillMd(slug: string, raw: string): Skill {
  let name = slug
  let description = ''
  let instructions = raw
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(raw)
  if (m) {
    instructions = raw.slice(m[0].length).replace(/^\n/, '')
    for (const line of m[1].split('\n')) {
      const idx = line.indexOf(':')
      if (idx === -1) continue
      const key = line.slice(0, idx).trim()
      const value = line.slice(idx + 1).trim()
      if (key === 'name') name = value
      else if (key === 'description') description = value
    }
  }
  return { id: slug, name, description, instructions: instructions.trimEnd() }
}

/** Read all skills from /home/user/.agent/skills/<slug>/SKILL.md */
export async function loadSkills(): Promise<Skill[]> {
  try {
    const entries = await pfs.readdir(SKILLS_DIR)
    const skills: Skill[] = []
    for (const entry of entries) {
      try {
        const raw = await pfs.readFile(`${SKILLS_DIR}/${entry}/SKILL.md`, 'utf8')
        skills.push(parseSkillMd(entry, String(raw)))
      } catch {
        // not a skill directory
      }
    }
    return skills
  } catch {
    return []
  }
}

export async function writeSkillFiles(skill: Skill): Promise<void> {
  const dir = `${SKILLS_DIR}/${skill.id}`
  await ensureDir(dir)
  await pfs.writeFile(`${dir}/SKILL.md`, serializeSkill(skill), 'utf8')
}

export async function removeSkillDir(id: string): Promise<void> {
  const dir = `${SKILLS_DIR}/${id}`
  try {
    for (const entry of await pfs.readdir(dir)) await pfs.unlink(`${dir}/${entry}`)
    await pfs.rmdir(dir)
  } catch {
    // already gone
  }
}

export function upsertSkill(skills: Skill[], skill: Skill): Skill[] {
  const id = slugify(skill.name)
  const saved: Skill = { ...skill, id }
  const next = skills.filter((s) => s.id !== skill.id && s.id !== id)
  next.push(saved)
  void (async () => {
    if (skill.id && skill.id !== id) await removeSkillDir(skill.id)
    await writeSkillFiles(saved)
  })()
  return next
}

export function deleteSkill(skills: Skill[], id: string): Skill[] {
  void removeSkillDir(id)
  return skills.filter((s) => s.id !== id)
}

export function makeUseSkillTool(getSkills: () => Skill[]): ToolDef {
  return {
    name: 'use_skill',
    description:
      'Load the full instructions of a skill by its exact name and follow them. The skill catalog (names + descriptions) is in the # Skills section of your system prompt.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Exact skill name' } },
      required: ['name'],
    },
    source: 'skill',
    async execute(args) {
      const name = String(args.name ?? '').trim()
      const skills = getSkills()
      const lower = name.toLowerCase()
      const skill =
        skills.find((s) => s.name === name) ??
        skills.find((s) => s.name.toLowerCase() === lower) ??
        skills.find((s) => s.id === slugify(name))
      if (!skill) {
        const names = skills.map((s) => s.name).join(', ') || 'none'
        return `Error: no skill named "${name}". Available: ${names}`
      }
      return `# Skill: ${skill.name}\n\n${skill.instructions}`
    },
  }
}
