const PROXY_KEY = 'webgpu-agent.corsProxy'

const FALLBACK_PROXIES = [
  { url: 'https://api.allorigins.win/raw?url={url}', name: 'allorigins' },
  { url: 'https://cors.x2u.in/?url={url}', name: 'x2u' },
  { url: 'https://cors.io/?url={url}', name: 'cors.io' },
  { url: 'https://cors-anywhere.com/?url={url}', name: 'cors-anywhere' },
]

export function getCorsProxy(): string {
  try { return localStorage.getItem(PROXY_KEY) || '' } catch { return '' }
}

export function setCorsProxy(proxy: string): void {
  try { localStorage.setItem(PROXY_KEY, proxy) } catch { /* ignore */ }
}

function buildProxyUrl(proxy: string, url: string): string {
  return proxy.includes('{url}')
    ? proxy.replace('{url}', encodeURIComponent(url))
    : proxy.replace(/\/+$/, '') + '/' + encodeURIComponent(url)
}

export async function corsFetch(url: string, init?: RequestInit): Promise<Response> {
  const proxy = getCorsProxy()

  if (proxy) {
    return fetch(buildProxyUrl(proxy, url), init)
  }

  try {
    const res = await fetch(url, init)
    if (res.ok) return res
    if (res.status < 500) return res
    // 5xx: fall through to try proxy fallbacks
  } catch {
    // Direct fetch failed (likely CORS), try fallback proxies
  }

  for (const fallback of FALLBACK_PROXIES) {
    try {
      const res = await fetch(buildProxyUrl(fallback.url, url), init)
      if (res.ok) return res
      if (res.status < 500) return res
    } catch {
      continue
    }
  }

  throw new Error(`CORS blocked. All fallback proxies failed. Configure a custom proxy in Settings.`)
}
