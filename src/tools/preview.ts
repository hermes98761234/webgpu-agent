import type { ToolDef } from '../types'
import type { PreviewSource } from '../ui/PreviewPane'
import { resolvePath } from './fs'

export function makePreviewTool(open: (src: PreviewSource) => void): ToolDef {
  return {
    name: 'preview',
    description:
      'Show an HTML page to the user in the app preview pane. Pass a virtual-FS path to an .html file (relative script/css/img references are inlined automatically) or raw HTML.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to an HTML file in the virtual FS' },
        html: { type: 'string', description: 'Raw HTML (used when no path is given)' },
      },
    },
    source: 'builtin',
    async execute(args) {
      try {
        if (args.path) {
          const p = resolvePath(args.path)
          open({ title: p, path: p })
          return `Preview opened: ${p}`
        }
        const html = String(args.html ?? '')
        if (!html) return 'Error: provide either path or html'
        open({ title: 'Preview', html })
        return 'Preview opened'
      } catch (e) {
        return `Error: ${String(e)}`
      }
    },
  }
}
