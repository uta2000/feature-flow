# Project Context Schema

Skills read project context from `.feature-flow.yml` in the project root. This file is optional — when absent, `start` auto-detects the platform and stack from project files and creates it. See `auto-discovery.md` for detection rules.

## Schema

```yaml
# .feature-flow.yml
plugin_version: 1.19.2   # Auto-managed: stamped by plugin on SessionStart/start:
platform: web          # web | ios | android | cross-platform
stack:
  - supabase           # Any technology name — matched against references/stacks/
  - next-js
  - vercel
context7:              # Optional: Context7 library IDs for live documentation lookup
  next-js: /vercel/next.js
  supabase:
    - /websites/supabase
    - /supabase/supabase-js
    - /supabase/ssr
  vercel: /vercel/next.js
gotchas:
  - "PostgREST caps all queries at 1000 rows without .range() pagination"
  - "WhoisFreaks bulk endpoint has separate RPM bucket from single-domain"
types_path: src/types/database.types.ts  # Optional: canonical generated types path
default_branch: staging  # Optional: PR target branch (default: detected via cascade)
```

## Fields

### `plugin_version`

Auto-managed field that tracks which plugin version last stamped this config file. Used for version drift detection — when the running plugin version differs from the stamped version, an upgrade notice is displayed.

**Auto-stamped:** The SessionStart hook and `start` skill automatically write the current plugin version to this field on every session. This field should not be manually edited.

**Version source:** Extracted from the `CLAUDE_PLUGIN_ROOT` environment variable's last path segment (e.g., `/path/to/cache/feature-flow/1.19.2` → `1.19.2`).

**Drift detection:** When the stamped version differs from the running version, the plugin classifies drift by semver component:
- **Major drift** (e.g., 1.x → 2.x): Breaking changes likely — review CHANGELOG carefully
- **Minor drift** (e.g., 1.19.x → 1.20.x): New features available — review CHANGELOG for additions
- **Patch drift** (e.g., 1.19.1 → 1.19.2): Bug fixes — informational only

**Committed to git:** Yes — this enables team-wide drift detection. When one team member updates the plugin and stamps a new version, other team members see the drift notice on their next session.

**Format:** Semver string.

```yaml
plugin_version: 1.19.2
```

**When absent:** First-time upgrade path. No notice is shown; the field is stamped on the next SessionStart or `start:` invocation.

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

### `context7`

Optional mapping of stack entries to [Context7](https://context7.com/) library IDs. When present, skills query Context7 for up-to-date documentation and code examples before designing or implementing features.

**Auto-populated:** During auto-detection (Step 0 of `start`), known stack entries are mapped to their Context7 library IDs using the table in `auto-discovery.md`. The user is shown the mappings and can adjust.

**Manual additions:** Users can add Context7 library IDs for technologies not covered by auto-detection. Use `mcp__plugin_context7_context7__resolve-library-id` to find the correct ID.

**Format:** Each key is a stack name. Values can be a single library ID (string) or a list of library IDs (for stacks that span multiple Context7 libraries):

```yaml
context7:
  next-js: /vercel/next.js              # Single library
  supabase:                              # Multiple libraries
    - /websites/supabase
    - /supabase/supabase-js
    - /supabase/ssr
```

**Requires:** The Context7 MCP plugin must be installed (`context7@claude-plugins-official`). If Context7 is not available, skills skip documentation lookups and proceed normally.

**How skills use this:**
- `start` queries relevant libraries during the documentation lookup step
- `design-verification` checks that the design follows current patterns from official docs
- `design-document` can reference current API patterns during design authoring

### `gotchas`

Free-text list of project-specific pitfalls learned from past bugs. These are injected into every design verification as mandatory checks.

**How gotchas grow (automatic):**
1. `design-verification` finds a FAIL or WARNING that represents a reusable pitfall → offers to add it
2. `spike` discovers a DENIED assumption that future features would likely hit → offers to add it
3. The user approves → gotcha is appended to `.feature-flow.yml`
4. Every future design verification automatically checks for it

**How gotchas grow (manual):**
1. A bug is discovered in production (e.g., PostgREST 1000-row truncation)
2. The root cause is manually added to `gotchas` in `.feature-flow.yml`
3. Same result — every future verification checks for it

**Writing effective gotchas:**
- Be specific: "PostgREST caps queries at 1000 rows" not "watch out for query limits"
- Include the fix pattern: "...without .range() pagination"
- State the consequence: "causes silent data truncation with 200 OK"

### `types_path`

Optional path to the canonical generated types file (e.g., `src/types/database.types.ts`). Used by the Stop hook quality gate to check type freshness and detect duplicate type files in edge function directories.

**When needed:** Only when the heuristic glob fails to find the generated types file. The quality gate checks common locations automatically: `src/types/`, `types/`, `lib/types/`, `lib/`, `app/types/`, `src/lib/`. If the file is in a non-standard location, set `types_path` explicitly.

**Format:** Single file path relative to project root.

```yaml
types_path: src/types/database.types.ts
```

### `default_branch`

Optional PR target branch. When set, overrides the automatic detection cascade used by `start` and `finishing-a-development-branch` to determine where PRs should target.

**Detection cascade (when `default_branch` is absent):**
1. `git config --get init.defaultBranch` (if set and branch exists locally or on remote)
2. Check for common integration branches (local first, then remote):
   a. `develop`: `git rev-parse --verify develop 2>/dev/null || git rev-parse --verify origin/develop 2>/dev/null`
   b. `staging`: `git rev-parse --verify staging 2>/dev/null || git rev-parse --verify origin/staging 2>/dev/null`
   `develop` is checked before `staging` (Git Flow convention). If both exist, `develop` wins — set `default_branch` to override.
3. Fall back to `main` (or `master` if `main` doesn't exist)

**Format:** Single branch name string.

```yaml
default_branch: staging
```

**When needed:** Only when the automatic detection cascade doesn't select the correct branch. Most projects using `main` as their PR target don't need this field.

## How Skills Use This File

### start (reads + writes)
- **Reads** context at lifecycle start. Adjusts step list based on platform and stack.
- **Reads** `plugin_version` field to detect version drift and display upgrade notices.
- **Creates** `.feature-flow.yml` via auto-detection if it doesn't exist (includes `plugin_version`).
- **Updates** stack list if new dependencies are detected that aren't declared.
- **Writes** `plugin_version` to current running version on every lifecycle start.
- **Reads** `context7` field to query relevant documentation before the design phase.
- **Reads** `default_branch` field to determine the PR target branch. If absent, runs the detection cascade.

### design-verification (reads + writes)
- **Reads** base checklist (13 categories), stack-specific checks, platform-specific checks, and project gotchas.
- **Reads** `context7` field to verify design uses current patterns from official docs.
- **Writes** new gotchas discovered during verification (FAIL/WARNING findings that represent reusable pitfalls).

### spike (reads + writes)
- **Reads** stack-specific assumption patterns when evaluating risky unknowns.
- **Writes** new gotchas from DENIED assumptions that future features would likely hit.

### design-document (reads)
Adds platform-aware sections:
- Mobile → Feature Flag Strategy, Rollback Plan, API Versioning sections
- Web → standard sections

### create-issue (reads)
Includes platform-relevant sections in the issue template.

### quality-gate hook (reads)
- **Reads** `stack` field to determine which type generators to check (supabase, prisma)
- **Reads** `types_path` field to find the canonical generated types file

### SessionStart hook (reads + writes)
- **Reads** `plugin_version` to detect drift against the running plugin version.
- **Writes** `plugin_version` to current running version on every session start.
