import { ensureDir, pfs, PLUGINS_DIR } from '../fs/setup'
import { slugify } from '../skills/store'
import type { Plugin } from '../types'

function fileNameFor(plugin: Plugin): string {
  return `${slugify(plugin.name)}.json`
}

/** Read all plugins from /home/user/.agent/plugins/<slug>.json */
export async function loadPlugins(): Promise<Plugin[]> {
  try {
    const entries = await pfs.readdir(PLUGINS_DIR)
    const plugins: Plugin[] = []
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue
      try {
        const raw = String(await pfs.readFile(`${PLUGINS_DIR}/${entry}`, 'utf8'))
        const parsed: unknown = JSON.parse(raw)
        if (typeof parsed === 'object' && parsed !== null && 'name' in parsed) {
          plugins.push(parsed as Plugin)
        }
      } catch {
        // skip unreadable manifest
      }
    }
    return plugins
  } catch {
    return []
  }
}

export async function persistPlugins(plugins: Plugin[]): Promise<void> {
  await ensureDir(PLUGINS_DIR)
  const keep = new Set(plugins.map(fileNameFor))
  try {
    for (const entry of await pfs.readdir(PLUGINS_DIR)) {
      if (entry.endsWith('.json') && !keep.has(entry)) await pfs.unlink(`${PLUGINS_DIR}/${entry}`)
    }
  } catch {
    // directory missing — ensureDir above should have created it
  }
  for (const p of plugins) {
    await pfs.writeFile(`${PLUGINS_DIR}/${fileNameFor(p)}`, JSON.stringify(p, null, 2), 'utf8')
  }
}

export function savePlugins(plugins: Plugin[]): void {
  void persistPlugins(plugins)
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
