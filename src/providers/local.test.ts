import { describe, expect, it } from 'vitest'
import { prebuiltAppConfig } from '@mlc-ai/web-llm'
import type { ModelRecord } from '@mlc-ai/web-llm'
import { allModels, appConfig, CUSTOM_MODELS, presetModels, resolveModelForDevice } from './local'

describe('presetModels', () => {
  it('returns a non-empty list of model ids', () => {
    const models = presetModels()
    expect(models.length).toBeGreaterThan(0)
    for (const id of models) expect(typeof id).toBe('string')
  })
})

describe('resolveModelForDevice', () => {
  it('keeps the model when f16 is trusted', () => {
    expect(resolveModelForDevice('Llama-3.2-1B-Instruct-q4f16_1-MLC', true)).toBe('Llama-3.2-1B-Instruct-q4f16_1-MLC')
  })

  it('swaps q4f16 for q4f32 when f16 is untrusted', () => {
    expect(resolveModelForDevice('Llama-3.2-1B-Instruct-q4f16_1-MLC', false)).toBe('Llama-3.2-1B-Instruct-q4f32_1-MLC')
  })

  it('keeps the model when no q4f32 variant exists', () => {
    expect(resolveModelForDevice('not-a-real-model-q4f16_1-MLC', false)).toBe('not-a-real-model-q4f16_1-MLC')
  })

  it('leaves non-q4f16 models alone', () => {
    expect(resolveModelForDevice('Llama-3.2-1B-Instruct-q4f32_1-MLC', false)).toBe('Llama-3.2-1B-Instruct-q4f32_1-MLC')
  })
})

const custom: ModelRecord[] = [
  {
    model_id: 'Nova-Qwen3-0.6B-q4f16_1-MLC',
    model: 'https://huggingface.co/example/Nova-Qwen3-0.6B-q4f16_1-MLC',
    model_lib: 'https://example.com/qwen3-0.6b.wasm',
    vram_required_MB: 1400,
  },
]

describe('custom models', () => {
  it('ships with an empty custom list by default', () => {
    expect(CUSTOM_MODELS).toEqual([])
  })

  it('allModels lists custom entries first, marked preferred', () => {
    const models = allModels(custom)
    expect(models[0]).toEqual({ id: 'Nova-Qwen3-0.6B-q4f16_1-MLC', family: 'Qwen', preferred: true })
    expect(models.length).toBe(allModels([]).length + 1)
  })

  it('appConfig puts custom records ahead of the prebuilt catalog', () => {
    const cfg = appConfig(custom)
    expect(cfg.model_list[0].model_id).toBe('Nova-Qwen3-0.6B-q4f16_1-MLC')
    expect(cfg.model_list.length).toBe(prebuiltAppConfig.model_list.length + 1)
  })
})
