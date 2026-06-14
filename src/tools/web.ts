import type { ToolDef } from '../types'
import { corsFetch } from './proxy'

const weatherLookup: ToolDef = {
  name: 'weather_lookup',
  description: 'Get current weather for a location.',
  parameters: {
    type: 'object',
    properties: { location: { type: 'string', description: 'City or location name' } },
    required: ['location'],
  },
  source: 'builtin',
  async execute(args) {
    const location = String(args.location)
    try {
      const url = `https://wttr.in/${encodeURIComponent(location)}?format=j1`
      const res = await corsFetch(url)
      if (!res.ok) return `Error: HTTP ${res.status}`
      const json = await res.json()
      const current = json.current_condition?.[0]
      if (!current) return 'Error: no weather data returned'
      const tempC = current.temp_C
      const tempF = current.temp_F
      const condition = current.weatherDesc?.[0]?.value ?? 'unknown'
      const humidity = current.humidity
      const windKmph = current.windspeedKmph
      const windDir = current.winddir16Point
      return `Weather in ${location}:
Temperature: ${tempC}°C / ${tempF}°F
Condition: ${condition}
Humidity: ${humidity}%
Wind: ${windKmph} km/h ${windDir}`
    } catch (e) {
      return `Error: ${String(e)}`
    }
  },
}

const webSearch: ToolDef = {
  name: 'web_search',
  description: 'Search the web via DuckDuckGo and return top 5 results.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: 'Search query' } },
    required: ['query'],
  },
  source: 'builtin',
  async execute(args) {
    const query = String(args.query)
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
      const res = await corsFetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
      if (!res.ok) return `Error: HTTP ${res.status}`
      const html = await res.text()
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')
      const results: string[] = []
      const titleEls = doc.querySelectorAll('.result__title')
      const snippetEls = doc.querySelectorAll('.result__snippet')
      for (let i = 0; i < Math.min(5, titleEls.length); i++) {
        const title = titleEls[i].textContent?.trim() ?? ''
        const snippet = snippetEls[i]?.textContent?.trim() ?? ''
        results.push(`${i + 1}. ${title}\n   ${snippet}`)
      }
      return results.length ? results.join('\n\n') : 'No results found'
    } catch (e) {
      return `Error: ${String(e)}`
    }
  },
}

export const webTools: ToolDef[] = [weatherLookup, webSearch]
