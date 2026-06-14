type RouteView = 'chat' | 'settings' | 'files' | 'terminal' | 'log' | 'about' | 'goal' | 'schedule'

interface ParsedRoute {
  view: RouteView
  sessionId?: string
}

const VALID_VIEWS: Set<string> = new Set(['chat', 'settings', 'files', 'terminal', 'log', 'about', 'goal', 'schedule'])

export function parseHash(): ParsedRoute {
  const hash = window.location.hash.slice(1)
  if (!hash || hash === '/') return { view: 'chat' }
  const parts = hash.split('/').filter(Boolean)
  if (parts.length === 0) return { view: 'chat' }
  const viewPart = parts[0]
  if (!VALID_VIEWS.has(viewPart)) return { view: 'chat' }
  if (viewPart === 'chat' && parts.length >= 2 && parts[1]) {
    return { view: 'chat', sessionId: parts[1] }
  }
  return { view: viewPart as RouteView }
}

function serialize(route: ParsedRoute): string {
  return route.view === 'chat' && route.sessionId
    ? `/chat/${route.sessionId}`
    : `/${route.view}`
}

export function replaceHash(route: ParsedRoute): void {
  window.history.replaceState(null, '', '#' + serialize(route))
}

export function pushHash(route: ParsedRoute): void {
  window.history.pushState(null, '', '#' + serialize(route))
}
