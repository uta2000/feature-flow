# Changelog

All notable changes to the spec-driven plugin.

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
