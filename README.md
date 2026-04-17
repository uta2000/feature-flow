# feature-flow

A Claude Code plugin that enforces a full feature development lifecycle — from idea to merged PR — so you don't discover schema mismatches, deprecated APIs, or broken assumptions halfway through coding. You say "start: add user notifications" and it auto-detects your tech stack, queries live documentation for current patterns, walks you through brainstorming and design, then verifies that design against your actual codebase (columns, types, routes, constraints) before a single line of implementation is written. After implementation (done via TDD in an isolated git worktree), it runs a multi-agent code review pipeline with up to 7 specialized reviewers, auto-fixes findings, generates a CHANGELOG entry, and mechanically verifies every acceptance criterion before opening a PR.

The upfront design adds ~20-30 minutes but typically saves 2-4 hours of mid-implementation debugging per feature. It works with any tech stack — Next.js, Supabase, Django, Rails, Flutter, whatever — and gets smarter over time by writing discovered gotchas (like "PostgREST silently caps queries at 1000 rows") back into your project config so every future feature is checked against past lessons.

## What's New in 1.36.0 (2026-04-17)

Five features bundled into this release — all addressing gaps in design review and mid-lifecycle judgment that the existing gate chain missed. See [CHANGELOG.md](CHANGELOG.md#1360---2026-04-17) for the detailed entries.

| PR | Issue | What it adds |
|----|-------|--------------|
| [#243](https://github.com/uta2000/feature-flow/pull/243) | [#238](https://github.com/uta2000/feature-flow/issues/238) | **Scope-critique pass** — new Step 4.5 in `design-verification` asks five strategic-shape questions (scope, dependencies, simpler alternatives, observability, config surface) before a design reaches `create-issue`. Catches oversized scope, phantom dependencies, and unobservable capability bets. |
| [#242](https://github.com/uta2000/feature-flow/pull/242) | [#236](https://github.com/uta2000/feature-flow/issues/236) | **Advisor tool integration** — four soft advisor-call hints at judgment-heavy moments, plus a one-line SessionStart onboarding nudge for Sonnet users missing the beta header. Opt-in; see [`docs/advisor.md`](docs/advisor.md). |
| [#241](https://github.com/uta2000/feature-flow/pull/241) | [#239](https://github.com/uta2000/feature-flow/issues/239) | **Senior developer panel (Phase 1c)** — Major-feature code review gains a judgment-review phase with three personas (Staff Engineer, SRE, Product Engineer). Surfaces wrong abstractions, operability risk, and scope creep. Findings are report-only — you decide whether to address, defer, or reject. |
| [#240](https://github.com/uta2000/feature-flow/pull/240) | [#235](https://github.com/uta2000/feature-flow/issues/235) | **Codex consultation (Phase 1+2, opt-in)** — new `consult-codex` skill for second-opinion AI reviews via the existing `codex` MCP server. Ships `review-design` proactive mode wired into `design-document`; later modes (`review-plan`, `review-code`, `stuck`) deferred. Disabled by default; enable via `codex.enabled: true`. |
| [#237](https://github.com/uta2000/feature-flow/pull/237) | [#234](https://github.com/uta2000/feature-flow/issues/234) | **Quick-path triage** — `start:` now routes trivial changes (prose edits, non-log string literals, comments) to a bare implement-and-commit flow, skipping brainstorm / design / verify / plan / handoff. Gated by five code-aware confirmation gates (clean tree, concrete target, file/line budgets, exported-declaration overlap, lexical-region rule). |

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI
- [GitHub CLI](https://cli.github.com/) (`gh` on PATH, authenticated via `gh auth login`) — used for issue creation, PR checks, review bot handling, and issue commenting/closing
- [superpowers](https://github.com/obra/superpowers) plugin (required — handles brainstorming, implementation planning, TDD, worktrees, and PR workflow)
- [Context7](https://marketplace.claude.ai/plugin/context7) MCP plugin (required — provides live documentation lookups for any tech stack during design and implementation)

**Recommended** (for full code review coverage):
- [pr-review-toolkit](https://marketplace.claude.ai/plugin/pr-review-toolkit) plugin (adds: code-simplifier, silent-failure-hunter, test-analyzer, type-design-analyzer)
- [feature-dev](https://marketplace.claude.ai/plugin/feature-dev) plugin (adds: feature-dev:code-reviewer)
- [backend-api-security](https://marketplace.claude.ai/plugin/backend-api-security) plugin (adds: backend-security-coder)

## Installation

### From the marketplace

```bash
# Install required plugins first
claude plugins add superpowers
claude plugins add context7

# Install feature-flow
claude plugins add feature-flow

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

# Install feature-flow
claude plugins add https://github.com/uta2000/feature-flow

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
start: add user notifications
```

feature-flow will:
1. Scan your project files and auto-detect your platform and tech stack
2. Resolve Context7 documentation libraries for each detected technology
3. Create a `.feature-flow.yml` with your project context (first time only)
4. Classify the scope (quick fix → major feature)
5. Walk you through the right steps — brainstorm, look up docs, design, verify, implement, ship

The lifecycle adds ~20-30 minutes of upfront design but typically saves 2-4 hours of mid-implementation debugging per feature.

For a quick fix, just say what's broken — the lifecycle is streamlined: understand, fix (TDD), verify, PR.

Add `--yolo` to auto-select recommended options and skip confirmation prompts:

```
start: add user notifications --yolo
```

### YOLO Mode

For experienced users who trust the lifecycle's recommended defaults:

```
start: add user notifications --yolo
```

YOLO mode auto-selects recommended options at every decision point (scope classification, brainstorming questions, issue confirmation, etc.) and logs each decision inline:

```
YOLO: Platform/stack → Accepted: web, [next-js, supabase]
YOLO: Scope → Feature
YOLO: brainstorming — Export trigger → Option A: button in toolbar
```

At completion, a full decision log table is printed so you can review what was decided.

**What YOLO does NOT bypass:** Quality gates (tsc, lint, tests), anti-pattern hooks, acceptance criteria verification, code review pipeline, and Context7 documentation lookups all run identically. YOLO only skips confirmation prompts — it doesn't skip work.

**Activation:** Include `--yolo`, `yolo mode`, or `run unattended` in your start command, or select "YOLO" when asked at startup.

### YOLO Stops

For users who want YOLO's auto-selection but want to review output at specific phases, configure `yolo.stop_after` in `.feature-flow.yml`:

```yaml
yolo:
  stop_after:
    - design        # Pause after design document
    - plan          # Pause after implementation plan
```

Available stop points: `brainstorming`, `design`, `verification`, `plan`, `implementation`, `pr`, `ship`. At each checkpoint, you can continue YOLO or switch to Interactive for the remaining phases. Express mode does not honor `stop_after` — it has its own design approval checkpoint.

Use `/settings` to configure stop points interactively with a multi-select UI.

## Optional Enhancements

### Advisor Tool (beta)

The Claude advisor tool provides automatic per-turn second-opinion checks. When enabled, feature-flow surfaces advisor hints at judgment-heavy moments (design verification, AC evaluation, codex consultation). Requires an Anthropic beta header — see [`docs/advisor.md`](docs/advisor.md) for setup, or run `feature-flow:settings advisor` for a guided walkthrough.

### Codex Consultation (opt-in)

The `consult-codex` skill makes lifecycle-checkpoint calls to the `codex` MCP server for a second-opinion AI review — today at design-document creation (`review-design` mode), with `review-plan`, `review-code`, and `stuck` modes on the roadmap. Disabled by default; set `codex.enabled: true` in `.feature-flow.yml` and configure the `codex` MCP server to opt in. Every consultation forces a recorded verdict, and the PR `feature-flow-metadata` block surfaces `<not recorded>` audit defects if Claude skips recording. See `docs/plans/2026-04-14-codex-consultation.md` for the full design.

### Quick-path triage

For bounded trivial changes (prose edits, non-log string literals, comments) `start:` auto-detects and skips brainstorm / design / verify / plan / handoff — going straight to implement-and-commit. Five ordered gates (clean tree, concrete target, file/line budgets, exported-declaration overlap, lexical-region rule) confirm scope via a read-only inspection pass; any gate failure silently falls through to the standard lifecycle. Enabled by default; use `--no-quick` for one invocation to disable, or set `tool_selector.quick_path.enabled: false` in `.feature-flow.yml` to disable globally.

## How It Works with Superpowers and Context7

feature-flow owns the design and verification phases. superpowers owns implementation and delivery. Context7 provides live documentation lookups. The `start` orchestrator coordinates all three:

| Lifecycle Step | Plugin | Skill / Tool |
|---------------|--------|-------------|
| Brainstorm | superpowers | `brainstorming` (includes design preferences preamble for Feature/Major) |
| Spike / PoC | **feature-flow** | `spike` (queries Context7 docs before experiments) |
| Documentation lookup | **Context7** | `resolve-library-id` + `query-docs` |
| Design document | **feature-flow** | `design-document` |
| Design verification | **feature-flow** + **Context7** | `design-verification` (includes doc compliance + design preferences compliance) |
| Create issue | **feature-flow** | `create-issue` |
| Implementation plan | superpowers | `writing-plans` (supports XML plan format + split plans for large features) |
| Verify plan criteria | **feature-flow** | `verify-plan-criteria` (validates dependency graphs) |
| Commit planning artifacts | **feature-flow** (inline) | Commits design docs and config to base branch |
| Worktree setup | superpowers | `using-git-worktrees` (+ `FEATURE_CONTEXT.md` + phase context dirs) |
| Copy env files | **feature-flow** (inline) | Copies `.env*` files into worktree |
| Study existing patterns | **feature-flow** (inline) | Reads codebase conventions, generates "How to Code This" notes |
| Implement (TDD) | superpowers | `subagent-driven-development` (wave-based parallel task execution) |
| Self-review | **feature-flow** (inline) | Reviews code against `coding-standards.md` checklist |
| Code review | **feature-flow** (inline) | 5-phase pipeline: pre-pass → report-only → consolidate → fix → re-verify |
| Generate CHANGELOG entry | **feature-flow** (inline) | Parses branch commits, generates Keep a Changelog entry |
| Final verification | **feature-flow** + superpowers | `verify-acceptance-criteria` + `verification-before-completion` |
| Sync with base branch | **feature-flow** (inline) | Merge or rebase (configurable via `git_strategy`) |
| Commit and PR | superpowers | `finishing-a-development-branch` |
| Wait for CI & reviews | **feature-flow** (inline) | Polls CI checks, detects review bots, addresses inline comments |
| Comment and close issue | **feature-flow** (inline) | Posts implementation summary, closes linked issue |
| Ship (merge PRs) | **feature-flow** | `merge-prs` (optional — discovers and batch-merges feature-flow PRs) |

## Skills

### Lifecycle Orchestrator

| Skill | Purpose |
|-------|---------|
| `start` | Orchestrates the full lifecycle from idea to PR — classifies scope, loads project context, builds the platform-aware step list, and invokes the right skill at each stage |
| `settings` | Interactive dashboard for viewing and editing `.feature-flow.yml` settings — workflow, design, and advanced configuration with immediate YAML persistence |

### Pre-Implementation (Design Phase)

| Skill | Step | Purpose |
|-------|------|---------|
| `spike` | 3 | De-risk technical unknowns with time-boxed experiments before committing to a design |
| `design-document` | 4 | Turn brainstorming decisions into structured, implementable design docs |
| `design-verification` | 5 | Verify a design against the actual codebase — schema, types, pipelines, routes, dependencies, plus stack and platform-specific checks; runs a scope-critique pass (Step 4.5) for strategic-shape questions |
| `create-issue` | 6 | Create well-structured GitHub issues from verified designs |
| `consult-codex` | 4+ | Second-opinion AI review via codex MCP at lifecycle checkpoints (opt-in; `review-design` mode shipped) |

### Post-Implementation (Verification Phase)

| Skill | Step | Purpose |
|-------|------|---------|
| `verify-plan-criteria` | 8 | Validate every task has machine-verifiable acceptance criteria, auto-draft missing ones |
| `verify-acceptance-criteria` | 12 | Mechanically check each criterion against the codebase before claiming work is done |
| `merge-prs` | 21/22 | Discover, order, and merge feature-flow PRs — lifecycle Ship phase or standalone batch merge |
| `session-report` | — | Analyze completed Claude Code session JSON files for token usage, cost, test progression, thrashing, and optimization recommendations |

### Agent

| Component | Purpose |
|-----------|---------|
| `task-verifier` | Runs PASS/FAIL/CANNOT_VERIFY checks with evidence |

## Using Skills Standalone

While `start` is the recommended entry point, you can invoke any skill directly:

```
run design-verification on docs/plans/2024-03-15-notifications-design.md
```

```
run verify-acceptance-criteria against the plan in docs/plans/
```

Skills that need project context (`design-verification`, `spike`) will auto-create `.feature-flow.yml` if it doesn't exist (same auto-discovery flow as `start`). Other skills like `verify-plan-criteria` and `verify-acceptance-criteria` work without it.

## Where These Fit in the Lifecycle

```
 1. Idea
 2. Brainstorming                  ← superpowers:brainstorming (includes design preferences preamble for Feature/Major)
 3. Spike / PoC                    ← spike (queries Context7 docs first)
 4. Documentation Lookup           ← Context7 (resolve-library-id + query-docs)
 5. Design Document                ← design-document
 6. Design Verification            ← design-verification (+ stack/platform/doc compliance checks)
 7. GitHub Issue                   ← create-issue
 8. Implementation Plan            ← superpowers:writing-plans (supports XML plan format + split plans)
 9. Plan Criteria Check            ← verify-plan-criteria (validates dependency graphs)
10. Commit Planning Artifacts      ← inline (design docs + config committed to base branch)
11. Worktree Setup                 ← superpowers:using-git-worktrees (+ FEATURE_CONTEXT.md + phase context dirs)
12. Copy Env Files                 ← inline (env files available in worktree)
13. Study Existing Patterns        ← inline (reads codebase, generates "How to Code This" notes)
14. Implementation (TDD)           ← superpowers:subagent-driven-development (wave-based parallel execution)
14b. Device Matrix Testing         ← mobile only
15. Self-Review                    ← inline (coding-standards.md checklist)
16. Code Review                    ← inline (5-phase pipeline: pre-pass → report → consolidate → fix → re-verify)
17. Generate CHANGELOG Entry       ← inline (conventional commits → Keep a Changelog)
18. Final Verification             ← verify-acceptance-criteria + superpowers:verification-before-completion
18b. Beta Testing                  ← mobile only (TestFlight / Play Console)
19. Sync with Base Branch          ← inline (merge or rebase, configurable via git_strategy)
20. PR / Merge                     ← superpowers:finishing-a-development-branch
21. Wait for CI & Address Reviews  ← inline (polls CI checks, detects review bots, addresses comments)
21b. App Store Review              ← mobile only
22. Comment and Close Issue        ← inline (implementation summary + close)
23. Ship (merge related PRs)       ← merge-prs (optional — Feature/Major only, skips if no PRs)
24. Deploy
```

## Hooks

| Hook | Trigger | Action |
|------|---------|--------|
| PreToolUse (Write) | New source file being created | Reminds to check Context7 docs; **BLOCKS** if code contains `any` types, `as any`, or empty catch blocks |
| PreToolUse (Edit) | Source file being edited | **BLOCKS** if new code contains `any` types, `as any`, or empty catch blocks |
| PreToolUse (Task/Agent) | Subagent dispatch without explicit `model` param | **BLOCKS** dispatch to prevent silent Opus inheritance (8-10x cost increase) |
| PostToolUse (Write) | Plan file written to `plans/*.md` | Reminds to run `verify-plan-criteria` |
| PostToolUse (Write/Edit) | Source file written or edited | Warns about `console.log`/`console.debug` (non-blocking — useful during TDD, cleaned up in self-review) |
| SessionStart | Every session | Injects feature-flow conventions into context |
| Stop | Session ending | Runs `tsc`, lint, and type-sync checks; blocks if code was implemented without running `verify-acceptance-criteria` |

## Project Context

feature-flow uses a `.feature-flow.yml` file in your project root for platform and stack-specific behavior. **You don't need to create this manually** — `start` auto-detects your platform and stack from project files (package.json, Gemfile, go.mod, config files, directory structure, etc.) and creates it for you on first run.

```yaml
# .feature-flow.yml (auto-generated, then curated)
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
git_strategy: merge      # merge (default) | rebase — integration strategy for syncing with base branch
ci_timeout_seconds: 600  # Timeout for CI check polling after PR creation (default: 600)
notifications:           # macOS-only notification when Claude waits for input
  on_stop: bell          # bell | desktop | none
design_preferences:      # Project-wide design preferences (captured during first Feature brainstorming)
  error_handling: result_types
  api_style: rest
  state_management: server_state
  testing: unit_integration
  ui_pattern: tailwind
knowledge_base:          # Per-feature context file settings
  max_lines: 150         # Archive oldest decisions when file exceeds this
  stale_days: 14         # Archive decisions older than this many days
merge:                   # Ship phase merge configuration (all fields optional with defaults)
  strategy: squash       # squash | merge | rebase
  delete_branch: true    # delete branch after merge
  require_ci: true       # require CI green before merge
  require_review: true   # require approved review before merge
  auto_discover: label   # label | body_marker | both
yolo:                    # YOLO mode stopping points (empty = no pauses)
  stop_after:
    - design             # brainstorming | design | verification | plan | implementation | pr | ship
    - plan
quality_gates:           # Post-task quality gate configuration (all fields optional with defaults)
  after_task: true       # run gate after each task's commits (default: true)
  scope_lint: true       # scope lint to changed files — faster (default: true)
  skip_tests: false      # skip test runner per task — for slow suites (default: false)
```

**Should you commit this file?** Yes — `.feature-flow.yml` should be committed to your repo. It captures project-specific knowledge (especially gotchas) that benefits the whole team. It's not sensitive data and evolves with the project.

**How it works:**
- `platform` adjusts the lifecycle — mobile adds beta testing, app store review, required feature flags
- `stack` loads stack-specific verification checks during design verification
- `context7` maps each stack to Context7 library IDs — skills query these for current patterns before designing and implementing
- `gotchas` are injected into every verification — project-specific pitfalls learned from past bugs
- `git_strategy` controls how the feature branch syncs with the base branch before PR creation
- `notifications` configures bell or desktop alerts when Claude waits for input (macOS only)
- `design_preferences` stores 5 project-wide design choices (error handling, API style, state management, testing, UI pattern) captured during the first Feature-scope brainstorming — loaded silently on subsequent runs
- `knowledge_base` controls per-feature `FEATURE_CONTEXT.md` archival (line count, staleness)
- `ci_timeout_seconds` controls how long the post-PR step waits for CI checks to complete
- `merge` controls Ship phase merge behavior — strategy (squash/merge/rebase), CI/review requirements, and PR auto-discovery mechanism
- `yolo.stop_after` adds review checkpoints at specific lifecycle phases during YOLO mode (see YOLO Stops below)
- `quality_gates` controls the Post-Task Quality Gate that runs after each implementation task's commits — `after_task: false` disables it, `skip_tests: true` skips tests per task for slow test suites

**Auto-discovery:** On first run, `start` scans your project files, detects the stack, and resolves Context7 library IDs for each detected technology. It presents the full context for confirmation. On subsequent runs, it cross-checks for new dependencies and suggests additions.

**Context7 resolution:** For every detected stack entry, feature-flow calls Context7's `resolve-library-id` to find the best documentation library. Well-known stacks (Next.js, Supabase, Vercel) use pre-verified mappings. All other stacks are resolved dynamically — this means feature-flow works with **any technology** Context7 has documentation for (Django, Rails, FastAPI, Vue, Angular, Stripe, Prisma, etc.).

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

feature-flow enforces senior-engineer code quality through four layers:

1. **Study Existing Patterns** (before implementation) — Reads 2-3 existing files per area being modified, extracts conventions, and generates per-task "How to Code This" notes that map implementation tasks to specific codebase patterns
2. **Self-Review** (after implementation) — Reviews all changed code against a 10-point checklist: function size (≤30 lines), naming conventions, error handling, type safety (no `any`), DRY, pattern adherence, separation of concerns, guard clauses (≤3 nesting levels), debug artifacts, import organization
3. **Anti-pattern hooks** (real-time) — PreToolUse hooks on Write and Edit that **block** `any` types, `as any` assertions, and empty catch blocks from being written. `console.log/debug` is warned but not blocked (useful during TDD, cleaned up in self-review)
4. **5-Phase Code Review Pipeline** (after self-review) — Phase 0: deterministic pre-filter (stack affinity + plugin availability). Phase 1a: pr-review-toolkit pre-pass with auto-fixes committed. Phase 1b: report-only parallel agents (no file modifications). Phase 2: conflict detection and deduplication across all findings. Phase 3: single-pass fix implementation (bottom-up line ordering, one commit). Phase 4: targeted re-verification (max 2 iterations, only re-runs relevant checks). Phase 5: summary report included in PR body

The first three reference `references/coding-standards.md` — a comprehensive guide covering functions, error handling, DRY, TypeScript types, separation of concerns, naming, comments, performance, and testing. Stack-specific standards (Next.js, Supabase, React) are included.

### Context7 Documentation Integration

Context7 provides live documentation lookups for any technology, ensuring code follows current best practices even when frameworks release breaking changes or deprecate APIs.

**How it works:**

1. During auto-detection, feature-flow resolves Context7 library IDs for each stack entry
2. Before writing the design document, the "Documentation lookup" step queries relevant libraries for current patterns
3. During design verification, the "Documentation Compliance" check (category #17) verifies the design uses current patterns
4. A PreToolUse hook reminds about doc lookups before creating new source files

**Works with any stack:** Context7 hosts docs for thousands of libraries. Even if feature-flow doesn't have a pre-built stack reference file (e.g., for Django or Stripe), it can still resolve and query Context7 documentation dynamically.

**Example — what doc lookups catch:**
- Supabase deprecated `auth-helpers` in favor of `@supabase/ssr` — Context7 docs show the new `createServerClient` pattern
- Next.js Server Actions should return `{ errors }` objects, not throw — Context7 docs show the `useActionState` pattern
- A library changed its API between versions — Context7 has the current version's patterns

### Context Engineering

feature-flow persists decisions and discoveries across sessions using two mechanisms:

**`FEATURE_CONTEXT.md`** — Created automatically in the worktree root at setup. Captures curated decisions during the lifecycle. On session resume, the `start` skill loads this file, archives stale entries (configurable via `knowledge_base.max_lines` and `knowledge_base.stale_days`), and injects remaining decisions into context. This means you can stop mid-feature and resume in a new session without losing context.

**Phase context directories** — `.feature-flow/design/` and `.feature-flow/implement/` directories are created at worktree setup with four template files:
- `design-decisions.md` — Scope and approach choices from brainstorming and design
- `verification-results.md` — Design verification blockers and resolutions
- `patterns-found.md` — Codebase patterns discovered during study
- `blockers-and-resolutions.md` — Implementation blockers and how they were resolved

In YOLO/Express mode, these are archived to `.feature-flow/sessions/{date}-{branch}/` before PR creation and excerpted into the PR body.

### Implementation Plan Formats

feature-flow supports two plan formats:

**Prose format** (default) — Standard markdown with numbered tasks, acceptance criteria, and quality constraints. Works with all existing plans.

**XML plan format** (optional) — Plans opening with `<plan version="1.0">` enable machine-readable task metadata: `status` attributes, `<file action="create|modify">` references, and `<criterion>` elements with `<what>/<how>/<command>` children. Malformed XML falls back to prose mode automatically.

**Split plans** — Plans exceeding 15,000 words are automatically split into a lightweight index file (with Progress Index and Phase Manifest table) plus per-phase detail files. This prevents Read token limit failures on large features.

**Wave-based parallel execution** — Implementation tasks declare a `Parallelizable:` field. The orchestrator runs dependency analysis, groups tasks into execution waves, and dispatches independent tasks in parallel. Plans with >5 tasks target ≥50% parallel dispatch.

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

After discovering Supabase's PostgREST 1000-row silent truncation bug (21+ queries affected, zero error signals), the team added it to `.feature-flow.yml`:

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

## GitHub Issue Dispatcher

The dispatcher is a Python CLI tool that batch-processes GitHub issues through feature-flow's YOLO mode. It fetches issues by label, triages them with Claude to determine scope and automation tier, presents an interactive TUI for review, then executes each approved issue by spawning headless `claude -p` sessions that create branches and open PRs.

### Requirements

- Python 3.10+
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI (`claude` on PATH)
- [GitHub CLI](https://cli.github.com/) (`gh` on PATH, authenticated)
- Dependencies: `textual>=0.47`, `pyyaml`

### Setup

Before running the dispatcher, create the label it uses to find issues:

```bash
gh label create dispatcher-ready --color E99695 \
  --description "Ready for automated feature-flow processing" \
  --force
```

`--force` makes this idempotent — safe to re-run if the label already exists. The command requires `gh` to be authenticated (`gh auth status`) and must be run from inside the target repository, or with `--repo owner/repo` appended.

The dispatcher filters issues by this label. You can customize the label name via the `default_label` field in `dispatcher.yml`.

### Installation

```bash
cd dispatcher/
pip install -e ".[dev]"
```

### Configuration

Create a `dispatcher.yml` in your project root:

```yaml
plugin_path: /path/to/your/claude/plugins
repo: owner/repo                    # auto-detected from git remote if omitted
base_branch: main                   # auto-detected if omitted
triage_model: claude-sonnet-4-6
execution_model: claude-opus-4-6
execution_max_turns: 200
default_label: dispatcher-ready
selection_limit: 50
db_path: ./dispatcher.db
```

`plugin_path` is the only required field — it tells Claude where to find your feature-flow plugins during execution.

### Usage

```bash
# Interactive mode — opens TUI for issue selection and triage review
python -m dispatcher

# Process specific issues
python -m dispatcher --issues 42,43,44

# Fully automated — no TUI prompts
python -m dispatcher --auto

# Triage only — skip execution
python -m dispatcher --dry-run

# Filter by label
python -m dispatcher --label needs-automation

# Resume a previous run that hit the turn limit
python -m dispatcher --resume <run-id>
```

### Pipeline

The dispatcher runs a five-stage pipeline:

1. **Selection** — Fetches open issues with the configured label via `gh`. In interactive mode, a Textual `SelectionList` TUI lets you pick which issues to process. Previously parked issues are marked.
2. **Triage** — Each selected issue is sent to `claude -p` with a structured JSON schema. Claude classifies the issue's scope (`quick-fix`, `small-enhancement`, `feature`, `major-feature`), assesses richness (acceptance criteria, resolved discussion, concrete examples, structured content), and assigns a confidence score. A tier matrix maps scope × richness to an automation tier.
3. **Review** — A Textual `DataTable` TUI displays triage results with tier, confidence, risk flags, and missing info. You can override tiers, edit parked-issue comments, or skip issues before execution.
4. **Execution** — For each approved issue, the dispatcher creates a git branch, spawns a headless `claude -p` session in YOLO mode, and monitors for PR creation. Rate limiting with exponential backoff protects against API throttling.
5. **Logging** — Results are persisted to a SQLite database (`dispatcher.db`). Parked issues get a clarification comment posted to the GitHub issue. A summary prints PR count, parked count, duration, and turn budget usage.

### Tier Matrix

| Scope | Richness < 3 | Richness ≥ 3 |
|-------|-------------|-------------|
| `quick-fix` | full-yolo | full-yolo |
| `small-enhancement` | full-yolo | full-yolo |
| `feature` | parked | full-yolo |
| `major-feature` | parked | supervised-yolo |

- **full-yolo** — Fully automated: branch, implement, PR.
- **supervised-yolo** — Automated with a `needs-human-review` label on the PR.
- **parked** — Posts a clarification comment on the issue and skips execution.

### CLI Options

| Flag | Description |
|------|-------------|
| `--issues 1,2,3` | Process specific issue numbers (skips selection TUI) |
| `--label NAME` | Filter issues by GitHub label |
| `--repo owner/repo` | Override the GitHub repository |
| `--auto` | Skip all TUI prompts (fully automated) |
| `--dry-run` | Triage and review only, no execution |
| `--resume RUN_ID` | Resume a previous run by its ID |
| `--limit N` | Max issues shown in selection TUI |
| `--config PATH` | Config file path (default: `dispatcher.yml`) |
| `--verbose` | Print full `claude -p` output |

### Database

The dispatcher uses SQLite to track runs and issue state. The database is created automatically at the path specified by `db_path` in your config (default: `./dispatcher.db`).

Tables:
- **`runs`** — Run ID, timestamps, issue list, status (`running`, `completed`, `failed`, `cancelled`)
- **`issues`** — Per-issue triage results, execution results, session IDs, branch names, PR numbers, resume counts

This enables `--resume` to pick up where a previous run left off (e.g., if Claude hit the turn limit on a complex issue).

## Session Analysis Script

`skills/session-report/scripts/analyze-session.py` is a standalone Python script that extracts structured metrics from Claude Code session JSON files. It powers the `session-report` skill but can also be run directly.

### Usage

```bash
python3 skills/session-report/scripts/analyze-session.py <session-file.json>
```

The script outputs a JSON object with comprehensive session metrics.

### What It Extracts

| Category | Metrics |
|----------|---------|
| **Token usage** | Per-model breakdown (input, output, cache read, cache creation), grand totals, cache read percentage |
| **Cost analysis** | Per-call USD cost using published API pricing, per-model totals, cost per commit, cost per line changed |
| **Tool usage** | Call counts per tool, success rates, error details |
| **Subagent metrics** | Per-subagent token usage, duration, tool call count, estimated cost |
| **Cache economics** | Ephemeral cache breakdown (5m vs 1h), cache efficiency ratio, cold start detection |
| **Git activity** | Commit count with message previews, push count, branch creations, lines added/removed |
| **Test progression** | Pass/fail snapshots over time, trajectory assessment (improving/regressing/stable) |
| **Conversation tree** | Message depth, sidechain count, branch points |
| **Idle analysis** | Gaps > 60s between assistant and user messages, total idle time, active working time |
| **Thinking blocks** | Count plus content analysis for signals (alternatives considered, uncertainty, direction changes) |
| **Friction signals** | User correction patterns ("no,", "wrong", "undo", "revert"), friction rate |
| **Thrashing detection** | Repeated bash commands, files edited 3+ times |
| **Startup overhead** | Messages and tokens consumed before first productive tool call |
| **Model switches** | When the model changed mid-session |
| **Working directories** | Directory changes during the session |
| **Permission denials** | Blocked tool calls with affected tools |
| **Prompt quality** | First message length, correction count, assessment (well-specified / underspecified / verbose but unclear) |

### Pricing

The script includes a pricing table for Claude 3.x and 4.x models. Cost calculations use published per-token API pricing. Subagent costs are estimated when only `total_tokens` is available (assumes ~98% cache reads). Update the `MODEL_PRICING` dict at the top of the script when Anthropic changes pricing.

### Integration with session-report Skill

The `session-report` skill runs this script automatically and enriches the raw metrics with interpretation — model efficiency analysis, bottleneck identification, optimization recommendations, and actionable next steps. Use the skill for the full report:

```
/session-report
```

Or run the script directly for raw JSON metrics to feed into your own tooling.

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
