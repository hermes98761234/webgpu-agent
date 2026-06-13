# Design: OpenRouter Attribution Headers

**Date:** 2026-06-13  
**Status:** Approved

## Overview

Add the three OpenRouter app attribution HTTP headers to API calls made through the `ApiProvider` when the configured provider is OpenRouter. This enables the app to appear in OpenRouter's rankings and analytics under its own identity.

## Headers

| Header | Value | Required |
|--------|-------|----------|
| `HTTP-Referer` | `window.location.origin` | Yes |
| `X-OpenRouter-Title` | `"WebGPU Agent"` | No |
| `X-OpenRouter-Categories` | `"personal-agent"` | No |

`HTTP-Referer` uses `window.location.origin` dynamically so it reflects the actual deployment URL (GitHub Pages, local dev, etc.) without hardcoding.

## Design

### Provider interface (`src/types.ts`)

Add an optional `extraHeaders` method to the `Provider` interface:

```ts
extraHeaders?(): Record<string, string>
```

This gives any provider a hook to inject additional request headers. The method is optional — providers that don't need it (e.g. `LocalProvider`) implement nothing.

### ApiProvider (`src/providers/api.ts`)

Implement `extraHeaders()` on `ApiProvider`. It returns the three attribution headers when `kind === 'openrouter'`, and an empty object otherwise:

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

The `chat()` method spreads `this.extraHeaders()` into the `fetch` headers:

```ts
headers: {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${this.#config.apiKey}`,
  ...this.extraHeaders(),
},
```

## Scope

- Two files changed: `src/types.ts`, `src/providers/api.ts`
- No config UI changes
- No new files
- `LocalProvider` is untouched

## Why not approach A (inline guard)?

Approach A (`if (kind === 'openrouter') ...` inline in the fetch call) works but bakes provider-specific logic directly into the call site. Approach C keeps provider responsibilities encapsulated in the provider class, which is where they belong.

## Why not approach B (configurable fields)?

The attribution values (`HTTP-Referer`, title, categories) are not user-configurable — they describe the app itself, not the user's preferences. Adding them to `ApiConfig` would expose config knobs that serve no user purpose.
