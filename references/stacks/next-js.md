# Next.js — Stack-Specific Checks

Additional verification checks when the project uses Next.js (App Router).

## Verification Checks

### Server vs Client Boundaries

- [ ] **`use client` directive:** Components using hooks (useState, useEffect, etc.), browser APIs, or event handlers must have `'use client'` at the top.
- [ ] **Server components can't use hooks:** Server components cannot use React hooks or browser APIs.
- [ ] **Serialization boundary:** Props passed from server to client components must be serializable (no functions, no class instances, no Dates).
- [ ] **Context providers:** Must be client components. Wrap in a client boundary component if used in a server layout.

### Route & File Conventions

- [ ] **Route conflicts:** New routes don't collide with existing routes, catch-all routes, or middleware rewrites.
- [ ] **Route groups:** `(group)` directories don't affect URL path but share layouts. New pages go in the right group.
- [ ] **Parallel routes:** `@slot` directories — verify new routes don't conflict with existing parallel routes.
- [ ] **Loading/error boundaries:** New routes have appropriate `loading.tsx` and `error.tsx` files.
- [ ] **Layout inheritance:** New pages inherit auth checks, sidebar, header, theme from parent layouts.

### Environment Variables

- [ ] **`NEXT_PUBLIC_` prefix:** Variables needed in client code MUST start with `NEXT_PUBLIC_`. Others are server-only.
- [ ] **Build-time vs runtime:** `NEXT_PUBLIC_` vars are inlined at build time — changing them requires a rebuild.
- [ ] **All environments:** New env vars are set in development, preview, and production environments.
- [ ] **`.env.example` updated:** New env vars are documented in `.env.example`.

### API Routes

- [ ] **Route handler vs Server Action:** Use route handlers for external API calls and webhooks. Use Server Actions for form mutations and data modifications.
- [ ] **Response streaming:** Long-running API routes should use streaming responses or background jobs, not synchronous processing.
- [ ] **Body size limits:** Default Vercel limit is 4.5MB for serverless, 2MB for edge. Check if file uploads need larger limits.
- [ ] **CORS headers:** API routes called from external origins need explicit CORS headers.

### Data Fetching

- [ ] **Cache behavior:** `fetch()` in server components is cached by default. Use `{ cache: 'no-store' }` or `revalidate` for dynamic data.
- [ ] **Parallel fetching:** Independent data fetches should use `Promise.all()`, not sequential `await`.
- [ ] **Waterfall prevention:** Nested components that each fetch data create waterfalls. Lift data fetching to parent.

### Middleware

- [ ] **Middleware runs on every request:** Keep middleware light. Heavy logic belongs in API routes or server components.
- [ ] **Edge runtime only:** Middleware runs on Edge Runtime — no Node.js-only APIs (fs, child_process, etc.).
- [ ] **Matcher config:** Middleware matcher must cover new routes that need auth or redirects.

## Common Next.js Gotchas

| Gotcha | Impact | Fix |
|--------|--------|-----|
| Missing `use client` directive | Build error or hydration mismatch | Add directive to components using hooks |
| `NEXT_PUBLIC_` env var changed without rebuild | Old value persists in client bundle | Rebuild and redeploy |
| Passing function as prop to client component | Serialization error | Move function to client component or use Server Actions |
| Middleware too heavy | Slow response times on every request | Move logic to route handlers |
| Fetch cached unexpectedly | Stale data displayed | Add `cache: 'no-store'` or `revalidate` |
| Layout re-renders on navigation | State loss in shared layouts | Move state to client components within the layout |

## Risky Assumptions (for Spike)

| Assumption | How to Test |
|-----------|-------------|
| Server component can access this API/data | Test in a minimal server component |
| Client component can use this library | Check if library works in browser (no Node.js APIs) |
| Middleware handles this auth pattern | Test with actual request in middleware |
| ISR revalidation interval is sufficient | Test with realistic data change frequency |
| File upload works within size limits | Upload a file at the expected maximum size |
