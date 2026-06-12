import { API_PRESETS } from '../providers/api'
import { presetModels, webgpuAvailable } from '../providers/local'
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
              {presetModels().map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <button onClick={onLoadLocal} disabled={busy || loadState.status === 'loading' || !webgpuAvailable()}>
              {loadState.status === 'ready' ? 'Reload' : 'Load'}
            </button>
          </div>
          {loadState.text && <p className={loadState.status === 'error' ? 'warn' : 'dim'}>{loadState.text}</p>}
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
              placeholder="model id, e.g. gpt-4o-mini or qwen/qwen3-coder"
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
              placeholder="API key (stored in localStorage)"
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
