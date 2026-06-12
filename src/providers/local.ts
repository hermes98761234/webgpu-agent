import { CreateMLCEngine, prebuiltAppConfig } from '@mlc-ai/web-llm'
import type { MLCEngine } from '@mlc-ai/web-llm'
import type { AgentSettings, ChatMessage, ChatResult, Provider, ToolDef } from '../types'

// Preferred models shown at top of picker — fast, capable, well-tested
const PREFERRED_MODELS = [
  'Qwen3-1.7B-q4f16_1-MLC',
  'Qwen3-4B-q4f16_1-MLC',
  'Qwen3-8B-q4f16_1-MLC',
  'Llama-3.2-1B-Instruct-q4f16_1-MLC',
  'Llama-3.2-3B-Instruct-q4f16_1-MLC',
  'Llama-3.1-8B-Instruct-q4f16_1-MLC',
  'Phi-3.5-mini-instruct-q4f16_1-MLC',
  'Phi-4-mini-instruct-q4f16_1-MLC',
  'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
  'SmolLM2-360M-Instruct-q4f16_1-MLC',
  'gemma-2-2b-it-q4f16_1-MLC',
  'gemma-2-9b-it-q4f16_1-MLC',
  'Mistral-7B-Instruct-v0.3-q4f16_1-MLC',
  'deepseek-r1-distill-llama-8b-q4f16_1-MLC',
]

export interface ModelInfo {
  id: string
  family: string
  preferred: boolean
}

export function allModels(): ModelInfo[] {
  const available = new Map(prebuiltAppConfig.model_list.map((m) => [m.model_id, m]))
  const preferredSet = new Set(PREFERRED_MODELS)

  const preferred: ModelInfo[] = PREFERRED_MODELS
    .filter((id) => available.has(id))
    .map((id) => ({ id, family: modelFamily(id), preferred: true }))

  const preferredIds = new Set(preferred.map((m) => m.id))
  const rest: ModelInfo[] = prebuiltAppConfig.model_list
    .filter((m) => !preferredIds.has(m.model_id) && !preferredSet.has(m.model_id))
    .map((m) => ({ id: m.model_id, family: modelFamily(m.model_id), preferred: false }))

  return [...preferred, ...rest]
}

function modelFamily(id: string): string {
  const lower = id.toLowerCase()
  if (lower.includes('qwen')) return 'Qwen'
  if (lower.includes('llama')) return 'Llama'
  if (lower.includes('phi')) return 'Phi'
  if (lower.includes('gemma')) return 'Gemma'
  if (lower.includes('mistral')) return 'Mistral'
  if (lower.includes('deepseek')) return 'DeepSeek'
  if (lower.includes('smollm')) return 'SmolLM'
  if (lower.includes('stablelm')) return 'StableLM'
  if (lower.includes('redpajama')) return 'RedPajama'
  if (lower.includes('wizardmath')) return 'WizardMath'
  if (lower.includes('tinyllama')) return 'TinyLlama'
  if (lower.includes('openchat')) return 'OpenChat'
  return 'Other'
}

export function presetModels(): string[] {
  return allModels()
    .filter((m) => m.preferred)
    .map((m) => m.id)
}

export function webgpuAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

export interface GpuCaps {
  available: boolean
  f16Trusted: boolean
}

let capsPromise: Promise<GpuCaps> | null = null

export function detectGpuCaps(): Promise<GpuCaps> {
  if (!capsPromise) capsPromise = probeGpu()
  return capsPromise
}

async function probeGpu(): Promise<GpuCaps> {
  if (!webgpuAvailable()) return { available: false, f16Trusted: false }
  try {
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) return { available: false, f16Trusted: false }
    const hasF16 = adapter.features.has('shader-f16')
    // Mobile GPU drivers (Adreno/Mali) often advertise shader-f16 but overflow
    // or produce NaNs in FP16 matmuls, turning model output into random tokens.
    const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
    return { available: true, f16Trusted: hasF16 && !mobile }
  } catch {
    return { available: false, f16Trusted: false }
  }
}

export function resolveModelForDevice(modelId: string, f16Trusted: boolean): string {
  if (f16Trusted || !modelId.includes('q4f16')) return modelId
  const fallback = modelId.replace(/q4f16/g, 'q4f32')
  const exists = prebuiltAppConfig.model_list.some((m) => m.model_id === fallback)
  return exists ? fallback : modelId
}

export class LocalProvider implements Provider {
  supportsNativeTools = false
  private engine: MLCEngine | null = null
  loadedModel = ''

  async load(modelId: string, onProgress: (text: string, progress: number) => void): Promise<void> {
    const caps = await detectGpuCaps()
    const resolved = resolveModelForDevice(modelId, caps.f16Trusted)
    if (resolved !== modelId) {
      onProgress(`This GPU's FP16 support is unreliable — loading ${resolved} instead to avoid garbled output`, 0)
    }
    modelId = resolved
    if (this.engine && this.loadedModel === modelId) return
    if (this.engine) {
      await this.engine.unload()
      this.engine = null
      this.loadedModel = ''
    }
    this.engine = await CreateMLCEngine(
      modelId,
      {
        initProgressCallback: (p) => onProgress(p.text, p.progress),
      },
      {
        // Use a sliding window so long prompts don't throw ContextWindowSizeExceededError.
        // MLC requires context_window_size: -1 when sliding_window_size is set.
        context_window_size: -1,
        sliding_window_size: 4096,
        attention_sink_size: 4,
      },
    )
    this.loadedModel = modelId
  }

  async chat(
    messages: ChatMessage[],
    _tools: ToolDef[],
    onDelta: (text: string) => void,
    signal?: AbortSignal,
    settings?: AgentSettings,
  ): Promise<ChatResult> {
    if (!this.engine) throw new Error('No local model loaded — pick a model and press Load first')
    const wire = messages
      .filter((m) => m.role !== 'tool')
      .map((m) => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content }))
    const opts = {
      messages: wire,
      stream: true as const,
      temperature: settings?.temperature,
      top_p: settings?.topP,
      max_tokens: settings?.maxTokens,
      presence_penalty: settings?.presencePenalty,
      frequency_penalty: settings?.frequencyPenalty,
    }
    let chunks
    try {
      chunks = await this.engine.chat.completions.create(opts)
    } catch (e) {
      if (!String(e).includes('ContextWindowSizeExceeded')) throw e
      // Trim progressively, starting from the user's context budget, until it fits.
      const sys = wire.filter((m) => m.role === 'system')
      const rest = wire.filter((m) => m.role !== 'system')
      let keep = Math.min(rest.length, Math.max(2, Math.floor((settings?.maxContextMessages ?? 8) / 2)))
      for (;;) {
        try {
          chunks = await this.engine.chat.completions.create({ ...opts, messages: [...sys, ...rest.slice(-keep)] })
          break
        } catch (e2) {
          if (keep > 2 && String(e2).includes('ContextWindowSizeExceeded')) {
            keep = Math.floor(keep / 2)
          } else {
            throw e2
          }
        }
      }
    }
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
