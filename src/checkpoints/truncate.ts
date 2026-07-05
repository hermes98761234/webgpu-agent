import type { ChatMessage } from '../types'
import type { DisplayItem } from '../ui/MessageList'

/**
 * Compute the truncated conversation for a revert to display index `dispIndex`
 * (a user item). Context trimming means message indexes shift over time, so we
 * map display→messages by counting real user turns from the end. Tool results
 * for non-native providers are role:'user' with a "[Tool result for " prefix —
 * those are not user turns.
 */
export function truncateForRevert(
  messages: ChatMessage[],
  display: DisplayItem[],
  dispIndex: number,
): { messages: ChatMessage[]; display: DisplayItem[] } {
  const removedUserTurns = display.slice(dispIndex).filter((d) => d.kind === 'user').length
  const newDisplay = display.slice(0, dispIndex)
  if (removedUserTurns === 0) return { messages, display: newDisplay }
  const realUserIdxs = messages
    .map((m, i) => (m.role === 'user' && !m.content.startsWith('[Tool result for ') ? i : -1))
    .filter((i) => i >= 0)
  const cut = realUserIdxs[realUserIdxs.length - removedUserTurns] ?? 0
  return { messages: messages.slice(0, cut), display: newDisplay }
}
