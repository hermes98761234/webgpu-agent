import { useEffect, useState } from 'react'
import { API_PRESETS } from '../providers/api'
import { analyzeGpuRestrictions } from '../gpu-restrictions'
import { detectGpuCaps, deviceModels, webgpuAvailable } from '../providers/local'
import type { GpuCaps } from '../providers/local'
import type { ApiConfig } from '../types'

export type ProviderMode = 'local' | 'api'

export function ModelPicker({ mode, setMode, localModel, setLocalModel, api, setApi, loadState, onLoadLocal, busy }: {
  mode: ProviderMode
  setMode: (m: ProviderMode) => void
  localModel: string
  setLocalModel: (m: string) => void
  api: ApiConfig
  setApi: (c: ApiConfig) => void
  loadState: { status: 'idle' | 'loading' | 'ready' | 'error'; text: string }
  onLoadLocal: () => void
  busy: boolean
}) {
  const allModels = deviceModels()
  const [caps, setCaps] = useState<GpuCaps | null>(null)
  useEffect(() => {
    void detectGpuCaps().then(setCaps)
  }, [])

  const hwString = caps
    ? `GPU: ${caps.gpu} · FP16 ${caps.f16Trusted ? 'trusted' : 'untrusted — q4f32 models will be substituted'}`
    : ''
  const restriction = analyzeGpuRestrictions(hwString)
  const models = restriction.disabled_precisions.length > 0
    ? allModels.filter((m) => !restriction.disabled_precisions.some((p) => m.id.includes(p)))
    : allModels

  useEffect(() => {
    if (models.length > 0 && !models.some((m) => m.id === localModel)) {
      setLocalModel(models[0].id)
    }
  }, [models, localModel, setLocalModel])

  const families = [...new Set(models.map((m) => m.family))]

  return (
    <div className="model-picker">
      <div className="row">
        <label>
          <input type="radio" checked={mode === 'local'} onChange={() => setMode('local')} disabled={busy} />
          Local (WebGPU)
        </label>
        <label>
          <input type="radio" checked={mode === 'api'} onChange={() => setMode('api')} disabled={busy} />
          External API
        </label>
      </div>
      {mode === 'local' && (
        <div className="col">
          {!webgpuAvailable() && (
            <p className="warn">WebGPU is not available in this browser — use an external API instead.</p>
          )}
          <div className="row">
            <select value={localModel} onChange={(e) => setLocalModel(e.target.value)} disabled={busy || loadState.status === 'loading'}>
              <optgroup label="⭐ Recommended">
                {models.filter((m) => m.preferred).map((m) => (
                  <option key={m.id} value={m.id}>{m.id}</option>
                ))}
              </optgroup>
              {families.map((fam) => {
                const group = models.filter((m) => !m.preferred && m.family === fam)
                if (group.length === 0) return null
                return (
                  <optgroup key={fam} label={fam}>
                    {group.map((m) => (
                      <option key={m.id} value={m.id}>{m.id}</option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
            <button onClick={onLoadLocal} disabled={busy || loadState.status === 'loading' || !webgpuAvailable()}>
              {loadState.status === 'ready' ? 'Reload' : 'Load'}
            </button>
          </div>
          {loadState.text && <p className={loadState.status === 'error' ? 'warn' : 'dim'}>{loadState.text}</p>}
          {caps && (
            <p className="dim">
              GPU: {caps.gpu} · FP16 {caps.f16Trusted ? 'trusted' : 'untrusted — q4f32 models will be substituted'}
            </p>
          )}
          {restriction.status === 'restricted' && (
            <p className="warn">{restriction.reason}</p>
          )}
        </div>
      )}
      {mode === 'api' && (
        <div className="col">
          <div className="row">
            <select
              value={api.kind}
              onChange={(e) => {
                const kind = e.target.value as ApiConfig['kind']
                // Keep a hand-typed model; replace it if empty or it was just the old preset's suggestion
                const wasSuggestion = !api.model || API_PRESETS[api.kind].models.includes(api.model)
                setApi({
                  ...api,
                  kind,
                  baseUrl: API_PRESETS[kind].baseUrl || api.baseUrl,
                  model: wasSuggestion ? (API_PRESETS[kind].models[0] ?? api.model) : api.model,
                })
              }}
              disabled={busy}
            >
              {Object.entries(API_PRESETS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <input
              type="text"
              list="api-model-suggestions"
              placeholder="model id, e.g. claude-opus-4-8"
              value={api.model}
              onChange={(e) => setApi({ ...api, model: e.target.value })}
              disabled={busy}
            />
            <datalist id="api-model-suggestions">
              {API_PRESETS[api.kind].models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
          <div className="row">
            <input
              type="text"
              placeholder="base URL"
              value={api.baseUrl}
              onChange={(e) => setApi({ ...api, baseUrl: e.target.value })}
              disabled={busy}
            />
            <input
              type="password"
              placeholder="API key"
              value={api.apiKey}
              onChange={(e) => setApi({ ...api, apiKey: e.target.value })}
              disabled={busy}
            />
          </div>
          <div className="row">
            <label title="Minimum seconds between requests to this provider. Use for free-tier rate limits, e.g. 10 requests/min = 6 sec. 0 = off.">
              sec between requests
              <input
                type="number"
                min={0}
                step={1}
                value={api.minRequestIntervalSec ?? 0}
                onChange={(e) => setApi({ ...api, minRequestIntervalSec: Math.max(0, Number(e.target.value) || 0) })}
                disabled={busy}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
