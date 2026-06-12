import { useState } from 'react'
import { deleteSkill, upsertSkill } from '../skills/store'
import type { Skill } from '../types'

interface SkillsPanelProps {
  disabled: boolean
  skills: Skill[]
  onSkillsChange: (skills: Skill[]) => void
  onOpenGallery?: () => void
}

export function SkillsPanel({ disabled, skills, onSkillsChange, onOpenGallery }: SkillsPanelProps) {
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
          <button onClick={() => onSkillsChange(deleteSkill(skills, s.id))} disabled={disabled}>✕</button>
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
                onSkillsChange(upsertSkill(skills, editing))
                setEditing(null)
              }}
            >
              Save
            </button>
            <button onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button onClick={() => setEditing(blank())} disabled={disabled}>+ Add skill</button>
          {onOpenGallery && <button className="btn-ghost" onClick={onOpenGallery} disabled={disabled}>Browse</button>}
        </div>
      )}
    </details>
  )
}
