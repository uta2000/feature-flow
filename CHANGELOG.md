# Changelog

All notable changes to the feature-flow plugin.

## [Unreleased]

### Added
- **Post-PR lifecycle steps** — adds three post-PR capabilities to the feature lifecycle: (1) new "Comment and Close Issue" inline step that posts a detailed implementation summary (PR number, what was built, acceptance criteria verified, key files changed) on the linked GitHub issue and closes it via `gh issue close` after PR creation, (2) configurable PR target branch detection via `default_branch` field in `.feature-flow.yml` with a 4-step cascade (config field → `git config init.defaultBranch` → staging branch → main/master fallback), replacing all hardcoded `main` references in git commands, (3) expanded completion summary with issue close status, PR target branch, worktree cleanup guidance, and actionable next steps. Uses `Related: #N` instead of `Closes #N` in PR body to prevent silent auto-close on merge. Closes #34.
- **Deno and Bun test runner detection** — `detectTestCommand()` in `hooks/scripts/quality-gate.js` now detects Deno projects (`deno.json` / `deno.jsonc`) and Bun projects (`bun.lockb` / `bun.lock` / `bunfig.toml`), verifying the runtime is installed before returning the test command. Missing runtimes emit a descriptive warning and skip gracefully. Extracted shared `detectRuntimeTestCommand` helper for consistent error handling across runtimes. Inline test detection list in `SKILL.md` updated to match. Closes #40.
- **Renamed plugin** from `spec-driven` to `feature-flow` — config file changed from `.spec-driven.yml` to `.feature-flow.yml`
- **Worktree env file copying** — adds a "Copy Env Files" inline step to the start-feature lifecycle that runs after worktree setup and before study existing patterns. Copies non-production `.env*` files from the main worktree into new worktrees so baseline tests, tools, and dependency scripts have access to environment configuration. Excludes `.env.production*` variants (principle of least privilege) and `.env.example` (tracked by git). Silently skips when no env files exist. Implemented in feature-flow's start-feature rather than modifying the superpowers `using-git-worktrees` skill.
- **Scope-aware YOLO mode** — moves the YOLO/Interactive mode prompt from Step 0 to after scope classification and issue detection in Step 1. Adds a 3-signal recommendation engine (scope complexity default, issue richness scoring, inline context richness) that recommends YOLO for quick fixes and small enhancements, recommends Interactive for features and major features without detailed context, and overrides to YOLO for features with detailed issues or inline context. Combines scope confirmation and mode selection into a single `AskUserQuestion` prompt with three variants (YOLO recommended, Interactive recommended, Neutral).
- **Graduated YOLO behavior** — checkpoint count scales with scope: quick fix and small enhancement get full autonomy (0 checkpoints), feature gets 1 checkpoint (design document approval), major feature gets 2 checkpoints (brainstorming output summary + design document approval). Checkpoints use `AskUserQuestion` with "Continue" / "Let me adjust" options and resume YOLO after adjustment. Scope upgrade rule adopts new checkpoint count for remaining steps.
- **Brainstorming YOLO checkpoint for major features** — after all brainstorming questions are self-answered in YOLO mode, major features present a mandatory decision summary table for user review before proceeding to design document
- **Conditional YOLO checkpoint in design-document** — design document Step 5 now checks scope: quick fix/small enhancement skip confirmation entirely, feature/major feature present a mandatory YOLO checkpoint for document approval. Backward-compatible fallback for missing scope defaults to skip behavior.
- **Enhanced YOLO decision log** — two distinct formats: "Full YOLO" for quick fix/small enhancement (no checkpoints, low complexity note) and "Graduated YOLO" for feature/major feature (checkpoint count, `✋ User reviewed` markers for checkpoint rows, approval outcome tracking)
- YOLO propagation now includes `scope: [scope]` in args passed to sub-skills for graduated behavior
- **Intelligent model routing** — adds `model` parameter to all Task tool agent dispatches across 4 skill files. Code review pipeline routes reasoning-heavy agents (superpowers:code-reviewer, feature-dev:code-reviewer, backend-security-coder) to Opus and pattern-based agents (code-simplifier, silent-failure-hunter, pr-test-analyzer, type-design-analyzer) to Sonnet. Explore agents for codebase exploration, context gathering, and pattern study use Haiku. Verification batch agents and spike experiment agents use Sonnet. User model override mechanism added to code review pipeline. Phase 5 report template surfaces active model override.
- **Parallel agent dispatch for skill operations** — converts four sequential skill operations to parallel agent dispatch using the Task tool. Design verification dispatches 6 thematic batch agents (Schema & Types, Pipeline & Components, Quality & Safety, Patterns & Build, Structure & Layout, Stack/Platform/Docs) with verification depth filtering. Spike experiments dispatch one worktree-isolated `general-purpose` agent per assumption (cap: 5 concurrent). Design document context gathering dispatches 3-4 Explore agents for format patterns, stack dependencies, relevant code, and optional Context7 documentation. Start-feature pattern study dispatches one Explore agent per codebase area to extract patterns and flag anti-patterns. All skills use consistent failure handling (retry once, then skip with warning) and consolidation patterns.
- Batch grouping annotations added to verification checklist (`<!-- batch: N -->` markers) for parallel partitioning

