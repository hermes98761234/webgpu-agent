import { runAgent } from '../agent/loop'
import type { ToolDef, Provider } from '../types'

export function makeSpawnAgentTool(
  getProvider: () => Provider,
  getTools: () => ToolDef[],
): ToolDef {
  return {
    name: 'spawn_agent',
    description:
      'Delegate a subtask to a fresh agent instance. The sub-agent has access to all tools. Use this to parallelize work or isolate complex subtasks. Returns the sub-agent\'s final response.',
    parameters: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Complete description of what the sub-agent should do' },
        system_prompt: { type: 'string', description: 'Optional system prompt for the sub-agent' },
      },
      required: ['task'],
    },
    source: 'builtin',
    async execute(args) {
      const task = String(args.task)
      const systemPrompt = args.system_prompt ? String(args.system_prompt) : ''
      const allTools = getTools()
      const subTools = allTools.filter((t) => t.name !== 'spawn_agent')
      const controller = new AbortController()
      let finalContent = ''
      const messages = await runAgent(
        [{ role: 'user', content: task }],
        getProvider(),
        subTools,
        systemPrompt,
        (event) => {
          if (event.type === 'assistant_message') {
            finalContent = event.message.content
          }
        },
        controller.signal,
      )
      if (!finalContent) {
        const last = [...messages].reverse().find((m) => m.role === 'assistant')
        finalContent = last?.content ?? 'No response'
      }
      return finalContent
    },
  }
}
