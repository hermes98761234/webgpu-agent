import { encrypt, decrypt, isEncryptedBlob } from './encrypted'

const PREFIX = 'webgpu-agent.'
const ENCRYPTION_KEY = 'webgpu-agent.encrypted'

let activePassword: string | null = null
let isEncryptionEnabled = false

export function setStorePassword(password: string): void {
  if (password) {
    activePassword = password
    isEncryptionEnabled = true
    localStorage.setItem(ENCRYPTION_KEY, '1')
  } else {
    activePassword = null
    isEncryptionEnabled = false
  }
}

export function isStoreLocked(): boolean {
  return isEncryptionEnabled && activePassword === null
}

export function hasPassword(): boolean {
  return isEncryptionEnabled
}

export async function getStoreItem(key: string): Promise<string | null> {
  const raw = localStorage.getItem(key)
  if (raw === null) return null
  if (isEncryptionEnabled && activePassword && isEncryptedBlob(raw)) {
    try {
      return await decrypt(raw, activePassword)
    } catch {
      return null
    }
  }
  return raw
}

export async function setStoreItem(key: string, value: string): Promise<void> {
  if (isEncryptionEnabled && activePassword) {
    const encrypted = await encrypt(value, activePassword)
    localStorage.setItem(key, encrypted)
  } else {
    localStorage.setItem(key, value)
  }
}

export function removeStoreItem(key: string): void {
  localStorage.removeItem(key)
}

export function clearAllStoreData(): void {
  const toRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(PREFIX)) toRemove.push(k)
  }
  toRemove.forEach((k) => localStorage.removeItem(k))
}

export function hasAnyStoreData(): boolean {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(PREFIX)) return true
  }
  return false
}

export function detectEncryptionEnabled(): boolean {
  if (localStorage.getItem(ENCRYPTION_KEY) === '1') return true
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k || !k.startsWith(PREFIX)) continue
    const v = localStorage.getItem(k)
    if (v && isEncryptedBlob(v)) return true
  }
  return false
}
