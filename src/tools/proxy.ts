const PROXY_KEY = 'webgpu-agent.corsProxy'

export function getCorsProxy(): string {
  try { return localStorage.getItem(PROXY_KEY) || '' } catch { return '' }
}

export async function corsFetch(url: string, init?: RequestInit): Promise<Response> {
  const proxy = getCorsProxy()
  if (!proxy) return fetch(url, init)
  const target = proxy.includes('{url}')
    ? proxy.replace('{url}', encodeURIComponent(url))
    : proxy.replace(/\/+$/, '') + '/' + url
  return fetch(target, init)
}
