# Coding Standards — Senior Engineer Principles

These standards are loaded during the implementation phase. Every piece of code written during a feature-flow lifecycle must follow these principles. Skills reference this file during the "Study Existing Patterns" step, implementation, and self-review.

## Core Principle

**Code should read like well-written prose.** A senior engineer reading your code for the first time should understand what it does, why it does it, and how it fits into the system — without needing comments to explain the obvious.

## Functions

- **Single responsibility:** Each function does one thing. If you need "and" to describe it, split it.
- **Max 30 lines:** If a function exceeds 30 lines, extract helper functions. Long functions are a sign of mixed responsibilities.
- **Meaningful names:** `fetchUserProfile()` not `getData()`. `calculateExpirationDate()` not `process()`. The name should make the function's purpose obvious.
- **Max 3 parameters:** More than 3 parameters suggests the function is doing too much or needs an options object.
- **Pure when possible:** Prefer functions that take inputs and return outputs over functions that mutate external state.
- **Early returns:** Use guard clauses to eliminate nesting. Return early for error cases.

```typescript
// BAD: deep nesting
function processUser(user) {
  if (user) {
    if (user.isActive) {
      if (user.hasPermission) {
        // actual logic buried 3 levels deep
      }
    }
  }
}

// GOOD: guard clauses
function processUser(user) {
  if (!user) return null
  if (!user.isActive) return null
  if (!user.hasPermission) throw new UnauthorizedError()
  // actual logic at top level
}
```

## Error Handling

- **Never swallow errors:** Empty catch blocks are bugs. Either handle the error, re-throw it, or log it with context.
- **Typed errors:** Use discriminated unions or custom error classes, not generic `Error` messages.
- **Error at the boundary:** Validate inputs at system boundaries (API routes, form handlers, external data). Trust internal code.
- **Fail fast:** If something is wrong, fail immediately with a clear error — don't let invalid state propagate.
- **User-facing errors are separate from system errors:** Users see friendly messages. Logs see stack traces and context.

```typescript
// BAD: swallowed error
try { await saveUser(data) } catch (e) { /* ignore */ }

// BAD: generic error
throw new Error('Something went wrong')

// GOOD: typed, contextual error handling
const { data, error } = await supabase.from('users').insert(userData)
if (error) {
  if (error.code === '23505') {
    return { error: 'A user with this email already exists' }
  }
  throw new DatabaseError('Failed to create user', { cause: error, userData })
}
```

## DRY (Don't Repeat Yourself)

- **Extract at 2 repetitions:** If you write the same logic twice, extract it into a shared function.
- **But don't over-abstract:** Three similar lines are better than a premature abstraction. The wrong abstraction is worse than duplication.
- **Shared utilities go in `lib/` or `utils/`:** Not scattered across components.
- **Constants, not magic values:** `const MAX_RETRY_COUNT = 3` not `3` scattered through code.

## Types (TypeScript)

- **No `any`:** Every `any` is a bug waiting to happen. Use `unknown` if you truly don't know the type, then narrow it.
- **Narrow types:** `status: 'active' | 'inactive'` not `status: string`. Let the type system catch invalid values.
- **Discriminated unions for variants:** Use a `type` or `kind` field to distinguish between different shapes.
- **Generated types for external data:** Database types from `supabase gen types`, API response types from schemas. Never hand-maintain types for external data.
- **Infer when obvious, annotate when not:** Don't annotate `const x: number = 5`. Do annotate function return types and complex objects.

```typescript
// BAD: loose types
interface SearchResult {
  status: string
  price: number | null
  data: any
}

// GOOD: tight types
interface SearchResult {
  status: 'available' | 'taken' | 'error'
  price: number | null
  data: DomainDetails
}
```

## Separation of Concerns

- **Data fetching separate from rendering:** Server components fetch, client components render. Don't mix.
- **Business logic separate from I/O:** Calculation functions shouldn't know about databases or APIs.
- **UI state separate from server state:** Use React Query / SWR for server state, useState for UI state. Don't mix.
- **Configuration separate from code:** API keys, URLs, thresholds go in environment variables or config objects, not inline.

## Structural Quality

- **No god objects:** A file, class, or component should have 2-3 responsibilities at most. If you need "and" more than twice to describe what it does, split it.
- **Dependency direction matters:** High-level modules (pages, orchestrators) depend on low-level modules (utilities, data access), never the reverse. Shared types live in a common layer.
- **No circular dependencies:** If module A imports from B, B must not import from A. Use dependency inversion (shared interface in a third module) to break cycles.
- **Explicit boundaries:** Features should be self-contained directories. Cross-feature imports go through public APIs (barrel exports), not deep file paths.
- **Colocation over centralization:** Put code where it's used. A utility used by one feature lives in that feature's directory, not in a global utils/ folder. Promote to shared only when a second consumer appears.

## Naming Conventions

