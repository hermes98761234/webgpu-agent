const PROXY_KEY = 'webgpu-agent.corsProxy'

const FALLBACK_PROXIES = [
  { url: 'https://cors.io/?url={url}', name: 'cors.io', supportsMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
  { url: 'https://cors.x2u.in/?url={url}', name: 'x2u', supportsMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
  { url: 'https://api.allorigins.win/raw?url={url}', name: 'allorigins', supportsMethods: ['GET'] },
  { url: 'https://cors-anywhere.com/?url={url}', name: 'cors-anywhere', supportsMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
]

export function getSupportedMethods(): string[] {
  const methods = new Set<string>()
  for (const proxy of FALLBACK_PROXIES) {
    for (const method of proxy.supportsMethods) {
      methods.add(method)
    }
  }
  return Array.from(methods)
}

export function isMethodSupported(method: string): boolean {
  return FALLBACK_PROXIES.some(proxy => proxy.supportsMethods.includes(method.toUpperCase()))
}

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
  } catch {
    // Direct fetch failed (likely CORS), try fallback proxies
  }

  const method = (init?.method || 'GET').toUpperCase()

  for (const fallback of FALLBACK_PROXIES) {
    if (!fallback.supportsMethods.includes(method)) {
      continue
    }
    try {
      const res = await fetch(buildProxyUrl(fallback.url, url), init)
      if (res.ok) return res
    } catch {
      continue
    }
  }

  throw new Error(`CORS blocked. All fallback proxies failed. Configure a custom proxy in Settings.`)
}
