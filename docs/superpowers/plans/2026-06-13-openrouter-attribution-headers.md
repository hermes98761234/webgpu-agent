# OpenRouter Attribution Headers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send OpenRouter app attribution headers (`HTTP-Referer`, `X-OpenRouter-Title`, `X-OpenRouter-Categories`) on every API call when the configured provider is OpenRouter.

**Architecture:** Add an optional `extraHeaders()` method to the `Provider` interface; implement it in `ApiProvider` to return the three attribution headers when `kind === 'openrouter'` and `{}` otherwise; spread the result into the `fetch` headers in `ApiProvider.chat()`.

**Tech Stack:** TypeScript, Vitest

---

## File Map

| File | Change |
|------|--------|
| `src/types.ts` | Add `extraHeaders?(): Record<string, string>` to `Provider` interface |
| `src/providers/api.ts` | Implement `extraHeaders()` on `ApiProvider`; spread into fetch headers |
| `src/providers/api.test.ts` | Add tests for `extraHeaders()` and that fetch receives the headers |

---

### Task 1: Add `extraHeaders()` to Provider interface and implement on ApiProvider

**Files:**
- Modify: `src/types.ts` (Provider interface, lines 38–47)
- Modify: `src/providers/api.ts` (ApiProvider class, after line 58)
- Modify: `src/providers/api.test.ts` (add new describe block)

- [ ] **Step 1: Write the failing tests**

Open `src/providers/api.test.ts`. After the existing `describe('ApiProvider', ...)` block (at the end of the file), add:

```ts
describe('ApiProvider.extraHeaders', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns attribution headers when kind is openrouter', () => {
    vi.stubGlobal('location', { origin: 'https://test.app' })
    const provider = new ApiProvider({
      kind: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'k',
      model: 'm',
    })
    expect(provider.extraHeaders()).toEqual({
      'HTTP-Referer': 'https://test.app',
      'X-OpenRouter-Title': 'WebGPU Agent',
      'X-OpenRouter-Categories': 'personal-agent',
    })
  })

  it('returns empty object when kind is not openrouter', () => {
    const provider = new ApiProvider({
      kind: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'k',
      model: 'm',
    })
    expect(provider.extraHeaders()).toEqual({})
  })

  it('returns empty object when kind is custom', () => {
    const provider = new ApiProvider({
      kind: 'custom',
      baseUrl: 'https://x.test/v1',
      apiKey: 'k',
      model: 'm',
    })
    expect(provider.extraHeaders()).toEqual({})
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "extraHeaders|FAIL|Error"
```

Expected: Tests fail with something like `provider.extraHeaders is not a function`.

- [ ] **Step 3: Add `extraHeaders?()` to the Provider interface**

Open `src/types.ts`. Find the `Provider` interface (around line 38):

```ts
export interface Provider {
  supportsNativeTools: boolean
  chat(
    messages: ChatMessage[],
    tools: ToolDef[],
    onDelta: (text: string) => void,
    signal?: AbortSignal,
    settings?: AgentSettings,
  ): Promise<ChatResult>
}
```

Replace it with:

```ts
export interface Provider {
  supportsNativeTools: boolean
  extraHeaders?(): Record<string, string>
  chat(
    messages: ChatMessage[],
    tools: ToolDef[],
    onDelta: (text: string) => void,
    signal?: AbortSignal,
    settings?: AgentSettings,
  ): Promise<ChatResult>
}
```

- [ ] **Step 4: Implement `extraHeaders()` on ApiProvider**

Open `src/providers/api.ts`. Find the `ApiProvider` class body after the constructor (around line 57). Add the `extraHeaders()` method after the constructor:

```ts
extraHeaders(): Record<string, string> {
  if (this.#config.kind !== 'openrouter') return {}
  return {
    'HTTP-Referer': window.location.origin,
    'X-OpenRouter-Title': 'WebGPU Agent',
    'X-OpenRouter-Categories': 'personal-agent',
  }
}
```

The full class should now look like:

```ts
export class ApiProvider implements Provider {
  supportsNativeTools = true
  #config: ApiConfig

  constructor(config: ApiConfig) {
    this.#config = config
  }

  extraHeaders(): Record<string, string> {
    if (this.#config.kind !== 'openrouter') return {}
    return {
      'HTTP-Referer': window.location.origin,
      'X-OpenRouter-Title': 'WebGPU Agent',
      'X-OpenRouter-Categories': 'personal-agent',
    }
  }

  async chat( ... ) { ... }   // unchanged
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "extraHeaders|✓|×|PASS|FAIL"
```

Expected: All three `extraHeaders` tests pass. Existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/providers/api.ts src/providers/api.test.ts
git commit -m "feat: add extraHeaders() to Provider interface, implement for OpenRouter"
```

---

### Task 2: Wire `extraHeaders()` into the fetch call

**Files:**
- Modify: `src/providers/api.ts` (fetch headers object, around line 84–90)
- Modify: `src/providers/api.test.ts` (add integration test inside existing `describe('ApiProvider', ...)`)

- [ ] **Step 1: Write the failing integration tests**

Open `src/providers/api.test.ts`. Inside the existing `describe('ApiProvider', ...)` block (after the last `it(...)` and before the closing `}`), add:

```ts
  it('sends attribution headers when kind is openrouter', async () => {
    vi.stubGlobal('location', { origin: 'https://my.app' })
    const mockFetch = vi.fn(async () =>
      sseResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}', 'data: [DONE]']),
    )
    vi.stubGlobal('fetch', mockFetch)
    const provider = new ApiProvider({
      kind: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'k',
      model: 'm',
    })
    await provider.chat([{ role: 'user', content: 'hi' }], [], () => {})
    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>
    expect(headers['HTTP-Referer']).toBe('https://my.app')
    expect(headers['X-OpenRouter-Title']).toBe('WebGPU Agent')
    expect(headers['X-OpenRouter-Categories']).toBe('personal-agent')
  })

  it('does not send attribution headers when kind is not openrouter', async () => {
    const mockFetch = vi.fn(async () =>
      sseResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}', 'data: [DONE]']),
    )
    vi.stubGlobal('fetch', mockFetch)
    const provider = new ApiProvider({
      kind: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'k',
      model: 'm',
    })
    await provider.chat([{ role: 'user', content: 'hi' }], [], () => {})
    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>
    expect(headers['HTTP-Referer']).toBeUndefined()
    expect(headers['X-OpenRouter-Title']).toBeUndefined()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "attribution|FAIL|Error"
```

Expected: The two new tests fail — `HTTP-Referer` is undefined because it's not yet in the fetch headers.

- [ ] **Step 3: Spread `extraHeaders()` into the fetch call**

Open `src/providers/api.ts`. Find the `fetch` call in `ApiProvider.chat()` (around line 84). Replace the `headers` object:

```ts
    const res = await fetch(`${this.#config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.#config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    })
```

With:

```ts
    const res = await fetch(`${this.#config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.#config.apiKey}`,
        ...this.extraHeaders(),
      },
      body: JSON.stringify(body),
      signal,
    })
```

- [ ] **Step 4: Run all tests to verify everything passes**

```bash
npm test -- --reporter=verbose 2>&1
```

Expected: All tests pass. Confirm you see the two new integration tests among the passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/providers/api.ts src/providers/api.test.ts
git commit -m "feat: send OpenRouter attribution headers on API calls"
```
