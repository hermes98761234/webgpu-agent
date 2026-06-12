import { useEffect, useState } from 'react'
import { API_PRESETS } from '../providers/api'
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
  const models = deviceModels()
  const families = [...new Set(models.map((m) => m.family))]
  const [caps, setCaps] = useState<GpuCaps | null>(null)
  useEffect(() => {
    void detectGpuCaps().then(setCaps)
  }, [])

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
        </div>
      )}
      {mode === 'api' && (
        <div className="col">
          <div className="row">
            <select
              value={api.kind}
              onChange={(e) => {
                const kind = e.target.value as ApiConfig['kind']
                setApi({ ...api, kind, baseUrl: API_PRESETS[kind].baseUrl || api.baseUrl })
              }}
              disabled={busy}
            >
              {Object.entries(API_PRESETS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="model id, e.g. gpt-4o-mini"
              value={api.model}
              onChange={(e) => setApi({ ...api, model: e.target.value })}
              disabled={busy}
            />
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
        </div>
      )}
    </div>
  )
}
