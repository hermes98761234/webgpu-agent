// Encryption is handled transparently by the store wrapper — setStoreItem encrypts
// when a password is active, and all webgpu-agent.* keys are re-encrypted on change.
import { getStoreItem, setStoreItem, removeStoreItem } from './index'
import type { ChatMessage } from '../types'
import type { DisplayItem } from '../ui/MessageList'

export interface SessionMeta {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  preview: string
}

export interface SessionData {
  messages: ChatMessage[]
  display: DisplayItem[]
}

const INDEX_KEY = 'webgpu-agent.session-index'
const sessionKey = (id: string) => `webgpu-agent.session.${id}`

export function generateSessionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export async function listSessions(): Promise<SessionMeta[]> {
  const raw = await getStoreItem(INDEX_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as SessionMeta[]
  } catch {
    return []
  }
}

export async function loadSession(id: string): Promise<SessionData | null> {
  const raw = await getStoreItem(sessionKey(id))
  if (!raw) return null
  try {
    return JSON.parse(raw) as SessionData
  } catch {
    return null
  }
}

export async function saveSession(meta: SessionMeta, data: SessionData): Promise<void> {
  const index = await listSessions()
  const idx = index.findIndex((s) => s.id === meta.id)
  if (idx >= 0) {
    index[idx] = meta
  } else {
    index.unshift(meta)
  }
  await setStoreItem(INDEX_KEY, JSON.stringify(index))
  await setStoreItem(sessionKey(meta.id), JSON.stringify(data))
}

export async function deleteSession(id: string): Promise<void> {
  const index = await listSessions()
  const filtered = index.filter((s) => s.id !== id)
  await setStoreItem(INDEX_KEY, JSON.stringify(filtered))
  removeStoreItem(sessionKey(id))
}

export async function renameSession(id: string, name: string): Promise<void> {
  const index = await listSessions()
  const session = index.find((s) => s.id === id)
  if (!session) return
  session.name = name
  await setStoreItem(INDEX_KEY, JSON.stringify(index))
}
