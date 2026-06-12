import { useEffect, useState } from 'react'

interface GallerySkill {
  name: string
  description: string
  instructions: string
}

interface SkillsGalleryProps {
  onInstall: (skill: GallerySkill) => void
  onClose: () => void
}

const FALLBACK_SKILLS: GallerySkill[] = [
  {
    name: 'Summarizer',
    description: 'Summarize any text concisely',
    instructions: 'When asked to summarize, extract the key points into 3-5 bullet points...',
  },
  {
    name: 'Code Reviewer',
    description: 'Review code for bugs and improvements',
    instructions: 'Review the provided code carefully...',
  },
  {
    name: 'Translator',
    description: 'Translate text between languages',
    instructions: 'Translate the following text accurately...',
  },
  {
    name: 'Git Helper',
    description: 'Help with git operations',
    instructions: 'Help the user with git commands...',
  },
  {
    name: 'File Organizer',
    description: 'Help organize and manage files',
    instructions: 'Help the user organize their files using the fs_ tools...',
  },
]

export function SkillsGallery({ onInstall, onClose }: SkillsGalleryProps) {
  const [skills, setSkills] = useState<GallerySkill[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [installed, setInstalled] = useState<Set<string>>(new Set())

  useEffect(() => {
    const url = query.trim()
      ? `https://www.skills.sh/api/skills?q=${encodeURIComponent(query.trim())}`
      : 'https://www.skills.sh/api/skills'

    setLoading(true)
    fetch(url)
      .then((r) => r.json())
      .then((data: GallerySkill[]) => {
        setSkills(Array.isArray(data) ? data : FALLBACK_SKILLS)
      })
      .catch(() => {
        setSkills(FALLBACK_SKILLS)
      })
      .finally(() => setLoading(false))
  }, [query])

  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    background: 'var(--bg)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 100,
  }

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  }

  const closeBtn: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: 'var(--text-dim)',
    fontSize: '20px',
    padding: '4px 8px',
    cursor: 'pointer',
    lineHeight: 1,
  }

  const bodyStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  }

  const skillCard: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '12px',
    background: 'var(--bg-alt)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
  }

  const installedBtn: React.CSSProperties = {
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--text-dim)',
    borderRadius: '6px',
    padding: '5px 12px',
    cursor: 'default',
    fontSize: '13px',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  }

  const installBtn: React.CSSProperties = {
    flexShrink: 0,
    whiteSpace: 'nowrap',
    fontSize: '13px',
    padding: '5px 12px',
  }

  return (
    <div style={overlayStyle}>
      <div style={headerStyle}>
        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Skills Gallery</h2>
        <button style={closeBtn} onClick={onClose}>×</button>
      </div>

      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <input
          type="text"
          placeholder="Search skills…"
          style={{ width: '100%' }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div style={bodyStyle}>
        {loading ? (
          <p style={{ color: 'var(--text-dim)', fontSize: '14px' }}>Loading…</p>
        ) : skills.length === 0 ? (
          <p style={{ color: 'var(--text-dim)', fontSize: '14px' }}>No skills found.</p>
        ) : (
          skills.map((skill) => (
            <div key={skill.name} style={skillCard}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>{skill.name}</div>
                <div style={{ color: 'var(--text-dim)', fontSize: '13px', lineHeight: 1.4 }}>{skill.description}</div>
              </div>
              {installed.has(skill.name) ? (
                <button style={installedBtn} disabled>Installed ✓</button>
              ) : (
                <button
                  style={installBtn}
                  onClick={() => {
                    onInstall(skill)
                    setInstalled((prev) => new Set([...prev, skill.name]))
                  }}
                >
                  Install
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
