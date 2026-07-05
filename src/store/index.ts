import { encrypt, decrypt, isEncryptedBlob } from './encrypted'

const PREFIX = 'webgpu-agent.'
const ENCRYPTION_KEY = 'webgpu-agent.encrypted'
const PW_CHECK_KEY = 'webgpu-agent.pwcheck'

let activePassword: string | null = null
let isEncryptionEnabled = false

const encryptionListeners = new Set<() => void>()

/** Subscribe to encryption being enabled/unlocked/changed. Returns unsubscribe. */
export function onEncryptionChange(fn: () => void): () => void {
  encryptionListeners.add(fn)
  return () => { encryptionListeners.delete(fn) }
}

export async function setStorePassword(password: string): Promise<void> {
  if (password) {
    const oldPassword = activePassword
    if (oldPassword && oldPassword !== password) {
      await reencryptAll(oldPassword, password)
    }
    activePassword = password
    isEncryptionEnabled = true
    localStorage.setItem(ENCRYPTION_KEY, '1')
    localStorage.setItem(PW_CHECK_KEY, await encrypt('ok', password))
  } else {
    activePassword = null
    isEncryptionEnabled = false
    localStorage.removeItem(ENCRYPTION_KEY)
    localStorage.removeItem(PW_CHECK_KEY)
  }
  encryptionListeners.forEach((fn) => fn())
}

async function reencryptAll(oldPassword: string, newPassword: string): Promise<void> {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(PREFIX) && k !== ENCRYPTION_KEY && k !== PW_CHECK_KEY) {
      keys.push(k)
    }
  }
  for (const k of keys) {
    const v = localStorage.getItem(k)
    if (!v || !isEncryptedBlob(v)) continue
    try {
      const plain = await decrypt(v, oldPassword)
      localStorage.setItem(k, await encrypt(plain, newPassword))
    } catch {
      // Value was encrypted with a different password; leave it untouched.
    }
  }
}

/** Check a password against stored encrypted data without unlocking the store. */
export async function verifyStorePassword(password: string): Promise<boolean> {
  const sentinel = localStorage.getItem(PW_CHECK_KEY)
  if (sentinel && isEncryptedBlob(sentinel)) {
    try {
      await decrypt(sentinel, password)
      return true
    } catch {
      return false
    }
  }
  // Legacy data without a sentinel: verify against any encrypted item.
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k || !k.startsWith(PREFIX) || k === ENCRYPTION_KEY) continue
    const v = localStorage.getItem(k)
    if (!v || !isEncryptedBlob(v)) continue
    try {
      await decrypt(v, password)
      return true
    } catch {
      return false
    }
  }
  return true
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
