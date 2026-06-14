import type { ScheduleItem } from '../types'
import { getDueSchedules, markScheduleRun } from './store'

let worker: Worker | null = null
let onDueCallback: ((schedule: ScheduleItem) => void) | null = null
let visibilityHandler: (() => void) | null = null

function createWorker(): Worker {
  const workerSrc = `
    let checkInterval = null;
    let inactivityTimer = null;

    function resetInactivity() {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        if (checkInterval) clearInterval(checkInterval);
        checkInterval = null;
        self.postMessage({ type: 'idle' });
      }, 5 * 60 * 1000);
    }

    self.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'tick') {
        resetInactivity();
        if (!checkInterval) {
          checkInterval = setInterval(() => {
            self.postMessage({ type: 'check' });
          }, 60000);
        }
      } else if (msg.type === 'stop') {
        if (checkInterval) clearInterval(checkInterval);
        if (inactivityTimer) clearTimeout(inactivityTimer);
        checkInterval = null;
        inactivityTimer = null;
      }
    };

    self.postMessage({ type: 'ready' });
  `
  const blob = new Blob([workerSrc], { type: 'application/javascript' })
  const url = URL.createObjectURL(blob)
  const w = new Worker(url)
  URL.revokeObjectURL(url)
  return w
}

async function checkDue(): Promise<void> {
  const due = await getDueSchedules()
  for (const schedule of due) {
    await markScheduleRun(schedule.id)
    onDueCallback?.(schedule)
  }
}

export function startWorker(onDue: (schedule: ScheduleItem) => void): void {
  if (worker) stopWorker()
  onDueCallback = onDue
  worker = createWorker()
  worker.onmessage = (e: MessageEvent) => {
    if (e.data.type === 'ready') {
      worker?.postMessage({ type: 'tick' })
    } else if (e.data.type === 'check') {
      void checkDue()
    }
  }
  visibilityHandler = () => {
    if (document.visibilityState === 'visible') {
      void checkDue()
      worker?.postMessage({ type: 'tick' })
    }
  }
  document.addEventListener('visibilitychange', visibilityHandler)
  void checkDue()
}

export function stopWorker(): void {
  if (worker) {
    worker.postMessage({ type: 'stop' })
    worker.terminate()
    worker = null
  }
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler)
    visibilityHandler = null
  }
  onDueCallback = null
}

export function isWorkerRunning(): boolean {
  return worker !== null
}