- **YOLO superpowers overrides** — adds CRITICAL OVERRIDE blocks for 5 superpowers skills (brainstorming, writing-plans, using-git-worktrees, finishing-a-development-branch, subagent-driven-development) that explicitly name and suppress conflicting interactive prompts. Strengthens the brainstorming override from weak 4-line block to 6-step explicit pre-emption. Adds test failure handling to finishing override. Updates YOLO Decision Log templates with superpowers auto-decision rows.

### Changed
- start-feature step lists updated: Quick fix (7 steps, was 6), Small enhancement (17 steps, was 16), Feature (18 steps, was 17), Major feature (19 steps, was 18)
- `default_branch` field added to `references/project-context-schema.md` schema documentation
- **Deduplicated quality gate runs across lifecycle phases** — eliminates redundant typecheck/lint/test runs across Code Review Phase 4 re-verify, Final Verification, and the stop hook. Phase 4 re-verify checks `git status --porcelain` between iterations and skips quality gates when no files changed. Final Verification skips `verification-before-completion` when Phase 4 already passed and working tree is clean, and writes a commit-hash marker to `.git/feature-flow-verified`. Stop hook reads the marker at startup and skips all checks when HEAD matches and working tree is clean (fail-open on any error). Reduces typecheck runs per session from 6-8 to 2-3, saving ~2-3 minutes per session. Resolves #36.
- **Optimized verify-plan-criteria latency** — plan path confirmation is now conditional (skipped when only 1 candidate exists), all criteria approval is batched into a single prompt instead of per-task, and an explicit fast-path skips Steps 4-5 when all tasks already have criteria. Reduces worst-case user round-trips from N+1 to 1, and common-case (all criteria exist) to 0.
- **Optimized subagent model selection** — adds model guidance to Subagent-Driven Development YOLO Override: implementation subagents default to Sonnet, escalating to Opus only for tasks with architectural complexity keywords ("architect", "migration", "schema change", "new data model"). Spec review and consumer verification agents use Sonnet. Explore agents during implementation use Haiku. Downgrades `feature-dev:code-reviewer` and `superpowers:code-reviewer` from Opus to Sonnet in the code review pipeline table (6/7 agents now Sonnet, 1/7 Opus). Follow-up to intelligent model routing (#21).
- **Parallelized quality gate checks** — converts sequential `execSync` calls in `hooks/scripts/quality-gate.js` to async `exec` with `Promise.allSettled`, running typecheck, lint, and type-sync concurrently. Tests run sequentially after, only if typecheck passes. Resolves #42.

### Fixed
- Code review findings in Comment and Close Issue step — `gh issue comment` now uses heredoc for multiline safety, Skill Mapping table correctly orders mobile steps before issue close
- **File size pre-check for subagents** — adds `wc -c` file size check instruction to Study Existing Patterns agent context (200KB threshold) and large file handling instruction to Code Review Pipeline (use `git diff` for large files instead of reading full content). Adds Tool Usage Patterns section to coding-standards.md with general guidance on file size checks, large file alternatives, and generated file handling. Closes #37.
- **Quality gate error handling** — fixed empty catch blocks in `checkPrismaTypes`, `findTypeFiles`, and `checkDuplicateTypes` to log warnings instead of silently swallowing errors. Fixed `checkTests` command-not-found detection to use `e.code === 127` (correct for promisified `exec`).
- Batch criteria edit option now explicitly supports per-task selective accept/reject
- Combined prompt variants correctly exclude major features from YOLO-recommended label (major with detailed context maps to Neutral)
- Neutral recommendation variant includes both detailed issue and detailed inline context triggers
- Spike dispatch instruction repositioned parenthetical to correctly attach to `subagent_type` rather than `model`
- Batch 6 dispatch now specifies `subagent_type=Explore`, context specification, and concurrent launch with Batches 1-5
- Verification return format uses array notation to match list-of-results semantics
- SKIPPED verification categories tracked distinctly from PASS/FAIL/WARNING with prominent warnings
- Context7 skip conditions consolidated into dispatch table to prevent unnecessary agent dispatches

## [1.12.0] - 2026-02-20

### Added
- **Structural anti-pattern awareness** — embeds structural quality checks into three existing lifecycle phases rather than adding a new review step. Design verification gains category 14 (Structural Anti-Patterns) checking for god objects, tight coupling, circular dependencies, dependency direction, and responsibility distribution. God objects (4+ responsibilities) and circular deps are blockers (FAIL); tight coupling is a warning. Study Existing Patterns now flags anti-patterns in existing code with a "do NOT replicate" section, with an explicit exception to the "consistency > purity" rule for structural issues. Self-review checklist expanded from 10 to 14 items (adds: no god files, no circular deps, dependency direction, cross-file duplication). Coding standards gains a new "Structural Quality" section with 5 principles.

## [1.11.0] - 2026-02-20

### Added
- **YOLO mode** — auto-selects recommended options at all `AskUserQuestion` call sites across 6 skills, reducing friction for experienced users. Activated via `--yolo`, `yolo mode`, or `run unattended` in the start command, or via startup question. Three-layer architecture: detection (parse trigger from user input), propagation (pass `yolo: true` via Skill args), behavior (each skill checks flag and skips prompts). Logs each decision inline and prints a full decision log table at lifecycle completion. Quality gates, hooks, and verification steps are never bypassed.

### Changed
- Plugin version bumped to 1.11.0

## [1.10.0] - 2026-02-20

### Changed
- **Code review test detection aligned with quality gate** — Phase 4 test runner detection now matches `detectTestCommand()` from `hooks/scripts/quality-gate.js` exactly: uses `npm test` only (not yarn/pnpm), checks `node_modules` existence, skips npm default placeholder, adds `mix test` (Elixir) and `tox.ini` (Python), documents 60-second timeout and command-not-found error handling. Closes #7.

## [1.9.0] - 2026-02-20

### Added
- **Multi-agent code review pipeline** — replaces single-agent code review with a 7-agent find-fix-verify pipeline. Dispatches `code-simplifier`, `silent-failure-hunter`, `feature-dev:code-reviewer`, `superpowers:code-reviewer`, `pr-test-analyzer`, `backend-security-coder`, and `type-design-analyzer` in parallel. Direct-fix agents apply changes immediately; reporting agents consolidate findings by severity (Critical > Important > Minor). Includes a fix-verify loop (max 3 iterations) that re-runs tests and acceptance criteria after fixes. Gracefully degrades when optional plugins are missing.
- Pre-flight warnings for recommended plugins (`pr-review-toolkit`, `feature-dev`, `backend-api-security`) during lifecycle start
- **CHANGELOG generation step** — new inline lifecycle step that auto-generates a Keep a Changelog entry from the feature branch's git commits. Parses conventional commit prefixes (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`), categorizes entries, and presents for user approval before writing to `CHANGELOG.md`. Falls back to a single "Changes" section for non-conventional commits. Supports version detection from `package.json`, `Cargo.toml`, `pyproject.toml`, `mix.exs`, and git tags. Merges into existing `[Unreleased]` sections without overwriting.
- Step added to Small enhancement (step 12), Feature (step 13), and Major feature (step 14) lifecycles. Quick fix is unchanged.

### Changed
- Code review step changed from single `superpowers:requesting-code-review` dispatch to inline multi-agent pipeline with 5 phases
- start-feature step lists updated: Small enhancement (14 steps, was 13), Feature (15 steps, was 14), Major feature (16 steps, was 15)

## [1.8.0] - 2026-02-20

### Added
- **Test suite check in quality gate** — Stop hook now runs the project's test suite (`npm test`, `cargo test`, `go test ./...`, `python -m pytest`, `mix test`) before ending a session. Failing tests BLOCK the session. Timeouts produce a warning instead of blocking. Projects without a test runner are skipped silently.
- Stop hook timeout increased from 120s to 180s to accommodate test suite runs

## [1.7.0] - 2026-02-20

### Added
- **PostToolUse per-file lint hook** — runs ESLint or Biome on each source file after Write/Edit, providing immediate feedback to fix lint errors before continuing
- **Stop quality gate hook** — blocks session end with combined report when any of these checks fail:
  - **TypeScript type checking** (`tsc --noEmit`) — catches type errors across the full project
  - **Full project lint** (`npm run lint` or direct linter detection) — enforces project lint rules
  - **Type-sync: generated types freshness** — detects stale Supabase/Prisma generated types by regenerating and diffing
  - **Type-sync: duplicate type detection** — finds `.types.ts` files in edge function directories that have drifted from the canonical source
- External Node.js scripts (`hooks/scripts/lint-file.js`, `hooks/scripts/quality-gate.js`) for complex detection logic
- Dynamic tool detection — checks `node_modules/.bin/` for installed tools before running; never lets `npx` download tools
- Supabase instance guard — checks `supabase status` before `gen types --local`; skips gracefully if not running
- New `types_path` field in `.spec-driven.yml` for overriding canonical types file location

### Changed
- Stop hook array ordering: quality gate runs first, acceptance-criteria check runs second
- SessionStart message updated to mention enforcement hooks
- PostToolUse Write/Edit descriptions updated to include lint hook

## [1.6.0] - 2026-02-19

### Added
- **Context7 integration** for live documentation lookups during feature development
- Context7 is now a **required plugin** (pre-flight check in start-feature, like superpowers)
- New `context7` field in `.spec-driven.yml` schema — maps stack entries to Context7 library IDs
- **Dynamic library resolution** — for every detected stack entry, calls Context7's `resolve-library-id` to find the best docs. Works with any technology, not just pre-built stacks.
- Known mappings cache for 12 popular stacks: Next.js, Supabase, Vercel, Express, Django, FastAPI, Vue, Angular, Rails, Prisma, Stripe, Tailwind (skip API call for common stacks)
- "Documentation lookup" step in start-feature lifecycle (between brainstorming and design document)
- "Documentation Compliance" verification category (#17) in design-verification — checks design uses current patterns from official docs
- PreToolUse hook on Write — reminds to check Context7 docs before creating new source files (only fires when `context7` is configured in `.spec-driven.yml`)
- **PreToolUse anti-pattern BLOCKING** on Write and Edit — blocks source files containing `any` types, `as any` assertions, or empty catch blocks from being written. Forces fix before proceeding. `console.log`/`console.debug` are warned (PostToolUse) but not blocked, since they're useful during TDD and cleaned up in self-review.
- Context7 Documentation sections in all stack reference files (next-js, supabase, vercel, react-native) with library IDs and key patterns
- **`references/coding-standards.md`** — senior-engineer coding principles covering functions, error handling, DRY, types, separation of concerns, naming, comments, performance, and testing
- **"Study Existing Patterns" step** — mandatory inline step before implementation that reads 2-3 existing files per area being modified, extracts patterns, and generates "How to Code This" notes per implementation task
- **"Self-Review" step** — mandatory inline step after implementation that reviews all changed code against a 10-point checklist (function size, naming, error handling, types, DRY, pattern adherence, separation of concerns, guard clauses, debug artifacts, imports)
- Spike skill now queries Context7 docs before designing experiments (Step 1b: Check Documentation First)

### Changed
- start-feature pre-flight check now verifies both superpowers AND Context7
- start-feature step lists updated: Quick fix (6 steps), Small enhancement (13 steps), Feature (14 steps), Major feature (15 steps)
- design-verification depth table updated to include doc compliance for API route designs
- project-context-schema.md documents new `context7` field and how skills use it
- auto-discovery.md includes Context7 library detection flow, known mappings (12 stacks), and examples for different tech stacks
- README updated with Context7 requirements, installation, integration docs, coding standards, and new lifecycle steps
- plugin.json keywords expanded with `context7`, `documentation`, `coding-standards`

## [1.5.0] - 2026-02-18

### Added
- First-time user welcome in SessionStart hook (detects `.spec-driven.yml` to distinguish new vs returning users)
- Auto-discovery support for PHP (composer.json), Java/Kotlin (build.gradle, pom.xml), C#/.NET (*.csproj), and Elixir (mix.exs)
- Superpowers pre-flight check in start-feature — fails early with install instructions if superpowers is missing
- Empty-stack warning when auto-discovery detects no frameworks
- `.spec-driven.yml` commit guidance in README
- Standalone skill usage documentation in README
- CHANGELOG.md

### Fixed
- Superpowers repo URL corrected to `obra/superpowers`
- Platform detection no longer misclassifies Kotlin backend projects as Android
- task-verifier now package-manager-agnostic (supports yarn, pnpm, bun, cargo, make, python, pytest, mix, dotnet)
- README no longer overstates which skills auto-create `.spec-driven.yml`
- Pre-flight check no longer accidentally invokes brainstorming to test availability

## [1.3.0] - 2026-02-18

### Added
- Auto-discovery of platform and tech stack from project files
- Gotcha write-back from design-verification (Step 7) and spike (Step 5)
- `.spec-driven.yml` auto-creation with user confirmation
- Cross-check flow for existing `.spec-driven.yml` on subsequent runs
- Quick Start section in README
- Mobile Feature templates for design documents and GitHub issues
- Platform lifecycle differences table in README

### Changed
- start-feature Step 0 now auto-detects and creates project context
- verify-plan-criteria is now package-manager-agnostic (was hardcoded to npm)
- SessionStart hook now mentions start-feature and full lifecycle
- README rewritten with installation instructions and superpowers dependency

### Fixed
- design-verification missing Write tool in frontmatter
- scope-guide ambiguous "Add a new column" example (UI column vs DB column)
- marketplace.json top-level description out of sync with plugin.json

## [1.2.0] - 2026-02-17

### Added
- Initial release with 6 skills + 1 agent + 3 hooks
- Skills: start-feature, spike, design-document, design-verification, create-issue, verify-plan-criteria, verify-acceptance-criteria
- Agent: task-verifier
- Hooks: SessionStart, PostToolUse (Write), Stop
- Stack references: supabase, next-js, react-native, vercel
- Platform references: web, mobile
