# Supabase — Stack-Specific Checks

Additional verification checks when the project uses Supabase.

## Verification Checks

### PostgREST Query Limits

- [ ] **1000-row default:** Any query that could return >1,000 rows MUST use `.range()` pagination. PostgREST enforces a server-side `max-rows` setting (default 1000) that caps results regardless of `.limit()`.
- [ ] **`.limit()` does not bypass `max-rows`:** `.limit(10000)` still returns at most 1,000 rows. The only way to get more is `.range()` pagination.
- [ ] **Pagination requires deterministic ordering:** `.range()` without `.order()` can produce duplicate or missing rows across pages.
- [ ] **Join row limits:** PostgREST joins count toward the parent table's row limit, not the joined table's.

**Pattern to check for:**
```
Any .from('table').select('*') without .single(), .maybeSingle(), { head: true }, or .range()
```

### Row Level Security (RLS)

- [ ] **New tables have RLS policies:** Every new table must have RLS enabled with appropriate policies.
- [ ] **RLS policies match feature's auth model:** Policies allow the right users to read/write the right rows.
- [ ] **Service role bypass:** Edge Functions using `service_role` key bypass RLS — verify this is intentional.
- [ ] **RLS on joins:** Joined tables must also have appropriate RLS policies.

### Migration Safety

- [ ] **Supabase migrations are append-only:** Cannot edit or delete past migrations. Plan forward-only.
- [ ] **ALTER TABLE on large tables:** Can lock the table. Check row count before adding constraints or indexes.
- [ ] **NOT NULL without default:** Adding NOT NULL column to a table with existing rows will fail without a default value.
- [ ] **Enum types:** Supabase uses PostgreSQL enums — adding values is easy, removing or renaming is hard.
- [ ] **Column drops during deploy window:** Old code may still reference dropped columns during the deployment window.

### Edge Functions

- [ ] **400-second timeout:** Long-running operations must complete within 400s or use background processing.
- [ ] **Cold starts:** First invocation after idle period takes 1-5 seconds. Design for this latency.
- [ ] **No persistent state:** Edge Functions are stateless. Don't store in-memory caches between invocations.
- [ ] **Shared dependencies:** Functions sharing `_shared/` code must all be redeployed when shared code changes.
- [ ] **Request body limits:** Default body size limit is 2MB for Edge Functions.

### Supabase Client Usage

- [ ] **Server vs client:** Use `@supabase/ssr` for server-side (App Router server components, API routes). Use `@supabase/supabase-js` only for client-side.
- [ ] **Auth token handling:** Server-side must pass cookies/headers for auth context. Edge Functions use the service role key.
- [ ] **Realtime subscriptions:** Client-side only. Cannot subscribe to changes from server components.

### Supabase Auth

- [ ] **Session refresh:** Auth tokens expire. Client must handle refresh. Server components must read from cookies.
- [ ] **OAuth callback URLs:** Must be registered in Supabase dashboard. Easy to miss for new environments.
- [ ] **Protected routes:** Middleware or layout-level auth checks must cover new pages.

## Common Supabase Gotchas

| Gotcha | Impact | Fix |
|--------|--------|-----|
| PostgREST 1000-row limit | Silent data truncation, 200 OK | `.range()` pagination |
| RLS not enabled on new table | All data publicly readable | Enable RLS + add policies |
| `.limit()` doesn't bypass `max-rows` | Still returns 1000 rows | Use `.range()` instead |
| Edge Function cold starts | 1-5s latency on first call | Warm with keep-alive or accept latency |
| Dropping column while old code runs | 500 errors during deploy window | Deploy code first, then migrate |
| `service_role` key in client code | Full database access exposed | Keep service role server-side only |

## Risky Assumptions (for Spike)

| Assumption | How to Test |
|-----------|-------------|
| Query returns all rows | Insert >1000 rows, query without `.range()`, check count |
| RLS policy allows intended access | Test with actual user token, not service role |
| Edge Function completes in time | Test with production-scale data volume |
| Migration runs without lock | Check table row count, estimate ALTER TABLE duration |
| Realtime subscription works for this use case | Test with actual data changes, check latency |
