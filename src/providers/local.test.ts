import { describe, expect, it } from 'vitest'
import { presetModels } from './local'

describe('presetModels', () => {
  it('returns a non-empty list of model ids', () => {
    const models = presetModels()
    expect(models.length).toBeGreaterThan(0)
    for (const id of models) expect(typeof id).toBe('string')
  })
})
