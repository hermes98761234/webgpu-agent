import type { ChatMessage } from '../types'

// ponytail: chars/4 heuristic — good enough for trimming; swap in a real
// tokenizer only if trim decisions prove visibly off.
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4)

export const estimateMessageTokens = (m: ChatMessage): number =>
  4 + estimateTokens(m.content) + (m.toolCalls ? estimateTokens(JSON.stringify(m.toolCalls)) : 0)

export const estimateHistoryTokens = (msgs: ChatMessage[]): number =>
  msgs.reduce((sum, m) => sum + estimateMessageTokens(m), 0)

/** Context window by model name pattern. Local WebLLM models use a 4096 sliding window. */
const WINDOWS: [RegExp, number][] = [
  [/gemini/i, 1_000_000],
  [/claude|sonnet|opus|haiku/i, 200_000],
  [/deepseek/i, 64_000],
  [/gpt-4o|gpt-4\.1|gpt-5|o[134]-|llama-?3|mistral|mixtral|qwen/i, 128_000],
  [/gpt-3\.5/i, 16_000],
]

export function contextWindowFor(model: string, isLocal: boolean): number {
  if (isLocal) return 4096
  for (const [re, size] of WINDOWS) if (re.test(model)) return size
  return 32_000 // conservative default for unknown API models
}

/** USD per 1M tokens [input, output] by model name pattern. Undefined = unknown/free. */
const PRICES: [RegExp, [number, number]][] = [
  [/gpt-4o-mini/i, [0.15, 0.6]],
  [/gpt-4o/i, [2.5, 10]],
  [/gpt-4\.1-mini/i, [0.4, 1.6]],
  [/gpt-4\.1/i, [2, 8]],
  [/o3|o1/i, [2, 8]],
  [/haiku/i, [1, 5]],
  [/sonnet/i, [3, 15]],
  [/opus/i, [15, 75]],
  [/gemini.*flash/i, [0.15, 0.6]],
  [/gemini.*pro/i, [1.25, 10]],
  [/deepseek/i, [0.27, 1.1]],
  [/:free|free$/i, [0, 0]],
]

export function priceFor(model: string): [number, number] | undefined {
  for (const [re, p] of PRICES) if (re.test(model)) return p
  return undefined
}

/** Token budget for conversation history: explicit setting, or window minus system prompt, output reserve and margin. */
export function historyBudget(
  maxContextTokens: number,
  model: string,
  isLocal: boolean,
  systemTokens: number,
  maxOutputTokens: number,
): number {
  if (maxContextTokens > 0) return maxContextTokens
  return Math.max(1024, contextWindowFor(model, isLocal) - systemTokens - maxOutputTokens - 256)
}

/**
 * Drop oldest messages until the estimated size fits the token budget,
 * then advance to the next user message so history never starts with a
 * dangling assistant/tool message. Always keeps the last message.
 */
export function trimToTokenBudget(msgs: ChatMessage[], budget: number): ChatMessage[] {
  if (budget <= 0) return msgs
  let total = estimateHistoryTokens(msgs)
  if (total <= budget) return msgs
  let start = 0
  while (start < msgs.length - 1 && total > budget) {
    total -= estimateMessageTokens(msgs[start])
    start++
  }
  while (start < msgs.length - 1 && msgs[start].role !== 'user') start++
  return msgs.slice(start)
}
