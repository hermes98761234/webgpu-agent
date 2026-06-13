let seq = 0

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

type LogEntryData =
  | { kind: 'console'; level: LogLevel; text: string }
  | { kind: 'js-error'; text: string }
  | { kind: 'llm-request'; messages: unknown[] }
  | { kind: 'llm-response'; content: string }

export type LogEntry = { id: number; ts: number } & LogEntryData

const entries: LogEntry[] = []
const listeners = new Set<() => void>()

function push(entry: LogEntryData) {
  entries.push({ id: seq++, ts: Date.now(), ...entry } as LogEntry)
  if (entries.length > 2000) entries.splice(0, entries.length - 2000)
  for (const l of listeners) l()
}

export function getEntries(): readonly LogEntry[] {
  return entries
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function clearLog(): void {
  entries.length = 0
  for (const l of listeners) l()
}

export function pushLlmRequest(messages: unknown[]): void {
  push({ kind: 'llm-request', messages })
}

export function pushLlmResponse(content: string): void {
  push({ kind: 'llm-response', content })
}

function formatArg(a: unknown): string {
  if (typeof a === 'string') return a
  try { return JSON.stringify(a) } catch { return String(a) }
}

// Intercept console methods
const orig = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
}

for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
  // eslint-disable-next-line no-console
  console[level] = (...args: unknown[]) => {
    orig[level](...args)
    push({ kind: 'console', level, text: args.map(formatArg).join(' ') })
  }
}

// Capture unhandled JS errors
window.addEventListener('error', (e) => {
  push({ kind: 'js-error', text: `${e.message}${e.filename ? ` (${e.filename}:${e.lineno})` : ''}` })
})

window.addEventListener('unhandledrejection', (e) => {
  push({ kind: 'js-error', text: `Unhandled rejection: ${String(e.reason)}` })
})
