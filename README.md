# spec-driven

A Claude Code plugin that enforces discipline across the feature development lifecycle — from design through implementation to verification. Context-aware: adapts to your platform (web, iOS, Android) and tech stack (Supabase, Next.js, React Native, etc.).

## The Problem

Features get brainstormed, then jump straight to code. Halfway through, you discover schema constraints that don't match, types that need changing, pipeline assumptions that break. A 2-hour feature becomes a 6-hour debugging session.

## The Solution

Seven skills and an orchestrator that cover the full feature development lifecycle. Catch conflicts when they're cheap to fix — a line edit in a design doc instead of a code rewrite.

## Project Context

Add a `.spec-driven.yml` file to your project root to enable platform and stack-specific behavior:

```yaml
# .spec-driven.yml
platform: web          # web | ios | android | cross-platform
stack:
  - supabase
  - next-js
  - vercel
gotchas:
  - "PostgREST caps all queries at 1000 rows without .range() pagination"
```

**How it works:**
- `platform` adjusts the lifecycle — mobile adds beta testing, app store review, required feature flags
- `stack` loads stack-specific verification checks during design verification
- `gotchas` are injected into every verification — project-specific pitfalls learned from past bugs

**Without `.spec-driven.yml`:** Skills use their standard behavior. No platform or stack adjustments.

### Pre-Built Stack References

| Stack | Checks |
|-------|--------|
| `supabase` | PostgREST 1000-row limit, RLS policies, migration safety, Edge Function limits |
| `next-js` | Server/client boundaries, route conflicts, env variable exposure, middleware |
| `react-native` | Native bridge compat, Hermes engine, platform-specific code, app store compliance |
| `vercel` | Serverless limits, Edge Function constraints, build time, cold starts |

**Unknown stacks:** If no pre-built reference exists, skills research gotchas dynamically via web search and the project's own documentation.

### Platform Lifecycle Differences

| Step | Web | Mobile |
|------|-----|--------|
| Feature flags | Recommended | Required |
| API contract testing | Good practice | Required |
| Migration dry-run | Recommended | Required |
| Beta testing | Preview deploy | TestFlight / Play Console (added step) |
| App store review | N/A | Required gate (added step) |
| Rollback | Revert deploy | Feature flag kill switch + multi-version compat |
| Device testing | Browser testing | OS + device + screen matrix |

## Skills

### Lifecycle Orchestrator

| Skill | Purpose |
|-------|---------|
| `start-feature` | Orchestrates the full lifecycle from idea to PR — classifies scope, loads project context, builds the platform-aware step list, and invokes the right skill at each stage |

### Pre-Implementation (Design Phase)

| Skill | Step | Purpose |
|-------|------|---------|
| `spike` | 3 | De-risk technical unknowns with time-boxed experiments before committing to a design |
| `design-document` | 4 | Turn brainstorming decisions into structured, implementable design docs |
| `design-verification` | 5 | Verify a design against the actual codebase — schema, types, pipelines, routes, dependencies, plus stack and platform-specific checks |
| `create-issue` | 6 | Create well-structured GitHub issues from verified designs |

### Post-Implementation (Verification Phase)

| Skill | Step | Purpose |
|-------|------|---------|
| `verify-plan-criteria` | 8 | Validate every task has machine-verifiable acceptance criteria, auto-draft missing ones |
| `verify-acceptance-criteria` | 12 | Mechanically check each criterion against the codebase before claiming work is done |

### Agent

| Component | Purpose |
|-----------|---------|
| `task-verifier` | Runs PASS/FAIL/CANNOT_VERIFY checks with evidence |

## Where These Fit in the Lifecycle

```
 1. Idea
 2. Brainstorming
 3. Spike / PoC                  ← spike
 4. Design Document              ← design-document
 5. Design Verification          ← design-verification (+ stack/platform checks)
 6. GitHub Issue                  ← create-issue
 7. Implementation Plan
 8. Plan Criteria Check           ← verify-plan-criteria
 9. Worktree Setup
10. Implementation (TDD)
10b. Device Matrix Testing        ← mobile only
11. Code Review
12. Final Verification            ← verify-acceptance-criteria + verification-before-completion
12b. Beta Testing                 ← mobile only (TestFlight / Play Console)
13. PR / Merge
13b. App Store Review             ← mobile only
14. Deploy
```

## Hooks

| Hook | Trigger | Action |
|------|---------|--------|
| SessionStart | Every session | Injects spec-driven conventions into context |
| PostToolUse (Write) | Plan file written to `plans/*.md` | Reminds to run `verify-plan-criteria` |
| Stop | Session ending | Blocks if code was implemented without running `verify-acceptance-criteria` |

## Installation

### As a Claude Code plugin

Add this repo as a marketplace source in Claude Code, then install the `spec-driven` plugin.

### Per-project (manual)

Copy the `agents/`, `skills/`, `hooks/`, and `references/` directories into your project's `.claude/` directory.

## Example: Design Verification in Action

A design for a "Creative Domain Generator" was verified against the codebase before any code was written. The verification caught 5 issues:

| Finding | What would have happened |
|---------|------------------------|
| `keyword_phrase` is NOT NULL | Runtime crash when inserting creative results without a keyword |
| `service_id` / `location_id` are required FKs | Insert fails for freeform creative searches |
| `format` CHECK constraint | DB rejects rows without `location_service` or `service_location` |
| Pipeline hook assumes mechanical generation | Hook crashes when called without service/location IDs |
| Results page assumes non-null relations | UI crash rendering creative search results |

Each would have been 30-60 minutes of debugging mid-implementation. Total time saved: 3-4 hours.

## Example: Project Gotchas Preventing Repeat Bugs

After discovering Supabase's PostgREST 1000-row silent truncation bug (21+ queries affected, zero error signals), the team added it to `.spec-driven.yml`:

```yaml
gotchas:
  - "PostgREST caps all queries at 1000 rows without .range() pagination — causes silent data truncation with 200 OK"
```

Every future design verification now automatically checks: "Does any new query expect >1,000 rows without pagination?" The bug that took hours to diagnose becomes a checklist item that takes seconds to verify.

## Acceptance Criteria Format

```markdown
### Task N: [Title]

**Acceptance Criteria:**
- [ ] File exists at `src/components/Badge.tsx`
- [ ] Component exports `Badge` as named export
- [ ] `npm run typecheck` passes with no new errors
- [ ] `npm run lint` passes with no new warnings
- [ ] [MANUAL] Badge renders red when condition is met

**Files:**
...
```

Criteria prefixed with `[MANUAL]` are flagged for human review rather than failing verification.

## Verification Report

```
| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | File exists at src/... | PASS | Found at expected path, 38 lines |
| 2 | typecheck passes | PASS | 0 errors |
| 3 | Badge renders red | CANNOT_VERIFY | Requires visual/runtime test |

Verdict: VERIFIED (2/3 pass, 1 requires manual verification)
```

## Contributing Stack References

To add support for a new tech stack:

1. Create `references/stacks/{stack-name}.md`
2. Include sections: Verification Checks, Common Gotchas, Risky Assumptions (for Spike)
3. Follow the format of existing stack files (e.g., `references/stacks/supabase.md`)
4. Submit a PR

## License

MIT
