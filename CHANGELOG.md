# Changelog

All notable changes to the feature-flow plugin.

## [Unreleased]

### Changed
- **Refactored start skill to progressive disclosure** — reduced `skills/start/SKILL.md` from 1,823 to 463 lines (74.6% reduction) by extracting phase-specific instructions into 7 new reference files under `skills/start/references/`. Core orchestration loop, skill mapping, execution continuity rules, and scope classification remain in SKILL.md. Extracted content is read on-demand via 1-2 line pointers. No behavioral changes — structural reorganization only. (Closes #137)
- **Replaced CRITICAL OVERRIDEs with reasoning-first overrides** — all 5 `CRITICAL OVERRIDE` blocks in `start` SKILL.md rewritten to lead with rationale (why the override exists) before stating intent (what to do). Negative directives (`Do NOT`, `MUST SUPPRESS`) replaced with positive phrasing (`Skip...`, `Proceed past...`, `Use X instead of Y`). Residual instruction density reduced in parallelism and iteration-limit directives. (Closes #138)
- **Deduplicated inline documentation in `start` SKILL.md** — replaced 14-item self-review checklist with reference to `../../references/coding-standards.md` (source of truth), extracted YOLO/Express decision log templates (~50 lines) to `references/decision-log-templates.md`, and added scope-guide.md pointer. Net reduction: 65 lines from SKILL.md. (Closes #140)
- **Post-compaction recovery logic extracted to reference file** — moved the 4 CURRENT field edge cases and checkpoint format template from `skills/start/SKILL.md` to `references/context-checkpoints.md`. SKILL.md retains checkpoint locations table, scope-based filtering, and suppression rules with a single pointer to the reference file. Net 18-line reduction from SKILL.md. (Closes #141)

### Fixed
- **Replace hardcoded sentinel detection with namespace-prefix for all plugins** — pre-flight plugin checks used hardcoded sentinel skill names (e.g., `feature-dev:code-reviewer`) that didn't match actual skill names shipped by plugins (e.g., `feature-dev:feature-dev`), causing detection to silently fail. All four plugin checks (`superpowers`, `pr-review-toolkit`, `feature-dev`, `backend-api-security`) now use namespace-prefix detection — look for any skill starting with `plugin-name:` instead of a specific sentinel name. (Closes #146)
- **Pre-flight reviewer audit code review fixes** — removed marketplace suggestions from audit template (separate output block), added YOLO/Express behavior to marketplace discovery (skip entirely), fixed restart instruction to not promise artifact-based resume, added restart-without-restart loop guard, clarified internal agent exclusion from audit. (Related: #143)
- **YOLO mode pauses from `ACTION REQUIRED` hook message** — `PostToolUse Write` hook on `plans/*.md` files previously emitted `ACTION REQUIRED: Plan file written...`, which Claude interpreted as a blocking imperative and stopped to act on. Changed to `[feature-flow]` prefix with explicit note that YOLO mode should continue without pausing. (Closes #135)
- **YOLO mode pauses from step 4 standalone text output** — Step 4 "Confirm completion" in the execution loop could produce a text-only response that ends the turn, forcing the user to type "continue". Added explicit instruction that confirmation notes must be included alongside the `TaskUpdate` call in step 5, not as a standalone text response. (Closes #135)
- **Document context7 tool parameters to prevent wrong parameter name usage** — `references/tool-api.md` listed the context7 MCP tools without documenting their parameters, causing the AI to fall back on pre-training knowledge that uses the wrong name `context7CompatibleLibraryID` instead of `libraryId`. Added explicit parameter tables for both `resolve-library-id` and `query-docs`, and a common-mistakes entry calling out the wrong parameter name. (Closes #157)

### Added
- **Reviewer Stack Affinity Table and pre-flight reviewer audit** — `start` skill's pre-flight check now includes a static reviewer-to-stack mapping table and a reviewer audit that reports review coverage for the project's detected stack. Cross-references installed plugins against the affinity table, classifying reviewers as relevant+installed, relevant+missing, or irrelevant based on `.feature-flow.yml` stack entries. Internal agents (`silent-failure-hunter`, `code-simplifier`) marked for audit visibility but not dispatched independently. (Closes #143)
- **Marketplace discovery for code review plugins** — `start` skill pre-flight now runs `claude plugins search "code review"` to discover relevant uninstalled review plugins. Cross-references discovered plugins against the Reviewer Stack Affinity Table and suggests matching plugins with install commands. Non-blocking — failure logs a warning and continues. (Closes #143)
- **Gated pr-review-toolkit pre-pass (Phase 1a)** — code review pipeline now runs pr-review-toolkit as an isolated sequential pre-pass before report-only agents. Auto-fixes are committed before Phase 1b agents run, ensuring all subsequent reviewers see a consistent codebase. Failure handling degrades gracefully — skip Phase 1a and proceed to Phase 1b. (Closes #143)
- **Report-only parallel agents (Phase 1b)** — code review pipeline Phase 1b dispatches only tier-eligible, stack-relevant agents with explicit "Return findings only. Do NOT modify any files." instruction. Agents return structured findings without modifying code, eliminating overlapping/conflicting direct fixes. (Closes #143)
- **Conflict detection between review findings (Phase 2)** — new Phase 2 consolidates findings from Phase 1a and 1b, rejects non-compliant findings, deduplicates by file+line, and detects conflicts using ±5 line range overlap. Conflicts resolved by severity then agent specificity (`backend-security-coder` > `pr-review-toolkit` > `feature-dev` > `superpowers`). (Closes #143)
- **Single-pass fix implementation (Phase 3)** — all conflict-free Critical and Important findings applied in a single coordinated pass with bottom-up line ordering to avoid line number shifts. Single commit for all fixes. (Closes #143)
- **Stack-aware agent filtering in code review pipeline** — scope-based agent selection now uses the Reviewer Stack Affinity Table for dispatch filtering. Agents are checked for plugin installation AND stack affinity intersection with `.feature-flow.yml` stack entries before dispatch. (Closes #143)
- **Updated Phase 5 report format** — code review report now includes stack filter field, renamed fix sections (pr-review-toolkit pre-pass, report-only → single pass), and a new Conflicts Resolved section showing kept vs skipped findings. (Closes #143)
- **Targeted re-verification in code review pipeline** — Phase 4 re-verify loop replaced with a decision table mapping the Phase 3 fix log to targeted checks: test suite runs only if `pr-test-analyzer` flagged findings, `verify-acceptance-criteria` only if `superpowers:code-reviewer` flagged acceptance criteria rule violation, specific agent re-dispatch only for that agent. Maximum iterations reduced from 3 to 2. Reduces token consumption by running only relevant quality checks instead of all gates every iteration. (Closes #118)
- **Single-commit step for review fixes after Phase 3** — all Critical and Important findings from Phase 3 are committed as one atomic commit before Phase 4 re-verification, ensuring review fixes land in a single commit rather than scattered across the lifecycle. Includes `git status --porcelain` guard before staging and explicit error handling if the commit fails. (Closes #118)
- **Lifecycle context object for artifact path threading** — `start` skill now maintains a context object that accumulates artifact paths (`base_branch`, `issue`, `design_doc`, `plan_file`, `worktree`) as they become known during the lifecycle, and injects all known paths into every subsequent `Skill` invocation as explicit args. Downstream skills can use these paths directly instead of re-discovering them via Glob. (Closes #119)
- **`plan_file` arg support in `verify-acceptance-criteria`** — skill accepts `plan_file` path in ARGUMENTS to skip Glob discovery and user confirmation when the caller already knows the plan file location; falls back to Glob discovery with a warning announcement if the provided path cannot be read. (Closes #119)
- **Compact progress index for plan files** — every plan generated by `writing-plans` now includes a machine-readable `<!-- PROGRESS INDEX -->` HTML comment at the top listing all tasks with `STATUS: pending/in-progress/done (commit SHA)` and a `CURRENT:` field. The `subagent-driven-development` task loop maintains the index after each task status change, with backward-compat skip for plans without an index. Post-compaction recovery in `start` now reads only lines 1-30 of the plan (the index) during the Implement step instead of the full plan, reducing plan re-reads from 12× to 1× per compaction event. (Closes #116)
- **Haiku model for task-verifier dispatch** — `verify-acceptance-criteria` now explicitly passes `model: "haiku"` when dispatching the task-verifier agent, reducing verification cost by ~60%. Verification is checklist-style mechanical work (file existence, grep patterns, command output) that does not require advanced reasoning. (Closes #108)
- **Notification preference prompt in `start:` lifecycle** — adds an optional bell or macOS desktop notification when Claude Code stops and waits for user input. Prompt runs after Session Model Recommendation in Step 0 pre-flight; users choose "no notifications", terminal bell (`osascript -e 'beep 2'`), or desktop notification with Glass sound. Preference persists in `.feature-flow.yml` as `notifications.on_stop: bell | desktop | none` so future sessions skip the prompt. YOLO/Express modes skip the prompt and default to `none` if no saved preference exists. macOS-only (uses `osascript`). (Closes #113)
- **Git diff stats capture in Final Verification Step** — `start` skill now runs `git diff --stat [base-branch]...HEAD` as step 4 of the Final Verification Step, capturing line counts in the session transcript before PR creation. The `session-report` analysis script uses this output to populate the `cost_per_line_changed` metric. Distinguishes command failures (`fatal:` errors) from empty output (no commits) with explicit log warnings. (Closes #110)
- **pr-review-toolkit review phase dispatched as an isolated Task subagent** — `start` skill's Code Review Pipeline Phase 1 now dispatches `pr-review-toolkit:review-pr` as a single general-purpose Task subagent with its own isolated context window. The subagent receives base branch, HEAD SHA, changed files, scope, and acceptance criteria; it returns a structured Critical/Important/Minor summary. Non-pr-review-toolkit agents (`superpowers:code-reviewer`, `feature-dev:code-reviewer`, `backend-api-security:backend-security-coder`) continue to run as direct Task subagents in the parent. Eliminates context accumulation from individual pr-review-toolkit agent reports (~2 compactions per major feature session). (Closes #117)
- **Aggregated code review summary in PR body** — `start` skill's YOLO override for `finishing-a-development-branch` now explicitly instructs including the PR Review Toolkit Summary (Phase 1 subagent output, Phase 2 auto-fixed, Phase 3 Claude-fixes, and remaining minor findings) in the PR body under a `## Code Review Summary` section. (Closes #117)
- **Compaction checkpoints 3 and 4 to bracket the implementation phase** — Checkpoint 3 repositioned from "after Commit Planning Artifacts" to "after Worktree Setup + Copy Env Files", firing immediately before implementation begins. New Checkpoint 4 added after implementation completes (last subagent task done), before self-review + code review. Focus hint for checkpoint 3 includes worktree path; checkpoint 4 includes implementation commit SHAs and known issues. Scope filtering updated: Feature and Major Feature now show all 4 checkpoints (Small Enhancement unchanged at "2 and 3 only"). Context note updated from "2-3" to "3-4" /compact pauses. Express Decision Log updated with checkpoint 4 row. (Closes #114)
- **Lifecycle step transition batching rule** — orchestrator now batches `TaskUpdate(N, completed)` + `TaskUpdate(N+1, in_progress)` into a single parallel message when the next lifecycle step is in_progress-eligible (study existing patterns, implementation, self-review, code review, generate CHANGELOG entry, final verification, documentation lookup), saving one API round-trip per eligible step transition. Includes explicit guard: when N is the final lifecycle step, only `TaskUpdate(N, completed)` is called. (Closes #132)
- **Implementation task transition batching rule in Subagent-Driven Development Context Injection** — orchestrator batches `TaskUpdate(N, completed)` + `TaskUpdate(N+1, in_progress)` into one parallel message before dispatching the next implementer subagent, saving one API round-trip per task transition. Includes explicit guard: when N is the last task, only `TaskUpdate(N, completed)` is called without batching. (Closes #132)

### Fixed
- **Error handling for Phase 3 commit failure, test ENOENT/timeout, and agent re-dispatch crash** — code review pipeline now explicitly handles and reports these failure modes instead of proceeding silently. (Closes #118)
- **Phase 5 report template reflects 2-iteration max** — updated `M/3` to `M/2` and "unfixed after 3 iterations" to "unfixed after 2 iterations" to match the new Phase 4 targeted re-verification cap. (Closes #118)
- **File-not-found fallback for `plan_file` fast-path** — `verify-acceptance-criteria` and `subagent-driven-development` now announce and fall back to Glob discovery when a provided `plan_file` path cannot be read, instead of silently failing mid-execution. (Closes #119)
- **Git Safety Protocol in implementer subagent prompts** — adds item 6 to the Implementer Quality Context Injection section prohibiting `git commit --amend`, `git rebase -i`, and `git push --force`/`--force-with-lease`. Includes positive alternatives for each prohibited operation (wrong message → new commit, forgotten file → new commit, hook failure → new commit, rebase cleanup → ask user, force-push → stop and ask human). Aligns with Claude Code's own git safety protocol. (Closes #107)
- **Error handling for notification hook writes** — adds explicit fail-open handling for `~/.claude/settings.json` and `.feature-flow.yml` writes; permission errors are logged with a user-visible warning and do not block the lifecycle. Corrupted/unreadable `settings.json` is treated as absent (proceeds to write a new hook). (Closes #113)
- **`on_stop: none` persistence** — when user explicitly selects "no notifications", `on_stop: none` is persisted to `.feature-flow.yml` so future sessions can distinguish "user was asked and declined" from "user has not been prompted yet" (absent field). (Closes #113)
- **Enforce parallel dispatch in study-patterns phase** — adds explicit "Do NOT dispatch agents one at a time" anti-pattern warning to the Study Existing Patterns dispatch instruction, matching the proven TaskCreate pattern. Prevents ~13s wall-clock regression per lifecycle run when multiple exploration agents are dispatched. (Closes #109)
- **Enforce parallel dispatch in code review pipeline Phase 1** — adds same anti-pattern warning to Code Review Pipeline Phase 1 dispatch instruction for consistency. (Closes #109)
- **Code review pipeline updated for subagent architecture** — scope table, Phase 2 auto-fix sourcing, Phase 3 deduplication preference order (`security > pr-review-toolkit subagent > feature-dev > superpowers`), Phase 3 fix patterns, malformed summary guard clause (announces and skips when subagent returns a response missing required sections), and plugin warning message updated to reflect the isolated subagent dispatch. (Closes #117)
- **Checkpoint 3 "Before Step" label uses natural language step name** — changed from raw skill identifier to "Implement", consistent with the naming convention used across all other checkpoint rows.
- **Edge case guards for last step/task in TaskUpdate batching** — both batching notes (lifecycle step transitions and implementation task transitions) include explicit guidance that when N is the final step or final task, only `TaskUpdate(N, completed)` should be called without batching. Prevents attempting to reference a non-existent N+1. (Closes #132)

### Changed
- **Deduplicate YOLO execution continuity instructions into Turn Bridge Rule** — the "always call `TaskUpdate` to keep your turn alive" pattern was repeated 5+ times throughout the `start:` skill. Consolidated into a single named **Turn Bridge Rule** defined in Step 3's YOLO Execution Continuity section, with all inline occurrences replaced by one-line references. Reduces token overhead and improves scannability. (Closes #139)

### Documentation
- **`notifications` field in `references/project-context-schema.md`** — documents the new `notifications.on_stop` field (`bell | desktop | none`), its read/write semantics, YAML example, and the semantic distinction between `on_stop: none` (explicitly declined) vs field absent (not yet prompted). Updates the `start (reads + writes)` section. (Closes #113)

### Maintenance
- **Bump version to 1.22.3** — `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and `.feature-flow.yml` updated to reflect the new plugin version.

## [1.22.1] - 2026-02-28

### Changed
- **Batch TaskCreate calls in Step 2** — all N TaskCreate calls now sent in a single parallel message, eliminating N-1 sequential parent API turns (~17 API calls saved per session)
- **Conditional `in_progress` updates in Step 3** — replaces unconditional `in_progress` TaskUpdate with exhaustive keep/skip classification; short/mechanical steps (brainstorming, design document, worktree setup, etc.) skip the update while extended steps retain it (~11 API calls saved)
- **Commit planning artifacts delegated to subagent** — `git add`/`git commit` operations moved from inline parent bash calls to a `general-purpose` subagent dispatch, with conservative empty-output skip and non-blocking failure handling (~2 API calls saved)
- **Comment and close issue delegated to subagent** — `gh issue comment`/`gh issue close` operations moved to a `general-purpose` subagent after 2 inline data-gathering bash calls (git log + git diff --stat); subagent receives fully-assembled comment body with no placeholders (~1 API call saved). Adds `--body-file` to avoid shell quoting issues with apostrophes, and conditional announce based on structured subagent return value. (Closes #111)

## [1.22.0] - 2026-02-27

### Added
- **Active model detection gate** — replaces the passive Session Model Recommendation announcement with model detection that prompts Opus users to switch to Sonnet (~70% cost savings). Falls back to informational announcement if detection fails. YOLO skips the prompt; Express shows it. (Closes #105)

## [1.21.0] - 2026-02-27

### Added
- **Model routing defaults** — new general section in `start` skill establishing Haiku as the default model for Explore subagents across all run modes (YOLO, Express, Interactive), with override guidance for complex analysis tasks. Updated `references/tool-api.md` with recommended model defaults table. (Closes #97)
- **Change Design Protocol for implementer subagents** — adds "read file, plan change, write in one pass" protocol to Implementer Quality Context Injection and file modification complexity requirement to Writing Plans Quality Context Injection, preventing edit thrashing that wastes API calls on repeated edit→typecheck→re-read cycles (Related: #95)
- **Sonnet-first model routing** — lifecycle defaults to Sonnet for all mechanical phases (implementation, review, verification, git operations), escalating to Opus only for brainstorming and design. Adds Session Model Recommendation to Step 0, Phase-Boundary Model Hints to Step 3, orchestrator-level phase table to Model Routing Defaults, and Sonnet-first principle to `references/tool-api.md`. Estimated ~75% cost reduction per session. (Closes #94)

## [1.20.0] - 2026-02-27

### Added
- **Plugin version drift detection** (`hooks/scripts/version-check.js`) — auto-stamps `plugin_version` in `.feature-flow.yml` on every SessionStart, compares against running version with semver-aware classification (major/minor/patch), and surfaces informational upgrade notices when drift is detected. Includes TOCTOU-safe file reading and 29-test coverage. (Closes #89)
- **Version drift check in `start` skill** — Step 0 reads `plugin_version`, compares against running version, announces drift level, and auto-stamps the field when creating or updating `.feature-flow.yml`

### Fixed
- Eliminated TOCTOU race in version-check hook by replacing `existsSync` + `readFileSync` with try/catch on `readFileSync` with specific `ENOENT` handling
- Removed stop hook `verify-acceptance-criteria` Haiku prompt that fired on every session end, costing tokens and blocking non-plan sessions (Closes #91)

### Documentation
- Added `plugin_version` field to `references/project-context-schema.md` with auto-stamping behavior, version source, drift classification, and team-wide detection documentation

## [1.19.3] - 2026-02-27

### Fixed
- Removed stop hook `verify-acceptance-criteria` Haiku prompt that fired on every session end, costing tokens and blocking non-plan sessions (Closes #91)

## [1.19.2] - 2026-02-25

### Fixed
- Base branch detection cascade now checks remote-only branches (`origin/staging`, `origin/develop`) and adds `develop` as a checked branch with Git Flow convention priority (Closes #87)

## [1.19.1] - 2026-02-25

### Added
- **Shared tool API reference** (`references/tool-api.md`) — single source of truth for correct Task, Skill, deferred tool (TaskCreate/TaskUpdate), and Context7 MCP tool invocation syntax, with "Common mistakes" anti-hallucination sections targeting observed failure patterns
- **SessionStart hook tool API hint** — correct Skill tool parameter names (`skill`/`args`, not `skill_name`/`arguments`) and deferred tool loading reminder injected into conversation context before any skill loads

### Fixed
- LLM hallucinating `skill_name`/`arguments` instead of `skill`/`args` when invoking the Skill tool (Closes #86)
- LLM hallucinating `Task(subagent_type: "TodoWrite")` instead of using the `TaskCreate` deferred tool (Closes #84)
- Inconsistent Task tool parameter notation across 5 skills (`subagent_type=Explore` → `subagent_type: "Explore"`)
- Missing Context7 MCP plugin availability checks in spike and design-document skills
- Explicit `subagent_type: "feature-flow:task-verifier"` in verify-acceptance-criteria skill

## [1.19.0] - 2026-02-25

### Added
- **Shift quality enforcement upstream** — adds 5 intervention points plus 1 supporting infrastructure change to push quality constraints earlier in the lifecycle so code review confirms quality rather than discovering its absence. (1) Design document gains a required "Patterns & Constraints" section covering error handling strategy, type narrowness, performance constraints, and stack-specific patterns. (2) Design verification gains Batch 7 with 5 implementation-quality categories (type narrowness audit, error strategy completeness, function complexity forecast, edge case enumeration, stack pattern compliance). (3) Implementation plans gain per-task Quality Constraints sections via Writing Plans Quality Context Injection. (4) Implementer subagents receive coding standards, "How to Code This" notes, anti-patterns, and per-task quality constraints via Implementer Quality Context Injection. (5) verify-plan-criteria gains two new validation rules: Quality Constraints required per non-trivial task, and edge case criteria required for tasks handling input/external calls/data. (6) coding-standards.md gains HTML comment section markers for machine-consumable extraction. Closes #78.
- **GitHub Issue Dispatcher** (`dispatcher/` package) — a Python CLI tool that batch-processes GitHub issues through feature-flow's YOLO mode. Five-stage pipeline: issue selection (Textual TUI with SelectionList), AI-powered triage (claude -p with JSON schema validation and tier routing matrix), human review (DataTable TUI with tier cycling), automated execution (branch creation, claude -p headless mode, PR detection), and SQLite logging. Supports `--auto` mode for fully unattended operation, `--dry-run` for triage-only previews, `--resume` for recovering failed/leash-hit sessions, and progressive rate-limit backoff. Configurable via `dispatcher.yml` with CLI overrides. Installable as `pip install -e ".[dev]"` with `dispatcher` entry point. Closes #69.
- **Checklist-based code review agent prompts** — replaced open-ended role descriptions with specific 5-6 rule checklists per agent in the Phase 1 dispatch table, derived from coding-standards.md sections
- **Project context injection in agent prompts** — agents now receive relevant coding standards sections, stack patterns, acceptance criteria, anti-patterns, reference examples, and pre-filter exclusion context
- **Phase 0 deterministic pre-filter** — runs tsc, ESLint, or Biome before agent dispatch to catch linter-detectable issues first, then passes exclusion context to agents so they focus on logic and architecture
- **Structured output rejection filter in Phase 3** — findings missing required fields (file, line, rule, severity, fix) or containing vague commentary fixes are discarded before deduplication
- **Reference examples in Study Existing Patterns** — exemplary files identified during pattern study are carried forward to code review agents as "known good" patterns to check against
- **Agent-section mapping table in coding-standards.md** — maps each code review agent to the specific coding standards sections relevant to its specialty

### Fixed
- Dispatcher code review fixes: resume_issue arg ordering bug (made resume non-functional), bare KeyError/ValueError escapes, stash returncode ignored, overly broad exception catches, missing PR lookup on resume, branch-creation failures silently dropped from exit code

### Testing
- 71 tests covering all dispatcher modules including integration tests for full dry-run pipeline and async Textual TUI tests

### Documentation
- Add dispatcher label setup instructions to README
- Add design and implementation plan for dispatcher label setup documentation

## [1.18.0] - 2026-02-22

### Added
- **Context pressure signal in mode recommendation** — added estimated context pressure as a third signal alongside scope complexity and issue richness. Major Feature + Detailed Context now recommends Express instead of showing no recommendation (Neutral). Interactive recommendations at Feature or Major Feature scope with sparse context display a context warning about `/compact` pauses. Includes context pressure estimates table (scope × mode matrix) and Express-recommended option ordering. Closes #67.

### Fixed
- Clarified "all other cases" context note suppression reasoning to avoid implying pressure is always Low-Medium
- Replaced hardcoded "19-step lifecycle" in Express recommendation with platform-agnostic phrasing

## [1.17.0] - 2026-02-22

### Added
- **Fast-track lifecycle for small enhancements** — when a small enhancement has a linked issue with richness score 3+ (or equivalent detailed inline context), the lifecycle skips brainstorming, design document, and verify-plan-criteria, reducing the pipeline from 17 to 14 steps. Includes fast-track detection logic after issue richness scoring, a 14-step step list variant, updated checkpoint 2 trigger for fast-track path, fast-track scope upgrade rule (upgrades to "feature" if complexity is discovered), and decision log rows for YOLO/Express modes. Expected savings: ~3 minutes and 1-2M tokens per small feature session. Closes #59.

### Fixed
- **Worktree directory check false exit code** — replaced `ls -d` with `test -d` in the worktree setup override so directory existence checks no longer return false errors when a directory doesn't exist. Applied universally across all modes (YOLO, Express, Interactive). Closes #60.

## [1.16.0] - 2026-02-22

### Added
- **Scope-based code review pipeline tiering** — the code review pipeline now dispatches agents based on the lifecycle scope classification instead of always dispatching all available agents. Small enhancements use Tier 1 (2 agents: `superpowers:code-reviewer` + `silent-failure-hunter`), features use Tier 2 (4 agents: Tier 1 + `code-simplifier` + `feature-dev:code-reviewer`), and major features use Tier 3 (all 7 agents). Includes Quick fix guard (skips pipeline entirely), zero-agent guard (warns when all plugins unavailable), plugin unavailability handling in Phase 2, scoped deduplication priority chain, and tier context in all announcements and reports. Closes #58.

### Changed
- **Restructured run modes: YOLO / Express / Interactive** — replaced the three confusing mode options (YOLO with graduated checkpoints, YOLO with compaction, Interactive) with three clearly differentiated modes. YOLO is now truly unattended with zero pauses for all scopes (graduated checkpoints removed). Express (`--express`) replaces `--yolo-compact` — auto-selects all decisions but pauses for design approval (Feature/Major Feature) and at phase transitions for optional `/compact`. Interactive highlights the interview aspect in its description. Mode selection UX uses plain English descriptions with a footnote explaining `/compact` behavior. All YOLO override sections updated to also apply to Express mode. Decision log formats consolidated from three variants to two (YOLO and Express). Closes #61.

### Fixed
- Removed blank line breaking `### Added` list continuity in CHANGELOG

### Maintenance
- Migrated `context7` config from `.spec-driven.yml` to `.feature-flow.yml` and deleted stale config file
- Versioned `[Unreleased]` CHANGELOG section as `[1.15.0] - 2026-02-21`
- Tracked 5 previously-untracked plan docs from PRs 44-55
- Deleted orphaned `skills/start-feature/` directory, stale `https:` directory, and `superpowers/` worktree artifact
- Added missing `skills/session-report/CLAUDE.md`
- Pruned stale git worktrees

## [1.15.0] - 2026-02-21

### Added
- **Post-PR lifecycle steps** — adds three post-PR capabilities to the feature lifecycle: (1) new "Comment and Close Issue" inline step that posts a detailed implementation summary (PR number, what was built, acceptance criteria verified, key files changed) on the linked GitHub issue and closes it via `gh issue close` after PR creation, (2) configurable PR target branch detection via `default_branch` field in `.feature-flow.yml` with a 4-step cascade (config field → `git config init.defaultBranch` → staging branch → main/master fallback), replacing all hardcoded `main` references in git commands, (3) expanded completion summary with issue close status, PR target branch, worktree cleanup guidance, and actionable next steps. Uses `Related: #N` instead of `Closes #N` in PR body to prevent silent auto-close on merge. Closes #34.
- **Deno and Bun test runner detection** — `detectTestCommand()` in `hooks/scripts/quality-gate.js` now detects Deno projects (`deno.json` / `deno.jsonc`) and Bun projects (`bun.lockb` / `bun.lock` / `bunfig.toml`), verifying the runtime is installed before returning the test command. Missing runtimes emit a descriptive warning and skip gracefully. Extracted shared `detectRuntimeTestCommand` helper for consistent error handling across runtimes. Inline test detection list in `SKILL.md` updated to match. Closes #40.
- **Renamed plugin** from `spec-driven` to `feature-flow` — config file changed from `.spec-driven.yml` to `.feature-flow.yml`
- **Worktree env file copying** — adds a "Copy Env Files" inline step to the `start` lifecycle that runs after worktree setup and before study existing patterns. Copies non-production `.env*` files from the main worktree into new worktrees so baseline tests, tools, and dependency scripts have access to environment configuration. Excludes `.env.production*` variants (principle of least privilege) and `.env.example` (tracked by git). Silently skips when no env files exist. Implemented in feature-flow's `start` skill rather than modifying the superpowers `using-git-worktrees` skill.
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
- **Context window checkpoint prompts** — adds automatic `/compact` prompts at three natural phase transitions in the `start` lifecycle (after documentation lookup, after design verification, after commit planning artifacts). Introduces a third YOLO mode: "YOLO with compaction prompts" that auto-selects all decisions but pauses at phase transitions for optional context compaction. New `--yolo-compact` and `yolo compact mode` trigger phrases activate the mode. Checkpoint format uses `--- Context Checkpoint ---` blocks with context-specific focus hints. Scope-based filtering: quick fix gets no checkpoints, small enhancement gets 2, feature/major feature gets all 3. Suppression rules ensure plain YOLO mode skips checkpoints while interactive and compaction modes show them. Post-compact resume announces current step for re-orientation. New YOLO decision log variant tracks compaction checkpoint outcomes. Closes #33.

### Changed
- **Renamed `start-feature` skill to `start`** — the primary entry point command changes from `start feature: <description>` to `start: <description>`. Old trigger phrases ("start a feature", "build a feature", etc.) are preserved as aliases. SessionStart hook messages updated with getting-started hints showing the `start:` syntax and `--yolo` flag. Closes #53.
- `start` step lists updated: Quick fix (7 steps, was 6), Small enhancement (17 steps, was 16), Feature (18 steps, was 17), Major feature (19 steps, was 18)
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
- Batch 6 dispatch now specifies `subagent_type: "Explore"`, context specification, and concurrent launch with Batches 1-5
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
