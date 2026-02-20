# Changelog

All notable changes to the spec-driven plugin.

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
