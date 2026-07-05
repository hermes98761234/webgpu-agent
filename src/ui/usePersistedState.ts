import { useEffect, useRef, useState } from 'react'
import { getStoreItem, setStoreItem, hasPassword, onEncryptionChange } from '../store/index'

export function usePersistedState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (hasPassword()) return initial
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })
  const loaded = useRef(hasPassword() ? false : true)

  useEffect(() => {
    if (!hasPassword()) return
    getStoreItem(key).then((raw) => {
      if (raw !== null) {
        try { setValue(JSON.parse(raw) as T) } catch { /* keep initial */ }
      }
      loaded.current = true
    })
  }, [key])

  // Re-read once encryption is unlocked/enabled — the initial load may have
  // run while the store was still locked and gotten an undecryptable blob.
  useEffect(() => {
    return onEncryptionChange(() => {
      // ponytail: only handles encryption turning on/unlocking; turning it
      // off mid-session would need a decrypt-all pass nothing triggers yet
      if (!hasPassword()) return
      loaded.current = false
      getStoreItem(key).then((raw) => {
        if (raw !== null) {
          try { setValue(JSON.parse(raw) as T) } catch { /* keep current */ }
        }
        loaded.current = true
      })
    })
  }, [key])

  useEffect(() => {
    if (!loaded.current) return
    if (hasPassword()) {
      void setStoreItem(key, JSON.stringify(value))
    } else {
      localStorage.setItem(key, JSON.stringify(value))
    }
  }, [key, value])

  return [value, setValue]
}
