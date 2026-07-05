import { LuaFactory } from 'wasmoon'

/** Execute Lua 5.4 source; returns captured print output / final value, or an "Error: …" string. */
export async function execLua(code: string, wasmUri?: string): Promise<string> {
  const factory = wasmUri ? new LuaFactory(wasmUri) : new LuaFactory()
  const lua = await factory.createEngine()
  const out: string[] = []
  try {
    lua.global.set('print', (...args: unknown[]) => {
      out.push(args.map(String).join('\t'))
    })
    const result = await lua.doString(code)
    if (result !== undefined && result !== null) out.push(String(result))
    return out.join('\n') || '(no output)'
  } catch (e) {
    return `Error: ${String(e)}`
  } finally {
    lua.global.close()
  }
}
