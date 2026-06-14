# Skill: web-dev-workflow

# Web Development Workflow

Standard workflow for adding new functionality with tests and CI/CD verification.

## When to Use This Skill

Use this skill when:
- Adding new features to a web application
- Creating utility functions with tests
- Fixing bugs and verifying fixes
- Checking GitHub Actions status

## Workflow Steps

### 1. Understand the Codebase

Before making changes:
- Read relevant files to understand existing patterns
- Check package.json for available tools and test frameworks
- Look at existing tests to understand testing conventions

### 2. Create Implementation Plan

For new features:
1. Create utility functions in separate files (e.g., `src/router.ts`)
2. Add TypeScript types for better type safety
3. Keep functions pure and testable

### 3. Write Tests First (TDD)

Create test file alongside implementation:
- Use the same naming convention: `src/feature.test.ts`
- Import from vitest: `import { describe, it, expect, beforeEach, vi } from 'vitest'`
- Test all public functions and edge cases
- Mock external dependencies when needed

### 4. Implement the Feature

- Follow existing code patterns in the project
- Add proper TypeScript types
- Keep functions small and focused
- Add JSDoc comments for complex functions

### 5. Run Tests Locally

```bash
npx vitest run src/feature.test.ts
```

### 6. Run Linter

```bash
npm run lint
```

Fix any errors (warnings are usually pre-existing).

### 7. Run Type Check

```bash
npx tsc --noEmit
```

### 8. Run Build

```bash
npm run build
```

### 9. Commit and Push

```bash
git add src/feature.ts src/feature.test.ts
git commit -m "feat: add feature description"
git push
```

### 10. Check GitHub Actions

```bash
gh run list --limit 3
gh run view <run-id> --log-failed
```

Wait for workflows to complete and fix any failures.

## Common Issues and Fixes

### TypeScript Errors

**Error**: `Cannot redeclare block-scoped variable`
**Fix**: Remove duplicate declarations

**Error**: `Type 'string | undefined' is not assignable to type 'string | null'`
**Fix**: Use nullish coalescing: `value ?? null`

### Lint Errors

**Error**: `Avoid calling setState() directly within an effect`
**Fix**: Use eslint-disable comment for legitimate cases:
```typescript
// eslint-disable-next-line react-hooks/set-state-in-effect
void someFunction()
```

**Error**: `React Hook useEffect has a missing dependency`
**Fix**: Add eslint-disable comment if intentional:
```typescript
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

### GitHub Actions Failures

**CI Failure**: Check logs with `gh run view <id> --log-failed`
**Deploy Failure**: Usually caused by CI failure - fix CI first

## Testing Best Practices

1. **Test all public functions**: Export and test each function separately
2. **Test edge cases**: Empty inputs, null values, special characters
3. **Mock external dependencies**: Use `vi.fn()` for spies and mocks
4. **Use beforeEach**: Reset state between tests
5. **Descriptive test names**: Use clear, concise descriptions

## File Naming Conventions

- Implementation: `src/feature.ts`
- Tests: `src/feature.test.ts`
- Types: Include in implementation file or `src/types.ts`

## Example: Adding a Router

### 1. Create `src/router.ts`
```typescript
type Route = 'home' | 'about' | 'contact'

interface ParsedRoute {
  view: Route
  id?: string
}

export function parseHash(): ParsedRoute {
  // Implementation
}

export function replaceHash(route: ParsedRoute): void {
  window.history.replaceState(null, '', '#' + serialize(route))
}
```

### 2. Create `src/router.test.ts`
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { parseHash, replaceHash } from './router'

describe('parseHash', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  it('returns default route for empty hash', () => {
    expect(parseHash()).toEqual({ view: 'home' })
  })

  it('parses route with id', () => {
    window.location.hash = '#/about/123'
    expect(parseHash()).toEqual({ view: 'about', id: '123' })
  })
})

describe('replaceHash', () => {
  it('calls history.replaceState', () => {
    const spy = vi.spyOn(window.history, 'replaceState')
    replaceHash({ view: 'home' })
    expect(spy).toHaveBeenCalledWith(null, '', '#/home')
    spy.mockRestore()
  })
})
```

### 3. Integrate into App
```typescript
import { parseHash, replaceHash } from './router'

// In component
useEffect(() => {
  const route = parseHash()
  setView(route.view)
}, [])
```

## Verification Checklist

- [ ] Tests pass: `npx vitest run`
- [ ] Linter passes: `npm run lint`
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Build succeeds: `npm run build`
- [ ] GitHub Actions pass: `gh run list`
