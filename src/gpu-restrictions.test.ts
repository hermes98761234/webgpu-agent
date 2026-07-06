import { describe, expect, it } from 'vitest'
import { analyzeGpuRestrictions } from './gpu-restrictions'

describe('analyzeGpuRestrictions', () => {
  it('restricts arm valhall', () => {
    const r = analyzeGpuRestrictions('GPU: arm valhall · FP16 untrusted — q4f32 models will be substituted')
    expect(r.status).toBe('restricted')
    expect(r.disabled_precisions).toContain('q4f16')
    expect(r.disabled_precisions).toContain('f16')
  })

  it('restricts mali', () => {
    const r = analyzeGpuRestrictions('GPU: mali-g710 · FP16 untrusted')
    expect(r.status).toBe('restricted')
    expect(r.disabled_precisions).toContain('q4f16_1')
  })

  it('restricts on FP16 untrusted alone', () => {
    const r = analyzeGpuRestrictions('GPU: unknown · FP16 untrusted — q4f32 models will be substituted')
    expect(r.status).toBe('restricted')
    expect(r.reason).not.toContain('Mali') // don't claim a Mali GPU we never detected
  })

  it('is compatible for desktop GPU', () => {
    const r = analyzeGpuRestrictions('GPU: nvidia geforce rtx 4090 · FP16 trusted')
    expect(r.status).toBe('compatible')
    expect(r.disabled_precisions).toHaveLength(0)
  })

  it('is compatible for empty string', () => {
    const r = analyzeGpuRestrictions('')
    expect(r.status).toBe('compatible')
  })

  it('is compatible for unknown GPU with trusted FP16', () => {
    const r = analyzeGpuRestrictions('GPU: unknown · FP16 trusted')
    expect(r.status).toBe('compatible')
  })

  it('case-insensitive ARM Valhall match', () => {
    const r = analyzeGpuRestrictions('GPU: ARM Valhall')
    expect(r.status).toBe('restricted')
  })
})
