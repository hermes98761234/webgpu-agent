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
    'To call a tool, reply with ONLY a fenced JSON block in exactly this form:',
    '```json',
    '{"tool": "<tool_name>", "arguments": { ... }}',
    '```',
    'Call at most one tool per reply. After you receive the tool result, continue.',
    'When you can answer the user directly, reply with plain text and NO json block.',
  ].join('\n')
}

let counter = 0

export function parseToolCall(text: string): ToolCall | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  let obj: unknown
  try {
    obj = JSON.parse(candidate.slice(start, end + 1))
  } catch {
    return null
  }
  if (typeof obj !== 'object' || obj === null) return null
  const rec = obj as Record<string, unknown>
  if (typeof rec.tool !== 'string') return null
  const args = rec.arguments
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return null
  counter += 1
  return { id: `local-${counter}`, name: rec.tool, arguments: args as Record<string, unknown> }
}
