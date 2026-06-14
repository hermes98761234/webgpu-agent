const PROXY_KEY = 'webgpu-agent.corsProxy'
const DEFAULT_PROXY = 'https://corsproxy.io/?url={url}'

export function getCorsProxy(): string {
  try { return localStorage.getItem(PROXY_KEY) || '' } catch { return '' }
}

export function setCorsProxy(proxy: string): void {
  try { localStorage.setItem(PROXY_KEY, proxy) } catch { /* ignore */ }
}

export function getEffectiveProxy(): string {
  return getCorsProxy() || DEFAULT_PROXY
}

export async function corsFetch(url: string, init?: RequestInit): Promise<Response> {
  const proxy = getCorsProxy()
  if (!proxy) {
    try {
      const res = await fetch(url, init)
      if (res.ok) return res
      return res
    } catch (e) {
      if (e instanceof TypeError && String(e.message).includes('fetch')) {
        throw new Error(`CORS blocked. Configure a proxy in Settings (current: none).`, { cause: e })
      }
      throw e
    }
  }
  const target = proxy.includes('{url}')
    ? proxy.replace('{url}', encodeURIComponent(url))
    : proxy.replace(/\/+$/, '') + '/' + url
  return fetch(target, init)
}
