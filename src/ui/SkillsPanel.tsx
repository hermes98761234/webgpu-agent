import { useState } from 'react'
import { deleteSkill, loadSkills, upsertSkill } from '../skills/store'
import type { Skill } from '../types'

export function SkillsPanel({ disabled }: { disabled: boolean }) {
  const [skills, setSkills] = useState<Skill[]>(() => loadSkills())
  const [editing, setEditing] = useState<Skill | null>(null)

  const blank = (): Skill => ({
    id: crypto.randomUUID(),
    name: '',
    description: '',
    instructions: '',
  })

  return (
    <details className="panel">
      <summary>Skills ({skills.length})</summary>
      {skills.map((s) => (
        <div key={s.id} className="row panel-item">
          <span title={s.description}>{s.name}</span>
          <button onClick={() => setEditing(s)} disabled={disabled}>edit</button>
          <button onClick={() => setSkills(deleteSkill(skills, s.id))} disabled={disabled}>✕</button>
        </div>
      ))}
      {editing ? (
        <div className="col">
          <input
            placeholder="name (used by the agent to call it)"
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          />
          <input
            placeholder="one-line description"
            value={editing.description}
            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
          />
          <textarea
            placeholder="instructions (markdown) the agent receives via use_skill"
            value={editing.instructions}
            onChange={(e) => setEditing({ ...editing, instructions: e.target.value })}
            rows={5}
          />
          <div className="row">
            <button
              disabled={!editing.name.trim() || !editing.instructions.trim()}
              onClick={() => {
                setSkills(upsertSkill(skills, editing))
                setEditing(null)
              }}
            >
              Save
            </button>
            <button onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setEditing(blank())} disabled={disabled}>+ Add skill</button>
      )}
    </details>
  )
}
