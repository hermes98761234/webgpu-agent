import type { ToolCall, ToolDef } from '../types'

export function buildToolSystemPrompt(tools: ToolDef[]): string {
  if (tools.length === 0) return ''
  const lines = tools.map(
    (t) => `- ${t.name}: ${t.description}\n  parameters (JSON Schema): ${JSON.stringify(t.parameters)}`,
  )
  return [
    'You can call tools. Available tools:',
    ...lines,
    '',
    'To call a tool, embed a JSON object directly in your reply on its own line:',
    '{"tool": "<tool_name>", "arguments": { ... }}',
    '',
    'You may call multiple tools in a single reply — place each on its own line.',
    'After you receive the tool results, continue your response.',
    'When answering directly without tools, reply with plain text only.',
  ].join('\n')
}

let counter = 0

function isToolCallShape(obj: unknown): obj is { tool: string; arguments: Record<string, unknown> } {
  if (typeof obj !== 'object' || obj === null) return false
  const rec = obj as Record<string, unknown>
  if (typeof rec.tool !== 'string') return false
  const args = rec.arguments
  return typeof args === 'object' && args !== null && !Array.isArray(args)
}

/** Extract every {"tool":…,"arguments":…} JSON object embedded anywhere in text. */
export function parseToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = []
  let i = 0
  while (i < text.length) {
    const pos = text.indexOf('{', i)
    if (pos === -1) break
    // Walk to find the matching closing brace
    let depth = 0
    let j = pos
    let inStr = false
    let esc = false
    while (j < text.length) {
      const ch = text[j]
      if (esc) { esc = false; j++; continue }
      if (inStr) {
        if (ch === '\\') esc = true
        else if (ch === '"') inStr = false
      } else {
        if (ch === '"') inStr = true
        else if (ch === '{') depth++
        else if (ch === '}') { if (--depth === 0) break }
      }
      j++
    }
    if (depth === 0) {
      try {
        const obj = JSON.parse(text.slice(pos, j + 1))
        if (isToolCallShape(obj)) {
          counter++
          calls.push({ id: `local-${counter}`, name: obj.tool, arguments: obj.arguments })
          i = j + 1
          continue
        }
      } catch {
        // not valid JSON at this position — move past the opening brace
      }
    }
    i = pos + 1
  }
  return calls
}

/** @deprecated Use parseToolCalls instead. Kept for backward compatibility. */
export function parseToolCall(text: string): ToolCall | null {
  const calls = parseToolCalls(text)
  return calls[0] ?? null
}
