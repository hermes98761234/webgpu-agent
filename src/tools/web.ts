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

async function searchAlternative(query: string): Promise<string> {
  try {
    // Use DuckDuckGo's Instant Answer API as fallback
    const apiRes = await corsFetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`,
      undefined,
      { proxyFirst: true }
    )
    
    if (apiRes.ok) {
      const data = await apiRes.json()
      const results: string[] = []
      
      if (data.Abstract) {
        results.push(`Summary: ${data.Abstract}`)
      }
      
      if (data.RelatedTopics && data.RelatedTopics.length > 0) {
        for (let i = 0; i < Math.min(5, data.RelatedTopics.length); i++) {
          const topic = data.RelatedTopics[i]
          if (topic.Text) {
            results.push(`${i + 1}. ${topic.Text}`)
          }
        }
      }
      
      if (results.length > 0) {
        return results.join('\n\n')
      }
    }
    
    // If API also fails, return helpful message
    return `Search temporarily unavailable. Please try again later or configure a custom CORS proxy in Settings.`
  } catch {
    return `Search temporarily unavailable. Please try again later or configure a custom CORS proxy in Settings.`
  }
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
      // Try DuckDuckGo HTML endpoint first
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
      const res = await corsFetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      }, { proxyFirst: true })
      
      if (!res.ok) {
        // If DuckDuckGo fails, try alternative approach
        return await searchAlternative(query)
      }
      
      const html = await res.text()
      
      // Check for CAPTCHA or bot detection
      if (html.includes('anomaly-modal') || html.includes('challenge-form')) {
        return await searchAlternative(query)
      }
      
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
