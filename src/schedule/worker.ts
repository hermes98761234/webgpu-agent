import type { ScheduleItem } from '../types'

interface WorkerMessage {
  type: 'tick' | 'due'
  schedules?: ScheduleItem[]
}

let checkInterval: ReturnType<typeof setInterval> | null = null
let inactivityTimer: ReturnType<typeof setTimeout> | null = null

function resetInactivity() {
  if (inactivityTimer) clearTimeout(inactivityTimer)
  inactivityTimer = setTimeout(() => {
    if (checkInterval) clearInterval(checkInterval)
    checkInterval = null
    self.postMessage({ type: 'idle' } as never)
  }, 5 * 60 * 1000)
}

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data

  if (msg.type === 'tick') {
    resetInactivity()
    if (!checkInterval) {
      checkInterval = setInterval(() => {
        self.postMessage({ type: 'check' } as never)
      }, 60_000)
    }
  } else if (msg.type === 'due' && msg.schedules) {
    for (const s of msg.schedules) {
      self.postMessage({ type: 'notify', schedule: s } as never)
    }
    resetInactivity()
  }
}

self.postMessage({ type: 'ready' } as never)
