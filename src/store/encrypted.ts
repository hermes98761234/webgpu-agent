interface EncryptedBlob {
  salt: string
  iv: string
  data: string
}

function toBase64url(buf: Uint8Array | ArrayBuffer): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as unknown as number[])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function fromBase64url(str: string): Uint8Array<ArrayBuffer> {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encrypt(plaintext: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const enc = new TextEncoder()
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext))
  const blob: EncryptedBlob = {
    salt: toBase64url(salt),
    iv: toBase64url(iv),
    data: toBase64url(cipherBuf),
  }
  return JSON.stringify(blob)
}

export async function decrypt(ciphertext: string, password: string): Promise<string> {
  const blob: EncryptedBlob = JSON.parse(ciphertext)
  const salt = fromBase64url(blob.salt)
  const iv = fromBase64url(blob.iv)
  const data = fromBase64url(blob.data)
  const key = await deriveKey(password, salt)
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return new TextDecoder().decode(plainBuf)
}

export function isEncryptedBlob(value: string): boolean {
  try {
    const obj = JSON.parse(value)
    return (
      typeof obj === 'object' &&
      obj !== null &&
      typeof obj.salt === 'string' &&
      typeof obj.iv === 'string' &&
      typeof obj.data === 'string'
    )
  } catch {
    return false
  }
}
