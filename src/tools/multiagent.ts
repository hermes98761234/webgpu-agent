import { runAgent } from '../agent/loop'
import type { AgentType } from '../agents'
import type { ToolDef, Provider } from '../types'

export function makeSpawnAgentTool(
  getProvider: () => Provider,
  getTools: () => ToolDef[],
  getSignal?: () => AbortSignal | undefined,
  getAgentTypes?: () => AgentType[],
): ToolDef {
  const types = getAgentTypes?.() ?? []
  const typeList = types.length
    ? ` Available agent_type values: ${types.map((t) => `"${t.name}" (${t.description})`).join('; ')}.`
    : ''
  return {
    name: 'spawn_agent',
    description:
      'Delegate a subtask to a fresh agent instance with all tools. Use this to parallelize work or isolate complex subtasks. Returns the sub-agent\'s final response.' + typeList,
    parameters: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Complete description of what the sub-agent should do' },
        agent_type: { type: 'string', description: 'Named agent type whose system prompt to use' },
        system_prompt: { type: 'string', description: 'Custom system prompt (overrides agent_type)' },
      },
      required: ['task'],
    },
    source: 'builtin',
    async execute(args) {
      try {
        const task = String(args.task)
        const type = types.find((t) => t.name === String(args.agent_type ?? ''))
        const systemPrompt = args.system_prompt ? String(args.system_prompt) : (type?.prompt ?? '')
        const allTools = getTools()
        const subTools = allTools.filter((t) => t.name !== 'spawn_agent')
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
          // Inherit the parent agent's abort signal so Stop cancels sub-agents too.
          getSignal?.(),
        )
        if (!finalContent) {
          const last = [...messages].reverse().find((m) => m.role === 'assistant')
          finalContent = last?.content ?? 'No response'
        }
        return finalContent
      } catch (e) {
        return `Error: ${String(e)}`
      }
    },
  }
}
