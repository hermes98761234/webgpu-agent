import type { Plugin } from '../types'

const KEY = 'webgpu-agent.plugins'

export function loadPlugins(): Plugin[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Plugin[]) : []
  } catch {
    return []
  }
}

export function savePlugins(plugins: Plugin[]): void {
  localStorage.setItem(KEY, JSON.stringify(plugins))
}

export function upsertPlugin(plugins: Plugin[], plugin: Plugin): Plugin[] {
  const next = plugins.filter((p) => p.id !== plugin.id)
  next.push(plugin)
  savePlugins(next)
  return next
}

export function deletePlugin(plugins: Plugin[], id: string): Plugin[] {
  const next = plugins.filter((p) => p.id !== id)
  savePlugins(next)
  return next
}
