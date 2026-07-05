import { describe, it, expect, beforeEach } from 'vitest'
import { setStorePassword, getStoreItem, setStoreItem, hasPassword, onEncryptionChange } from './index'

describe('store reencryptAll', () => {
  beforeEach(async () => {
    localStorage.clear()
    // Reset encryption state by setting password to empty
    await setStorePassword('')
  })

  it('stores and retrieves encrypted values', async () => {
    await setStorePassword('testpw')
    await setStoreItem('webgpu-agent.key1', 'value1')
    const result = await getStoreItem('webgpu-agent.key1')
    expect(result).toBe('value1')
  })

  it('returns null for missing keys', async () => {
    await setStorePassword('testpw')
    const result = await getStoreItem('webgpu-agent.nonexistent')
    expect(result).toBeNull()
  })

  it('re-encrypts all keys when password changes', async () => {
    await setStorePassword('old')
    // Use fewer items to avoid timeout
    for (let i = 0; i < 10; i++) {
      await setStoreItem(`webgpu-agent.test${i}`, `value${i}`)
    }
    await setStorePassword('new')
    expect(hasPassword()).toBe(true)
    for (let i = 0; i < 10; i++) {
      const val = await getStoreItem(`webgpu-agent.test${i}`)
      expect(val).toBe(`value${i}`)
    }
  })

  it('notifies encryption-change listeners on setStorePassword', async () => {
    let calls = 0
    const unsubscribe = onEncryptionChange(() => { calls++ })
    await setStorePassword('pw')
    expect(calls).toBe(1)
    unsubscribe()
    await setStorePassword('')
    expect(calls).toBe(1)
  })
})
