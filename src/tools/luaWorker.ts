import wasmUri from 'wasmoon/dist/glue.wasm?url'
import { execLua } from './luaExec'

self.onmessage = async (e: MessageEvent<string>) => {
  self.postMessage(await execLua(e.data, wasmUri))
}
