# Changelog

All notable changes to the spec-driven plugin.

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
