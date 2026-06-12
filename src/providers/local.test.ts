import { describe, expect, it } from 'vitest'
import { presetModels, resolveModelForDevice } from './local'

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
