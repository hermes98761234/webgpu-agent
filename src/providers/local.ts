import { CreateMLCEngine, prebuiltAppConfig } from '@mlc-ai/web-llm'
import type { MLCEngine } from '@mlc-ai/web-llm'
import type { ChatMessage, ChatResult, Provider, ToolDef } from '../types'

const PREFERRED_MODELS = [
  'Qwen3-1.7B-q4f16_1-MLC',
  'Qwen3-4B-q4f16_1-MLC',
  'Llama-3.2-1B-Instruct-q4f16_1-MLC',
  'Llama-3.2-3B-Instruct-q4f16_1-MLC',
  'Phi-3.5-mini-instruct-q4f16_1-MLC',
  'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
  'gemma-2-2b-it-q4f16_1-MLC',
]

export function presetModels(): string[] {
  const available = new Set(prebuiltAppConfig.model_list.map((m) => m.model_id))
  const preferred = PREFERRED_MODELS.filter((id) => available.has(id))
  if (preferred.length > 0) return preferred
  return prebuiltAppConfig.model_list.slice(0, 10).map((m) => m.model_id)
}

export function webgpuAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

export class LocalProvider implements Provider {
  supportsNativeTools = false
  private engine: MLCEngine | null = null
  loadedModel = ''

  async load(modelId: string, onProgress: (text: string, progress: number) => void): Promise<void> {
    if (this.engine && this.loadedModel === modelId) return
    if (this.engine) {
      await this.engine.unload()
      this.engine = null
      this.loadedModel = ''
    }
    this.engine = await CreateMLCEngine(modelId, {
      initProgressCallback: (p) => onProgress(p.text, p.progress),
    })
    this.loadedModel = modelId
  }

  async chat(
    messages: ChatMessage[],
    _tools: ToolDef[],
    onDelta: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<ChatResult> {
    if (!this.engine) throw new Error('No local model loaded — pick a model and press Load first')
    const wire = messages
      .filter((m) => m.role !== 'tool')
      .map((m) => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content }))
    const chunks = await this.engine.chat.completions.create({ messages: wire, stream: true })
    let content = ''
    for await (const chunk of chunks) {
      if (signal?.aborted) break
      const delta = chunk.choices[0]?.delta?.content ?? ''
      if (delta) {
        content += delta
        onDelta(delta)
      }
    }
    return { content, toolCalls: [] }
  }
}
