# spec-driven

A Claude Code plugin that enforces discipline across the feature development lifecycle — from design through implementation to verification. Context-aware: adapts to your platform (web, iOS, Android) and tech stack, and queries up-to-date documentation via [Context7](https://context7.com/) to ensure code follows current best practices.

## The Problem

Features get brainstormed, then jump straight to code. Halfway through, you discover schema constraints that don't match, types that need changing, pipeline assumptions that break. A 2-hour feature becomes a 6-hour debugging session.

## The Solution

Six skills and an orchestrator that cover the full feature development lifecycle. Catch conflicts when they're cheap to fix — a line edit in a design doc instead of a code rewrite.

spec-driven handles the **design, verification, and code review** phases. For **implementation and delivery**, it delegates to the [superpowers](https://github.com/obra/superpowers) plugin — brainstorming, TDD, worktrees, and PRs. For **documentation lookups**, it uses [Context7](https://context7.com/) to query current patterns from official docs before writing code. Code review uses a **multi-agent pipeline** that dispatches up to 7 specialized review agents, auto-fixes findings, and re-verifies until clean.

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI
- [superpowers](https://github.com/obra/superpowers) plugin (required — handles brainstorming, implementation planning, TDD, worktrees, and PR workflow)
- [Context7](https://marketplace.claude.ai/plugin/context7) MCP plugin (required — provides live documentation lookups for any tech stack during design and implementation)

**Recommended** (for full code review coverage):
- [pr-review-toolkit](https://github.com/anthropics/claude-code-pr-review-toolkit) plugin (adds: code-simplifier, silent-failure-hunter, test-analyzer, type-design-analyzer)
- [feature-dev](https://github.com/anthropics/claude-code-feature-dev) plugin (adds: feature-dev:code-reviewer)
- [backend-api-security](https://github.com/anthropics/claude-code-backend-api-security) plugin (adds: backend-security-coder)

## Installation

### From the marketplace

```bash
# Install required plugins first
claude plugins add superpowers
claude plugins add context7

# Install spec-driven
claude plugins add spec-driven

# Recommended plugins (for full code review coverage)
claude plugins add pr-review-toolkit
claude plugins add feature-dev
claude plugins add backend-api-security
```

### From GitHub

```bash
# Install required plugins first
claude plugins add https://github.com/obra/superpowers
claude plugins add context7

# Install spec-driven
claude plugins add https://github.com/uta2000/spec-driven

# Recommended plugins (for full code review coverage)
claude plugins add pr-review-toolkit
claude plugins add feature-dev
claude plugins add backend-api-security
```

### Per-project (manual)

Copy the `agents/`, `skills/`, `hooks/`, and `references/` directories into your project's `.claude/` directory. You still need the superpowers and context7 plugins installed separately.

## Quick Start

After installing, open any project and tell Claude:

```
start feature: add user notifications
```

spec-driven will:
1. Scan your project files and auto-detect your platform and tech stack
2. Resolve Context7 documentation libraries for each detected technology
3. Create a `.spec-driven.yml` with your project context (first time only)
4. Classify the scope (quick fix → major feature)
5. Walk you through the right steps — brainstorm, look up docs, design, verify, implement, ship

The lifecycle adds ~20-30 minutes of upfront design but typically saves 2-4 hours of mid-implementation debugging per feature.

For a quick fix, just say what's broken — the lifecycle is 4 steps: understand, fix (TDD), verify, PR.

## How It Works with Superpowers and Context7

spec-driven owns the design and verification phases. superpowers owns implementation and delivery. Context7 provides live documentation lookups. The `start-feature` orchestrator coordinates all three:

| Lifecycle Step | Plugin | Skill / Tool |
|---------------|--------|-------------|
| Brainstorm | superpowers | `brainstorming` |
| Spike / PoC | **spec-driven** | `spike` (queries Context7 docs before experiments) |
| Documentation lookup | **Context7** | `resolve-library-id` + `query-docs` |
| Design document | **spec-driven** | `design-document` |
| Design verification | **spec-driven** + **Context7** | `design-verification` (includes doc compliance check) |
| Create issue | **spec-driven** | `create-issue` |
| Implementation plan | superpowers | `writing-plans` |
| Verify plan criteria | **spec-driven** | `verify-plan-criteria` |
| Worktree setup | superpowers | `using-git-worktrees` |
| Study existing patterns | **spec-driven** (inline) | Reads codebase conventions, generates "How to Code This" notes |
| Implement (TDD) | superpowers | `test-driven-development` |
| Self-review | **spec-driven** (inline) | Reviews code against `coding-standards.md` checklist |
| Code review | **spec-driven** (inline) | Multi-agent review pipeline (7 agents, auto-fix, re-verify loop) |
| Generate CHANGELOG entry | **spec-driven** (inline) | Parses branch commits, generates Keep a Changelog entry |
| Final verification | **spec-driven** + superpowers | `verify-acceptance-criteria` + `verification-before-completion` |
| Commit and PR | superpowers | `finishing-a-development-branch` |

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

## Using Skills Standalone

While `start-feature` is the recommended entry point, you can invoke any skill directly:

```
run design-verification on docs/plans/2024-03-15-notifications-design.md
```

```
run verify-acceptance-criteria against the plan in docs/plans/
```

Skills that need project context (`design-verification`, `spike`) will auto-create `.spec-driven.yml` if it doesn't exist (same auto-discovery flow as `start-feature`). Other skills like `verify-plan-criteria` and `verify-acceptance-criteria` work without it.

## Where These Fit in the Lifecycle

```
 1. Idea
 2. Brainstorming                  ← superpowers:brainstorming
 3. Spike / PoC                    ← spike (queries Context7 docs first)
 4. Documentation Lookup           ← Context7 (resolve-library-id + query-docs)
 5. Design Document                ← design-document
 6. Design Verification            ← design-verification (+ stack/platform/doc compliance checks)
 7. GitHub Issue                   ← create-issue
 8. Implementation Plan            ← superpowers:writing-plans
 9. Plan Criteria Check            ← verify-plan-criteria
10. Worktree Setup                 ← superpowers:using-git-worktrees
11. Study Existing Patterns        ← inline (reads codebase, generates "How to Code This" notes)
12. Implementation (TDD)           ← superpowers:test-driven-development
12b. Device Matrix Testing         ← mobile only
13. Self-Review                    ← inline (coding-standards.md checklist)
14. Code Review                    ← inline (multi-agent pipeline: find → fix → re-verify)
15. Generate CHANGELOG Entry       ← inline (conventional commits → Keep a Changelog)
16. Final Verification             ← verify-acceptance-criteria + superpowers:verification-before-completion
16b. Beta Testing                  ← mobile only (TestFlight / Play Console)
17. PR / Merge                     ← superpowers:finishing-a-development-branch
17b. App Store Review              ← mobile only
18. Deploy
```

## Hooks

| Hook | Trigger | Action |
|------|---------|--------|
| PreToolUse (Write) | New source file being created | Reminds to check Context7 docs; **BLOCKS** if code contains `any` types, `as any`, or empty catch blocks |
| PreToolUse (Edit) | Source file being edited | **BLOCKS** if new code contains `any` types, `as any`, or empty catch blocks |
| PostToolUse (Write) | Plan file written to `plans/*.md` | Reminds to run `verify-plan-criteria` |
| PostToolUse (Write/Edit) | Source file written or edited | Warns about `console.log`/`console.debug` (non-blocking — useful during TDD, cleaned up in self-review) |
| SessionStart | Every session | Injects spec-driven conventions into context |
| Stop | Session ending | Blocks if code was implemented without running `verify-acceptance-criteria` |

## Project Context

spec-driven uses a `.spec-driven.yml` file in your project root for platform and stack-specific behavior. **You don't need to create this manually** — `start-feature` auto-detects your platform and stack from project files (package.json, Gemfile, go.mod, config files, directory structure, etc.) and creates it for you on first run.

```yaml
# .spec-driven.yml (auto-generated, then curated)
platform: web          # web | ios | android | cross-platform
stack:
  - supabase
  - next-js
  - vercel
context7:              # Context7 library IDs for live doc lookups
  next-js: /vercel/next.js
  supabase:
    - /websites/supabase
    - /supabase/supabase-js
    - /supabase/ssr
  vercel: /vercel/next.js
gotchas:
  - "PostgREST caps all queries at 1000 rows without .range() pagination"
```

**Should you commit this file?** Yes — `.spec-driven.yml` should be committed to your repo. It captures project-specific knowledge (especially gotchas) that benefits the whole team. It's not sensitive data and evolves with the project.

**How it works:**
- `platform` adjusts the lifecycle — mobile adds beta testing, app store review, required feature flags
- `stack` loads stack-specific verification checks during design verification
- `context7` maps each stack to Context7 library IDs — skills query these for current patterns before designing and implementing
- `gotchas` are injected into every verification — project-specific pitfalls learned from past bugs

**Auto-discovery:** On first run, `start-feature` scans your project files, detects the stack, and resolves Context7 library IDs for each detected technology. It presents the full context for confirmation. On subsequent runs, it cross-checks for new dependencies and suggests additions.

**Context7 resolution:** For every detected stack entry, spec-driven calls Context7's `resolve-library-id` to find the best documentation library. Well-known stacks (Next.js, Supabase, Vercel) use pre-verified mappings. All other stacks are resolved dynamically — this means spec-driven works with **any technology** Context7 has documentation for (Django, Rails, FastAPI, Vue, Angular, Stripe, Prisma, etc.).

**Gotcha write-back:** When `design-verification` finds a reusable pitfall or `spike` discovers a denied assumption that could affect future features, the skill offers to add it to your gotchas list automatically. The file gets smarter over time without manual curation.

### Pre-Built Stack References

| Stack | Checks |
|-------|--------|
| `supabase` | PostgREST 1000-row limit, RLS policies, migration safety, Edge Function limits |
| `next-js` | Server/client boundaries, route conflicts, env variable exposure, middleware |
| `react-native` | Native bridge compat, Hermes engine, platform-specific code, app store compliance |
| `vercel` | Serverless limits, Edge Function constraints, build time, cold starts |

**Unknown stacks:** If no pre-built reference exists, skills research gotchas dynamically via web search and the project's own documentation.

### Coding Standards and Code Quality

spec-driven enforces senior-engineer code quality through three layers:

1. **Study Existing Patterns** (before implementation) — Reads 2-3 existing files per area being modified, extracts conventions, and generates per-task "How to Code This" notes that map implementation tasks to specific codebase patterns
2. **Self-Review** (after implementation) — Reviews all changed code against a 10-point checklist: function size (≤30 lines), naming conventions, error handling, type safety (no `any`), DRY, pattern adherence, separation of concerns, guard clauses (≤3 nesting levels), debug artifacts, import organization
3. **Anti-pattern hooks** (real-time) — PreToolUse hooks on Write and Edit that **block** `any` types, `as any` assertions, and empty catch blocks from being written. `console.log/debug` is warned but not blocked (useful during TDD, cleaned up in self-review)

All three reference `references/coding-standards.md` — a comprehensive guide covering functions, error handling, DRY, TypeScript types, separation of concerns, naming, comments, performance, and testing. Stack-specific standards (Next.js, Supabase, React) are included.

### Context7 Documentation Integration

Context7 provides live documentation lookups for any technology, ensuring code follows current best practices even when frameworks release breaking changes or deprecate APIs.

**How it works:**

1. During auto-detection, spec-driven resolves Context7 library IDs for each stack entry
2. Before writing the design document, the "Documentation lookup" step queries relevant libraries for current patterns
3. During design verification, the "Documentation Compliance" check (category #17) verifies the design uses current patterns
4. A PreToolUse hook reminds about doc lookups before creating new source files

**Works with any stack:** Context7 hosts docs for thousands of libraries. Even if spec-driven doesn't have a pre-built stack reference file (e.g., for Django or Stripe), it can still resolve and query Context7 documentation dynamically.

**Example — what doc lookups catch:**
- Supabase deprecated `auth-helpers` in favor of `@supabase/ssr` — Context7 docs show the new `createServerClient` pattern
- Next.js Server Actions should return `{ errors }` objects, not throw — Context7 docs show the `useActionState` pattern
- A library changed its API between versions — Context7 has the current version's patterns

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
2. Include sections: Context7 Documentation, Verification Checks, Common Gotchas, Risky Assumptions (for Spike)
3. For the Context7 section, use `resolve-library-id` to find the best library IDs, and list key patterns to look up
4. Follow the format of existing stack files (e.g., `references/stacks/supabase.md`)
5. If the stack has well-known Context7 library IDs, add them to the Known Mappings table in `references/auto-discovery.md`
6. Submit a PR

## License

MIT
