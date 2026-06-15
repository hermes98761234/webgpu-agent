import { describe, it, expect } from 'vitest'
import { encrypt, decrypt, isEncryptedBlob } from './encrypted'

describe('encrypted', () => {
  it('round-trips small plaintext', async () => {
    const blob = await encrypt('hello', 'password')
    expect(isEncryptedBlob(blob)).toBe(true)
    expect(await decrypt(blob, 'password')).toBe('hello')
  })

  it('round-trips large plaintext (1MB)', async () => {
    const large = 'x'.repeat(1024 * 1024)
    const blob = await encrypt(large, 'password')
    expect(await decrypt(blob, 'password')).toBe(large)
  })

  it('rejects wrong password', async () => {
    const blob = await encrypt('secret', 'correct')
    await expect(decrypt(blob, 'wrong')).rejects.toThrow()
  })

  it('isEncryptedBlob returns false for non-encrypted data', () => {
    expect(isEncryptedBlob('plain text')).toBe(false)
    expect(isEncryptedBlob('{"foo":"bar"}')).toBe(false)
    expect(isEncryptedBlob('')).toBe(false)
  })

  it('isEncryptedBlob returns true for valid encrypted blobs', async () => {
    const blob = await encrypt('test', 'pw')
    expect(isEncryptedBlob(blob)).toBe(true)
  })
})
