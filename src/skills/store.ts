import type { Skill, ToolDef } from '../types'

const KEY = 'webgpu-agent.skills'

export function loadSkills(): Skill[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Skill[]) : []
  } catch {
    return []
  }
}

export function saveSkills(skills: Skill[]): void {
  localStorage.setItem(KEY, JSON.stringify(skills))
}

export function upsertSkill(skills: Skill[], skill: Skill): Skill[] {
  const next = skills.filter((s) => s.id !== skill.id)
  next.push(skill)
  saveSkills(next)
  return next
}

export function deleteSkill(skills: Skill[], id: string): Skill[] {
  const next = skills.filter((s) => s.id !== id)
  saveSkills(next)
  return next
}

export function makeUseSkillTool(getSkills: () => Skill[]): ToolDef {
  const catalog = getSkills()
  const listing = catalog.length
    ? catalog.map((s) => `${s.name} (${s.description})`).join('; ')
    : 'none yet'
  return {
    name: 'use_skill',
    description: `Load the full instructions of a user-defined skill by name, then follow them. Available skills: ${listing}`,
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Exact skill name' } },
      required: ['name'],
    },
    source: 'skill',
    async execute(args) {
      const name = String(args.name ?? '')
      const skills = getSkills()
      const skill = skills.find((s) => s.name === name)
      if (!skill) {
        const names = skills.map((s) => s.name).join(', ') || 'none'
        return `Error: no skill named "${name}". Available: ${names}`
      }
      return `# Skill: ${skill.name}\n\n${skill.instructions}`
    },
  }
}
