import type { AgentEvent, Provider } from '../types'

function fallbackName(msg: string): string {
  return msg.trim().slice(0, 40) || 'New chat'
}

export async function nameSession(
  provider: Provider,
  firstUserMsg: string,
  firstAssistantMsg: string,
  onEvent?: (e: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<string> {
  const prompt = `Name this conversation in 4 to 5 words. Reply with ONLY the name, no punctuation, no quotes.\n\nUser: ${firstUserMsg.slice(0, 200)}\nAssistant: ${firstAssistantMsg.slice(0, 200)}`
  const messages = [{ role: 'user' as const, content: prompt }]
  onEvent?.({ type: 'llm_request', messages })
  try {
    const result = await provider.chat(
      messages,
      [],
      () => {},
      signal,
      {
        temperature: 0.3,
        topP: 1,
        maxTokens: 20,
        presencePenalty: 0,
        frequencyPenalty: 0,
        maxContextMessages: 2,
      },
    )
    onEvent?.({ type: 'llm_response', content: result.content })
    const name = result.content.trim().replace(/^["']+|["']+$/g, '').slice(0, 60)
    return name || fallbackName(firstUserMsg)
  } catch (e) {
    onEvent?.({ type: 'error', error: String(e) })
    return fallbackName(firstUserMsg)
  }
}
