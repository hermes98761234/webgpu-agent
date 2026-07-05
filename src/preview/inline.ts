/** Injected first so console output and errors are forwarded to the parent frame. */
export const CONSOLE_CAPTURE = `<script>(function () {
  function send(level, args) {
    try {
      parent.postMessage({ __preview: true, level: level, text: args.map(function (a) {
        try { return typeof a === 'object' ? JSON.stringify(a) : String(a) } catch (e) { return String(a) }
      }).join(' ') }, '*')
    } catch (e) { /* ignore */ }
  }
  ;['log', 'warn', 'error', 'info'].forEach(function (l) {
    var orig = console[l]
    console[l] = function () { send(l, [].slice.call(arguments)); orig.apply(console, arguments) }
  })
  window.addEventListener('error', function (e) {
    send('error', [e.message + ' (' + (e.filename || '') + ':' + e.lineno + ')'])
  })
})()</script>`

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  ico: 'image/x-icon',
}

function toB64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

async function replaceAsync(
  s: string,
  re: RegExp,
  fn: (...m: string[]) => Promise<string>,
): Promise<string> {
  const jobs: Promise<string>[] = []
  s.replace(re, (...m) => {
    jobs.push(fn(...(m as string[])))
    return ''
  })
  const results = await Promise.all(jobs)
  let i = 0
  return s.replace(re, () => results[i++])
}

/** Inline relative <script src>, <link rel=stylesheet href> and <img src> references from the virtual FS. */
export async function inlineAssets(
  html: string,
  basePath: string,
  readFile: (path: string) => Promise<Uint8Array | null>,
): Promise<string> {
  const resolve = (rel: string): string | null => {
    if (/^(https?:|data:|\/\/|#)/.test(rel)) return null
    const base = rel.startsWith('/') ? [''] : basePath.split('/').slice(0, -1)
    for (const part of rel.split('/')) {
      if (part === '..') base.pop()
      else if (part !== '.' && part) base.push(part)
    }
    const full = base.join('/')
    return full.startsWith('/') ? full : `/${full}`
  }
  const missing = (src: string) =>
    `<script>console.warn(${JSON.stringify(`[preview] missing asset: ${src}`)})</script>`
  const text = (b: Uint8Array) => new TextDecoder().decode(b)

  let out = await replaceAsync(html, /<script\s[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, async (m, src) => {
    const p = resolve(src)
    if (!p) return m
    const content = await readFile(p)
    return content === null ? missing(src) : `<script>\n${text(content)}\n</script>`
  })

  out = await replaceAsync(out, /<link\s[^>]*href=["']([^"']+)["'][^>]*>/gi, async (m, href) => {
    if (!/rel=["']?stylesheet/i.test(m)) return m
    const p = resolve(href)
    if (!p) return m
    const content = await readFile(p)
    return content === null ? missing(href) : `<style>\n${text(content)}\n</style>`
  })

  out = await replaceAsync(out, /(<img\s[^>]*src=)["']([^"']+)["']/gi, async (m, prefix, src) => {
    const p = resolve(src)
    if (!p) return m
    const content = await readFile(p)
    if (content === null) return m
    const ext = p.split('.').pop()?.toLowerCase() ?? ''
    const mime = MIME[ext] ?? 'application/octet-stream'
    return `${prefix}"data:${mime};base64,${toB64(content)}"`
  })

  return out
}
