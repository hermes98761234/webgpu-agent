import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockPostMessage = vi.fn()
const mockTerminate = vi.fn()
let mockOnmessage: ((e: MessageEvent) => void) | null = null

vi.stubGlobal('Worker', class {
  postMessage = mockPostMessage
  terminate = mockTerminate
  set onmessage(handler: ((e: MessageEvent) => void) | null) { mockOnmessage = handler }
  get onmessage() { return mockOnmessage }
})

vi.stubGlobal('Blob', class {
  constructor() {}
})

vi.stubGlobal('URL', {
  createObjectURL: vi.fn().mockReturnValue('blob:mock'),
  revokeObjectURL: vi.fn(),
})

import { startWorker, stopWorker, isWorkerRunning } from './workerManager'

describe('Worker Manager', () => {
  beforeEach(() => {
    stopWorker()
    vi.clearAllMocks()
  })

  afterEach(() => {
    stopWorker()
  })

  it('starts and stops worker', () => {
    const onDue = vi.fn()
    startWorker(onDue)
    expect(isWorkerRunning()).toBe(true)

    stopWorker()
    expect(isWorkerRunning()).toBe(false)
  })

  it('replaces existing worker on restart', () => {
    const onDue1 = vi.fn()
    const onDue2 = vi.fn()

    startWorker(onDue1)
    startWorker(onDue2)

    expect(isWorkerRunning()).toBe(true)
    stopWorker()
    expect(isWorkerRunning()).toBe(false)
  })
})
