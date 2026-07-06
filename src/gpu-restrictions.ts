export interface GpuRestriction {
  status: 'restricted' | 'compatible'
  reason: string
  action: string
  disabled_precisions: string[]
}

const RESTRICTED_PRECISIONS = ['f16', 'q4f16', 'f16_1', 'q4f16_1']

export function analyzeGpuRestrictions(hardwareString: string): GpuRestriction {
  const s = hardwareString.toLowerCase()
  const isMali = s.includes('arm valhall') || s.includes('mali')
  const restricted = isMali || s.includes('fp16 untrusted')

  if (!restricted) {
    return {
      status: 'compatible',
      reason: 'No known FP16 hardware restrictions detected.',
      action: 'All model precisions are available.',
      disabled_precisions: [],
    }
  }

  return {
    status: 'restricted',
    reason: isMali
      ? 'ARM Valhall (Mali) GPU detected with untrusted FP16 support. Browser-forced substitution will corrupt text output.'
      : 'This GPU’s FP16 support is untrusted — f16/q4f16 models are hidden to avoid corrupted output.',
    action: 'Disable all f16 and q4f16 models in the selection menu.',
    disabled_precisions: RESTRICTED_PRECISIONS,
  }
}
