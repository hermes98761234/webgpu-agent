export default function App() {
  const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator
  return (
    <main style={{ padding: 24 }}>
      <h1>WebGPU Agent</h1>
      <p>Browser-based AI agent. UI under construction.</p>
      <p>WebGPU: {hasWebGpu ? 'available' : 'NOT available in this browser'}</p>
    </main>
  )
}
