# Project Context Schema

Skills read project context from `.spec-driven.yml` in the project root. This file is optional — when absent, skills use their base behavior without platform or stack adjustments.

## Schema

```yaml
# .spec-driven.yml
platform: web          # web | ios | android | cross-platform
stack:
  - supabase           # Any technology name — matched against references/stacks/
  - next-js
  - vercel
gotchas:
  - "PostgREST caps all queries at 1000 rows without .range() pagination"
  - "WhoisFreaks bulk endpoint has separate RPM bucket from single-domain"
```

## Fields

### `platform`

Determines lifecycle adjustments and which steps are required vs optional.

| Value | Effect |
|-------|--------|
| `web` | Standard lifecycle. Feature flags recommended. Simple rollback. |
| `ios` | Adds beta testing, App Store review steps. Feature flags required. API versioning required. |
| `android` | Adds beta testing, Play Store review steps. Feature flags required. API versioning required. |
| `cross-platform` | Combines iOS + Android requirements. Device matrix testing across both platforms. |

See `references/platforms/mobile.md` and `references/platforms/web.md` for full details.

### `stack`

List of technologies used in the project. Each entry is matched against `references/stacks/{name}.md` for stack-specific verification checks.

If no matching reference file exists, the skill should:
1. Read the project's `CLAUDE.md` and `package.json` for tech-specific context
2. Use `WebSearch` to research known gotchas for the declared technology
3. Note to the user that no pre-built checklist exists and findings are best-effort

Common stack values with pre-built reference files:
- `supabase` — PostgREST limits, RLS, migration safety, Edge Functions
- `next-js` — App Router, server/client boundaries, environment variables
- `react-native` — Native bridges, platform-specific code, Hermes engine
- `vercel` — Serverless limits, Edge constraints, cold starts

### `gotchas`

Free-text list of project-specific pitfalls learned from past bugs. These are injected into every design verification as mandatory checks.

**How gotchas grow:**
1. A bug is discovered in production (e.g., PostgREST 1000-row truncation)
2. The root cause is added to `gotchas` in `.spec-driven.yml`
3. Every future design verification automatically checks for it
4. The knowledge is in the repo, not in someone's head

**Writing effective gotchas:**
- Be specific: "PostgREST caps queries at 1000 rows" not "watch out for query limits"
- Include the fix pattern: "...without .range() pagination"
- State the consequence: "causes silent data truncation with 200 OK"

## How Skills Use This File

### start-feature
Reads context once at lifecycle start. Adjusts step list:
- Mobile → adds beta testing, app store review, promotes feature flags to required
- Specific stacks → adjusts verification depth

### design-verification
Loads base checklist (13 categories), then appends:
- Stack-specific checks from `references/stacks/{name}.md`
- Platform-specific checks from `references/platforms/{platform}.md`
- All project gotchas as additional mandatory checks

### design-document
Adds platform-aware sections:
- Mobile → Feature Flag Strategy, Rollback Plan, API Versioning sections
- Web → standard sections

### spike
Loads stack-specific assumption patterns when evaluating risky unknowns.

### create-issue
Includes platform-relevant sections in the issue template.
