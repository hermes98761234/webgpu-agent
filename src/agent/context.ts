import type { Skill } from '../types'

/** Skill catalog for the system prompt: headers only; full body loads via use_skill. */
export function buildSkillsSection(skills: Skill[]): string {
  if (skills.length === 0) return ''
  return [
    '# Skills',
    '',
    'These skills are available. Only their names and descriptions are loaded here.',
    'When a task matches a skill, first call use_skill with the exact name to load its full instructions, then follow them. Never guess what a skill says.',
    '',
    ...skills.map((s) => `- ${s.name}: ${s.description}`),
  ].join('\n')
}

/** Memory guidance + live index for the system prompt. */
export function buildMemorySection(memoryIndex: string): string {
  const index = memoryIndex.trim()
  return [
    '# Memory',
    '',
    'You have persistent memory at /home/user/.agent/memory — one markdown file per fact, indexed in MEMORY.md. Memory survives across chats; the chat itself does not.',
    'How to work with memory:',
    '- Recall: the index below lists every saved memory with its absolute file path. When one is relevant, read it in full by calling fs_read with that exact path copied from the index.',
    '- Save: when you learn a stable fact worth keeping (a user preference, a project fact, a correction you were given), call memory_save with a short kebab-case name, a one-line description, and the fact. One fact per memory.',
    '- Update: saving an existing name overwrites it. Delete wrong or outdated memories with memory_delete.',
    '- Do not save secrets, passwords, or one-off conversation details.',
    '',
    '## Memory index',
    '',
    index || '(no memories saved yet)',
  ].join('\n')
}

/** Compose the effective system prompt sent to the model. */
export function buildAgentSystemPrompt(base: string, skills: Skill[], memoryIndex: string): string {
  return [base.trim(), buildSkillsSection(skills), buildMemorySection(memoryIndex)]
    .filter(Boolean)
    .join('\n\n')
}
