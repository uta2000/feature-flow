# Vercel — Stack-Specific Checks

Additional verification checks when the project deploys to Vercel.

## Verification Checks

### Serverless Function Limits

- [ ] **50MB compressed size:** Serverless functions (API routes, server components) must stay under 50MB compressed including dependencies.
- [ ] **10-second default timeout:** Hobby plan: 10s. Pro plan: 60s. Enterprise: 900s. Long-running operations need background jobs or streaming.
- [ ] **1024MB memory default:** Increase via `maxMemorySize` in `vercel.json` if needed. Max varies by plan.
- [ ] **No persistent filesystem:** Serverless functions can write to `/tmp` but it's ephemeral. Don't rely on file persistence between invocations.
- [ ] **Cold starts:** First invocation after idle takes 250ms-2s. Design for this latency.

### Edge Function Constraints

- [ ] **Limited Node.js APIs:** Edge Functions don't support `fs`, `child_process`, `net`, or other Node.js-only APIs.
- [ ] **4MB size limit:** Edge Functions have a stricter 4MB limit (after compression) than serverless.
- [ ] **No native modules:** Edge Functions can't use native Node.js addons.
- [ ] **Limited environment:** Edge Runtime uses a V8 isolate, not full Node.js. Some npm packages won't work.

### Build & Deploy

- [ ] **Build time limit:** 45 minutes on Pro, 15 minutes on Hobby. Optimize builds that approach the limit.
- [ ] **Output size:** Total deployment output must stay under plan limits.
- [ ] **Environment variables per environment:** Verify env vars are set for Development, Preview, and Production.
- [ ] **Preview deployments:** Every push gets a preview URL. Verify preview builds succeed for the feature branch.

### Cron Jobs

- [ ] **Minimum interval:** Hobby: 1/day. Pro: every minute. Check plan limits before adding cron triggers.
- [ ] **Same timeout as serverless functions:** Cron handlers share the function timeout limit.
- [ ] **`vercel.json` config:** Cron jobs must be declared in `vercel.json`. Verify syntax.

### Domain & Routing

- [ ] **Redirect loops:** New redirects or rewrites in `vercel.json` or `next.config.js` don't create loops.
- [ ] **Header conflicts:** Custom response headers don't conflict with Vercel's default security headers.
- [ ] **Trailing slash behavior:** Consistent trailing slash handling between client routing and server responses.

## Common Vercel Gotchas

| Gotcha | Impact | Fix |
|--------|--------|-----|
| Serverless function timeout | 504 Gateway Timeout for users | Use streaming, background jobs, or increase timeout |
| Large dependency in API route | Function exceeds 50MB limit | Tree-shake imports, use dynamic imports |
| Edge Function using Node.js API | Build error or runtime crash | Check Edge Runtime compatibility |
| Env var missing in production | Feature broken only in production | Verify in Vercel dashboard per environment |
| Cold start on infrequently-used route | Slow first response | Accept latency or use Edge Functions for speed |
| Cron job exceeds timeout | Job killed mid-execution | Break into smaller chunks, use idempotent operations |

## Risky Assumptions (for Spike)

| Assumption | How to Test |
|-----------|-------------|
| API route completes within timeout | Test with production-scale data, measure response time |
| Library works in Edge Runtime | Deploy to Vercel preview, test the edge route |
| Build stays under time limit | Run `vercel build` locally, check duration |
| Cron job frequency is sufficient | Calculate data freshness requirements vs cron interval |
| File upload fits within body limits | Test upload at expected maximum size |