- **Files:** Match the primary export. `UserProfile.tsx` exports `UserProfile`. `search-utils.ts` exports search utilities.
- **Components:** PascalCase. Descriptive. `SearchResultsTable` not `Table`.
- **Functions:** camelCase. Verb-first. `fetchResults()`, `calculateScore()`, `formatCurrency()`.
- **Constants:** SCREAMING_SNAKE_CASE for true constants. `MAX_RESULTS_PER_PAGE`, `API_BASE_URL`.
- **Boolean variables:** Prefix with `is`, `has`, `should`, `can`. `isLoading` not `loading`. `hasPermission` not `permission`.
- **Event handlers:** Prefix with `handle`. `handleSubmit`, `handleClick`, `handleSearchComplete`.

## Code Organization

- **Imports at the top:** Organized by: external libraries, internal modules, relative imports, types.
- **Related code stays together:** Don't split related logic across distant parts of a file.
- **Export from index:** Use barrel exports (`index.ts`) for directories that export multiple related items.
- **Co-locate tests:** Test files next to the code they test, not in a separate tree.

## Comments

- **Code explains what and how. Comments explain why.**
- **Don't comment obvious code:** `// increment counter` above `counter++` is noise.
- **Do comment non-obvious decisions:** `// Using bulk endpoint (not single) because single-domain has 4s/req due to 429s`
- **TODO with context:** `// TODO(#42): Extract this when we add the second search type` — not just `// TODO: fix this`.

## Performance

- **Parallel when independent:** Use `Promise.all()` for independent async operations, not sequential `await`.
- **Paginate large datasets:** Never load unbounded data. Always use `.range()` or equivalent.
- **Debounce user input:** Search boxes, form validation, resize handlers.
- **Memoize expensive computations:** Use `useMemo` for expensive calculations, `useCallback` for stable function references.
- **Don't optimize prematurely:** Write clear code first. Profile before optimizing. Readable > fast unless you have evidence.

## Testing

- **Test behavior, not implementation:** Test what the function does, not how it does it.
- **One assertion per concept:** Each test should verify one thing. Multiple assertions are OK if they all verify the same concept.
- **Descriptive test names:** `it('returns null when user is not found')` not `it('test1')`.
- **AAA pattern:** Arrange (set up), Act (execute), Assert (verify). Keep them visually separated.
- **Test edge cases:** Empty arrays, null inputs, boundary values, error paths. Not just the happy path.

## Stack-Specific Standards

These are loaded from Context7 and the stack reference files. When implementing, query Context7 for the current recommended patterns for your stack.

### Next.js (App Router)
- Prefer Server Components. Only add `'use client'` when hooks or browser APIs are needed.
- Server Actions for mutations. Route Handlers for external API proxying.
- `revalidatePath()` after mutations. Don't forget cache invalidation.
- Zod validation on every server-side input boundary.

### Supabase
- Always use `@supabase/ssr` for server-side, `@supabase/supabase-js` for client-side.
- Use generated types. Never hand-type database row shapes.
- Every query that could return >1 row: use `.range()` pagination.
- RLS on every table. No exceptions.

### React / React Native
- Custom hooks for reusable stateful logic. Not utility functions with `useState` inside components.
- Props interface exported alongside component.
- Loading/error/empty states for every async operation.
- Avoid prop drilling > 2 levels. Use context or composition instead.

## Tool Usage Patterns

- **Check file size before `Read` on unfamiliar files:** `wc -c <file>`. Files >200KB will exceed the 256KB tool limit.
- **Large files (>200KB):** Use Grep to find relevant sections, or Read with offset/limit targeting specific functions.
- **Code review:** `git diff` contains only the changed sections — prefer it over reading full files for reviewing changes.
- **Never read generated files whole:** Build artifacts, minified bundles, lock files, and generated types can be megabytes. Always use targeted reads.

## How This File Is Used

1. **Study Existing Patterns step:** Claude reads this file AND existing codebase patterns before writing code
2. **Implementation:** These standards guide every line of code written
3. **Self-review:** After implementation, code is reviewed against these standards before formal code review
4. **Anti-pattern hook:** PostToolUse hook checks for violations of these standards

## Agent-Section Mapping

This table maps code review agents to the sections of this file relevant to their specialty. During the code review pipeline (Phase 1), the lifecycle reads this file and extracts only the mapped sections for each agent's prompt.

| Agent | Sections |
|-------|----------|
| `superpowers:code-reviewer` | Functions, Structural Quality, Naming Conventions, Code Organization |
| `pr-review-toolkit:silent-failure-hunter` | Error Handling |
| `feature-dev:code-reviewer` | Error Handling, Separation of Concerns, Performance |
| `pr-review-toolkit:code-simplifier` | DRY (Don't Repeat Yourself), Separation of Concerns, Code Organization |
| `backend-api-security:backend-security-coder` | Error Handling, Types (TypeScript) |
| `pr-review-toolkit:type-design-analyzer` | Types (TypeScript) |
| `pr-review-toolkit:pr-test-analyzer` | Testing |
