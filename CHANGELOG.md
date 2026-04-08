# Changelog

All notable changes to the feature-flow plugin.

## [Unreleased]

### Added
- Feature-flow lifecycle now writes a versioned `feature-flow-metadata` YAML block inside an HTML comment to every PR body (opt-out via `lifecycle.metadata_block.enabled: false`). `/merge-prs` reads the block for dependency analysis and remediation de-duplication with graceful fallback to diff-based inference when the block is absent or unparseable. See `references/feature-flow-metadata-schema.md` for the full schema (#229).
- `.feature-flow.yml` schema: `lifecycle.harden_pr` (enabled, max_attempts, max_wall_clock_minutes, pause_on_unresolvable_conflict).
- `.feature-flow.yml` schema: `lifecycle.handoff.auto_invoke_merge_prs` (default `false`; set `true` in YOLO to restore legacy end-to-end auto-merge).
- `yolo.stop_after` enum: new values `harden_pr` and `handoff`.

### Changed
- **Lifecycle no longer auto-closes linked issues or auto-merges PRs (#228)**. Terminal phase is now `Harden PR` (bounded remediation loop) + `Handoff` (announces a ready-to-merge PR and stops). Issue closure happens via `Closes #N` in the PR body when the user merges.
- `feature-flow:start` and `feature-flow:merge-prs` are now independent entry points sharing one remediation knowledge base under top-level `references/`. `start` no longer invokes `merge-prs`.
- `merge-prs` no longer has a `Lifecycle Mode`. Standalone and Cross-Session modes remain; the post-merge `gh issue close` safety net is removed.
- `skills/start/references/yolo-overrides.md` PR body template uses `Closes #N` instead of `Related: #N`.

### Maintenance
- Moved `best-effort-remediation.md`, `ci-remediation.md`, `conflict-resolution.md`, and `review-triage.md` from `skills/merge-prs/references/` to top-level `references/`. Both `start` and `merge-prs` now consume the same files without cross-skill coupling. (`skills/merge-prs/references/dependency-analysis.md` is merge-prs-specific and stays in place.)
- `yolo.stop_after: ship` is deprecated as an alias for `handoff`; it will be removed in a future release.

## [1.34.0] - 2026-04-08

### Added
- **Graduated merge conflict resolution with test verification for merge-prs (GH225)** — Replaces the binary trivial/behavioral conflict classification with a **4-tier ladder** that attempts a complete resolution before pausing. **Tier 1** (unchanged) handles trivial cases (imports, lockfiles, adjacent additions, one-sided modifications, context-only keywords). **Tier 2** (NEW) handles structurally-independent both-sided modifications that the old behavioral keyword check would over-flag: it attempts an additive union merge, discovers the project's test runner (via optional `merge.conflict_resolution.test_command` override or stack-based detection for node-js lockfiles and python pytest config), runs tests under a hard wall-clock timeout (default 5 minutes via `merge.conflict_resolution.test_timeout_minutes`, macOS fallback to `gtimeout` or bash background-kill pattern), and commits with the literal message `merge: resolve conflict, verified by tests` if tests pass. On test failure it discards via `git checkout -- .` and escalates to Tier 3 with the captured test output. A new **Structural Independence Gate** determines Tier 2 eligibility: behavioral keywords present at non-overlapping positions → Tier 2 eligible; shared-line modifications (semantic overlap) → Tier 3 only. **Tier 3** (renamed from "Behavioral Conflicts") always pauses regardless of mode, including YOLO — the single non-negotiable safety invariant — and now shows the Tier 2 proposed resolution plus test output in the presentation with "Accept proposed" as the first `AskUserQuestion` option. **Tier 4** is skip-as-last-resort, only reached when Tier 3 is declined or manual resolution fails. Worktree flow and CWD Safety Guard at `SKILL.md:223-249` preserved byte-for-byte. New **Example 7** in `conflict-resolution.md` demonstrates both the Tier 2 success path (tests pass, commit) and the Tier 2-to-Tier 3 escalation path (tests fail, fall through). Two new config fields: `merge.conflict_resolution.test_command` (optional override) and `merge.conflict_resolution.test_timeout_minutes` (default 5, minimum 1). Consumes but does NOT modify `best-effort-remediation.md` or `ci-remediation.md`.
- **PR review and comment triage with best-effort remediation for merge-prs (GH226)** — Replaces the binary `CHANGES_REQUESTED` skip in `skills/merge-prs/SKILL.md` Step 4a with a single-pass triage flow that fetches all three feedback surfaces (inline review comments, discussion comments, formal reviews) via GraphQL `reviewThreads` and REST, filters stale threads (four-stage filter: outdated, resolved, self-reply, addressed-by-later-approval), classifies each unresolved thread into one of 6 priority-ordered categories (`blocker > suggestion > nit > question > praise > unclear`), and dispatches to per-category fix strategies. Blockers get minimal targeted fixes, `` ```suggestion `` blocks are applied verbatim, nits get typo/formatting fixes when obvious, questions get context-aware answers generated from code, praise is acknowledged, unclear threads escalate. Commits use the `fix:` prefix (distinct from CI's `fix(ci):`) and are grouped by `(reviewer, file)` tuple for attribution. Inline replies use `gh api ... -F in_reply_to=<databaseId>`; a single `@`-mentioned re-review comment is posted when blockers are addressed. Loop is single-pass (`MAX_ATTEMPTS=1`, `MAX_WALL_CLOCK=10min`) — unlike CI remediation's multi-attempt polling, review threads are atomic. Runs **before** CI remediation so fix commits trigger fresh CI that `ci-remediation.md` can then handle. New reference file `skills/merge-prs/references/review-triage.md` specializes the shared `best-effort-remediation.md` pattern from #224. New optional `merge.wait_for_rereview` config (default `false`) for opting into reviewer re-approval polling. Safety invariant: unfixable blockers never get merged over — YOLO skips, Express/Interactive pause.
- **Bounded CI failure remediation loop for merge-prs Ship phase (GH224)** — Replaces the one-shot "investigate once, fix trivial, skip unfixable" CI handling with a bounded diagnosis-and-fix loop. Each failing PR now gets up to 3 category-specific fix attempts within a 10-minute wall-clock budget (all configurable via `merge.ci_remediation`). Failures are classified into 8 categories (`lint-format`, `type-error`, `test-flaky`, `test-real`, `build`, `dependency-install`, `timeout-infra`, `unknown`), each with a targeted fix strategy. Flakes are first-class: transient timeout/network failures get a single automatic re-run via `gh run rerun --failed` before being classified as real test failures. Remediation commits use the `fix(ci):` prefix so they are greppable in `git log` and squash cleanly. New shared reference file `skills/merge-prs/references/best-effort-remediation.md` contains the bounded-attempt loop skeleton, mode-aware escalation contract, announcement templates, and skip/pause/escalate decision table — this file is the first of three sibling consumers (sibling issues #225 merge conflict ladder and #226 PR review triage will import it unchanged). New CI-specific reference `skills/merge-prs/references/ci-remediation.md` specializes the shared pattern with category detection heuristics, fix strategies, flake handling policy, commit message contract, and `gh pr checks` polling behavior. New `merge.ci_remediation` config subsection in `.feature-flow.yml` (`max_attempts: 3`, `max_wall_clock_minutes: 10`, `ci_poll_interval_seconds: 30`, minimum 10s to stay within GitHub API rate-limit floor). `merge-prs` SKILL.md Config table extended with `ci_remediation.*` fields for discoverability. Mode-aware behavior: YOLO applies all fixes automatically with announcements; Express confirms the first attempt then proceeds automatically; Interactive confirms each attempt with a diff.

### Changed
- `merge-prs` `skills/merge-prs/references/conflict-resolution.md`: renamed "Behavioral Conflicts" section to "Tier 3: Diff Presentation (Always Pauses)"; added 4-tier ladder overview at file top; promoted "Classification: Trivial vs Behavioral" H2 to "Tier 1: Trivial Auto-Resolve" with existing Tier 1 rules unchanged (GH225)
- `merge-prs` SKILL.md §Conflict Resolution: updated summary to describe the 4-tier ladder (Tier 1 → Tier 2 → Tier 3 → Tier 4) while preserving the worktree flow and CWD Safety Guard at lines 223-249 byte-for-byte (GH225)
- `merge-prs` SKILL.md Error Recovery table: replaced "Merge conflict, behavioral" row with two rows — "Merge conflict, structurally independent → Tier 2" and "Merge conflict, semantic overlap → Tier 3 (pause)" (GH225)
- `merge-prs` SKILL.md Config table: added `conflict_resolution.test_command` (optional Tier 2 test runner override) and `conflict_resolution.test_timeout_minutes` (default 5, minimum 1) config fields (GH225)
- Structure Classification routing in `conflict-resolution.md`: both-sided modifications with behavioral keywords now run through the Structural Independence Gate — gate passes → Tier 2 (test-verified additive merge), gate fails → Tier 3 (always pauses). Unknown/malformed structure routes conservatively to Tier 3 (GH225)
- `merge-prs` SKILL.md Step 4a review handling: replaced binary `CHANGES_REQUESTED` skip with single-pass review triage loop that runs before CI remediation
- `merge-prs` SKILL.md Error Recovery table: `Unresolved review requests` row now routes to the triage loop instead of blanket-skipping
- `merge-prs` SKILL.md Step 4a CI handling: replaced single-shot investigation with a bounded remediation loop reference
- `merge-prs` SKILL.md Error Recovery table: collapsed two `CI failing, trivial fix` / `CI failing, unfixable` rows into a single `CI failing` row that invokes the bounded loop
- `skills/merge-prs/references/best-effort-remediation.md`: review triage marked as a current consumer of the shared bounded-attempt pattern (previously listed as "future")

## [1.33.0] - 2026-04-07

### Added
- **Cross-PR import dependency analysis for merge-prs ordering (GH220)** — PRs whose changed files are imported by other PRs now merge first. New reference file `dependency-analysis.md` documents the algorithm, supported languages (JS/TS, Python, Go, Rust), and edge cases. Merge ordering priority list updated from 4 to 5 items — dependency constraints are now priority #1.
- **Structure-aware conflict classification pre-filter (GH221)** — Conflict classification now analyzes conflict *structure* (one-sided modification, adjacent additions, context-only keywords, both-sided modification) before checking for behavioral keywords. One-sided modifications and context-only keywords no longer trigger false behavioral escalations. Three reclassified examples added. Safety invariant preserved: true both-sided modifications with behavioral keywords still always pause for human review.

### Fixed
- False behavioral conflict escalations where one-sided modifications or context-only keywords triggered unnecessary human review pauses in merge-prs
- Standalone mode `all open` and `epic N` now run dependency analysis before merging
- Context lines in diffs no longer create false dependency edges

## [1.32.0] - 2026-04-07

### Added
- **Eliminate metadata file merge conflicts from parallel worktrees (GH217)** — `.feature-flow/` and `FEATURE_CONTEXT.md` are now session-local (not committed to feature branches), eliminating 80%+ of merge conflicts in parallel worktree workflows. New changelog fragment system writes per-PR entries to `.changelogs/<id>.md` instead of appending to `CHANGELOG.md` directly — fragments are consolidated into `CHANGELOG.md` by the Ship phase's new Step 6 (Changelog Consolidation). Worktree setup gains a gitignore safety check that auto-adds `.feature-flow/`, `FEATURE_CONTEXT.md`, and `DECISIONS_ARCHIVE.md` to `.gitignore` on first run. Sync with Base Branch no longer needs CHANGELOG auto-resolution logic. New optional `changelog.fragments_dir` config field in `.feature-flow.yml`.
- **Incremental quality gates after each implementation task (GH216)** — A new Post-Task Quality Gate runs typecheck, lint, and tests after each task's commits during the Implement step, catching errors when context is fresh instead of batching them at Final Verification. Uses the same linter/test-runner detection as the Stop hook quality gate (`quality-gate.js`) — no new config required for most projects. Lint is scoped to changed files for speed (ESLint, Biome). Tests run after typecheck passes (same sequencing as Stop hook). Gate failures pause YOLO and fix inline before proceeding to the next task. The `feature-flow-verified` marker is written on success, so Final Verification and the Stop hook skip redundant re-runs. Final Verification's skip logic extended to recognize post-task gate marker at HEAD with clean working tree. New optional `quality_gates:` config section in `.feature-flow.yml`: `after_task` (default: `true`), `scope_lint` (default: `true`), `skip_tests` (default: `false` — set to `true` for slow test suites).

### Changed
- `.feature-flow/` and `FEATURE_CONTEXT.md` are now session-local — not committed to feature branches
- Sync with Base Branch step simplified — no CHANGELOG-specific auto-resolution (fragments eliminate this conflict source)
- Archive phase context step simplified — `.feature-flow/` files no longer archived to session directory
- Knowledge base archival no longer commits `FEATURE_CONTEXT.md` and `DECISIONS_ARCHIVE.md` to git

### Removed
- CHANGELOG.md row from merge-prs trivial conflict resolution table
- CHANGELOG.md auto-resolution logic from Sync with Base Branch step
- Deferred-write caveats from Design document and Design verification skill mapping entries

## [1.31.0] - 2026-04-06

### Added
- **Merge-PRs Ship phase integration (GH214)** — New `feature-flow:merge-prs` skill integrates the standalone merge-prs orchestration into the feature-flow lifecycle as an optional "Ship" phase. Discovers open PRs via GitHub `feature-flow` label (applied automatically during PR creation), orders them optimally (independent first, foundation before dependents, passing CI first), and merges sequentially with conflict detection. Trivial conflicts (imports, whitespace, lock files, CHANGELOG) auto-resolve; behavioral conflicts (function bodies, conditionals, API contracts, schemas) always pause for human confirmation — even in YOLO mode. Three invocation modes: lifecycle (auto from start), standalone (`merge-prs 185 186`), cross-session (`merge-prs feature-flow`). Ship phase added to Feature (step 21) and Major feature (step 22) step lists. New optional `.feature-flow.yml` `merge:` config section (strategy, delete_branch, require_ci, require_review, auto_discover). PR body markers (`<!-- feature-flow-session -->`, `<!-- feature-flow-design-doc: path -->`) enable design-doc-aware conflict resolution. Continue-on-failure error recovery — skips problematic PRs, reports at end. `pr` added to Lifecycle Context Object. `ship` added to YOLO `stop_after` valid values.

## [1.30.0] - 2026-04-04

### Added
- **Assumption verification in design-verification — Batch 9, Category 25 (GH212)** — Design-verification now checks external assumptions alongside codebase checks. When a design references external APIs, OAuth endpoints, or cross-service patterns ("same as X"), a new Batch 9 agent fetches live discovery documents, compares against the design, and reports CONFIRMED/DENIED/DIFFERS findings. Conditionally dispatched — skipped with PASS for internal-only designs. New `assumptions-only` flag enables standalone invocation via "check my assumptions" or "what am I assuming" (skips Batches 1-8, runs only Batch 9). Includes reference files for assumption verification patterns (OAuth/OIDC, REST, cross-service, data, library, environment, prior-session, codebase) and discovery endpoints (FHIR, OAuth, REST/OpenAPI, GraphQL, gRPC, cloud services). Examples diversified across FHIR, Stripe, GitHub API, and generic REST.

## [1.29.1] - 2026-04-01

### Added
- **Standards Cross-Check step in design-document skill (GH206)** — New Step 6 reads project-specific standards files (architecture docs, coding conventions) and verifies design specs against them before suggesting next steps. Conflicts are reported as an Issue/Source/Fix table. In YOLO/Express mode, concrete fixes are auto-applied to the design document. First-run auto-discovery scans `.claude/`, `docs/`, and project root for common standards filenames and writes selections to `.feature-flow.yml` under the new `standards` namespace (`enabled` boolean + `files` list). `/settings` gains a "Standards" option in the Design category for adding, removing, and toggling standards files.

## [1.29.0] - 2026-04-01

### Added
- **Dynamic plugin scanning and registry (GH207)** — Replace hardcoded plugin checks with a dynamic scanning system that discovers all installed Claude Code plugins at lifecycle start. Scans `~/.claude/plugins/cache/`, classifies plugin capabilities via keyword matching into 8 lifecycle roles, and persists results in `.feature-flow.yml` under `plugin_registry`. Includes content hash fast path (SHA-256) to skip unchanged plugins, marketplace-namespaced registry keys to prevent collisions, fallback namespace-prefix validation for base plugins, and first-run bootstrap for fresh installs. Code review pipeline now dispatches discovered plugins as Tier 3 agents. New `/settings` Plugins submenu for viewing registry, rescanning, overriding roles, excluding plugins, and resetting overrides. Schema documented in `project-context-schema.md` with 6 enum types.

## [1.28.2] - 2026-03-24

### Fixed
- **Worktree cleanup CWD destruction bug** — Worktree removal commands could run while CWD was inside the worktree being removed, causing "fatal: Unable to read current working directory" and an unrecoverable Claude Code session crash. Added "Never destroy your own CWD" quality rule requiring `cd` to parent repo root before any `git worktree remove`. YOLO finishing-branch override now explicitly prohibits merging PRs or removing worktrees — lifecycle ends at PR creation. Dispatcher `remove_worktree()` now accepts optional `repo_root` and always sets `cwd`.

## [1.28.1] - 2026-03-18

### Added
- **`/settings` slash command for interactive configuration management (GH204)** — New `skills/settings/SKILL.md` skill provides a show-then-edit dashboard for all 9 user-editable `.feature-flow.yml` settings. Settings are grouped into 3 categories (Workflow, Design, Advanced) respecting AskUserQuestion's 4-option limit. Supports inline editing with immediate YAML persistence, save-and-return loop, notification hook side-effects, and error recovery (malformed YAML recreate, Edit-to-Write fallback). Includes a new `yolo.stop_after` schema field for configurable YOLO stopping points — users can pause YOLO at brainstorming, design, verification, or plan phases for review. The `tool_selector` field is now documented in `project-context-schema.md`. Start skill gains checkpoint logic in the Step 3 execution loop that honors `stop_after` (YOLO-only, Express excluded).

## [1.27.0] - 2026-03-14

### Added
- **Wait for CI and address review bot comments (GH200)** — New lifecycle step "Wait for CI and address reviews" runs after PR creation. Phase 1 polls `gh pr checks` until all CI checks complete. Phase 2 detects review bot history on recent PRs, waits for the bot review to appear on the current PR, addresses inline comments (fix or decline with rationale), posts a review thread reply for each inline comment, and pushes a single fix commit. CI and bot review waits are fully decoupled — review bots like Gemini Code Review may post 5+ minutes after CI clears. Bot detection uses `user.type == "Bot"` (no hardcoded names). Configurable timeout via `ci_timeout_seconds` in `.feature-flow.yml`.
- **Sync base branch with remote before worktree creation (GH198)** — New Step 0 sub-step fetches origin and fast-forward updates the local base branch before creating the worktree, preventing stale-base conflicts. Session `d07f7109` spent 42% of its time resolving rebase conflicts caused by a stale local branch.
- **Merge-first integration strategy (GH198)** — End-of-lifecycle sync changed from `git rebase` to `git merge` as the default. Merge resolves conflicts in a single pass vs N rounds for rebase. Configurable via `git_strategy: merge | rebase` in `.feature-flow.yml`. Dispatcher `create_branch()` now uses `origin/<base_branch>` as the start point.
- **Session report pricing fix (GH199)** — Fixed 3x cost overcharge for Opus 4.6 sessions. The pricing table matched `"opus-4"` (Opus 4.0 at $15/$75 MTok) for `claude-opus-4-6` instead of the correct $5/$25 MTok. Added specific entries for all 4.6/4.5 models.

## [1.26.0] - 2026-03-14

### Changed
- **Opus orchestrator with per-phase model routing (GH190)** — The orchestrator now runs on Opus 4.6 (`claude-opus-4-6`, 1M context, standard pricing) for the full session. In YOLO mode, brainstorming and design document phases are dispatched as `Task(model: "opus")`, planning as `Task(model: "sonnet")` — giving full per-phase model control regardless of orchestrator model. Interactive/Express modes use inline Skill calls that inherit the parent model. The old Sonnet-first philosophy is retired; cost optimization comes from subagent routing (haiku/sonnet via explicit Task `model` params), not orchestrator model switching.
- **`/model` command permanently removed from lifecycle (GH190)** — All `/model opus` and `/model sonnet` hints deleted from orchestration-overrides.md and project-context.md. The `/model` command writes to `~/.claude/settings.json` (a global config file) affecting all terminal windows and tmux panes. Session model is now controlled exclusively via `--model` startup flag or the default.
- **Compaction checkpoints removed (GH190)** — The 4 compaction checkpoints that paused the lifecycle to suggest `/compact` are no longer needed with Opus 1M context. A full session runs 300-500K tokens, well under the 1M ceiling. Express Design Approval checkpoint preserved (serves a different purpose). Session-report compaction tracking preserved for observability.
- **Dispatcher model IDs updated to Claude 4.6 (GH192)** — `claude-opus-4-20250514` → `claude-opus-4-6`, `claude-sonnet-4-20250514` → `claude-sonnet-4-6` across dispatcher.yml, config.py, models.py, tests, and README.

### Added
- **PreToolUse hook enforcing explicit `model` param on Task dispatches (GH191)** — New hook blocks any `Task` or `Agent` dispatch missing an explicit `model` parameter, preventing silent Opus inheritance on subagents (8-10x cost increase per dispatch). Both `Agent` and `Task` matchers included for defense-in-depth.

## [Unreleased]

### Added
- **Cross-feature dependency detection in `dispatcher/dependencies.py` (GH174)** — new module parses `depends on #N` / `blocked by #N` patterns (case-insensitive) from issue bodies via `extract_deps()`, builds an adjacency graph with `build_dep_graph()`, computes topological execution waves via `dep_waves()` (Kahn's algorithm, raises `CycleError` on cycles including self-loops), and identifies unmet dependencies with `find_unmet()` (closed issues are treated as satisfied). The pipeline's `_check_dependencies()` runs after triage, before review; in auto mode it reorders `to_execute` into dependency waves and prints each wave. Cycles are caught and logged as warnings — execution continues in original order. Out-of-batch dependencies emit a warning but do not block. `ReviewApp` gains a "Deps" column in the `DataTable` and a `Static` warning banner (hidden when no unmet deps exist). `SelectionApp` appends a ` → needs #N` suffix to issues with unresolved dependencies. `github.view_issue()` now fetches the `state` and `number` fields to support closed-dep satisfaction logic. (Closes #174)

## [1.25.0] - 2026-03-11

### Added
- **Wave-based parallel task execution via `dispatcher/wave_planner.py` (GH167)** — new CLI tool reads a plan file (prose or XML format), parses explicit task dependency declarations (`- Depends on: Task N, Task M` in Quality Constraints blocks for prose; `depends_on="N,M"` attribute on `<task>` elements for XML), runs Kahn's topological sort with DFS cycle detection, and outputs ordered execution waves as JSON (`{"waves": [[task_ids...], ...], "errors": [...], "has_explicit_deps": bool}`). Exit 0 on success, exit 1 on cycles or invalid dependency references. Code-fence tracking prevents false matches on documentation examples. The `subagent-driven-development` orchestrator's Phase A is updated to call `wave_planner.py` first and use `has_explicit_deps: true` to skip existing heuristic phases B–D. `verify-plan-criteria` gains Step 5.5 to validate dependency graphs. `references/xml-plan-format.md` documents the new `depends_on` attribute. Both syntaxes are additive — all existing plans work without modification. (Closes #167)

### Changed
- **Split `references/xml-plan-format.md` to comply with 300-line guideline (GH182)** — extracted the Detection Algorithm, Error Handling, and Edge Cases sections (~77 lines) into a new `references/xml-plan-format-runtime.md`, reducing the main file from 341 to 271 lines. The main file now contains a `<!-- section: runtime-reference -->` cross-reference block. Updated `skills/verify-plan-criteria/SKILL.md`, `skills/verify-acceptance-criteria/SKILL.md`, and `skills/start/references/yolo-overrides.md` to reference both files. (Closes #182)

### Added
- **Phase-specific context files for lifecycle discoveries (GH171)** — introduces `.feature-flow/design/` and `.feature-flow/implement/` directories that capture discoveries and decisions during feature development. Four context files are initialized at worktree setup from templates in `references/phase-context-templates.md`: `design-decisions.md` (scope and approach choices), `verification-results.md` (design verification blockers and resolutions), `patterns-found.md` (codebase patterns discovered during study), and `blockers-and-resolutions.md` (implementation blockers and how they were resolved). The start skill's Worktree setup step, Design document step, and Design verification step each append to their respective context files. The Study Existing Patterns inline step appends pattern findings to `patterns-found.md`. A new `## Blocker Logging` section in `inline-steps.md` instructs the orchestrator to log blockers to `blockers-and-resolutions.md` immediately when surfaced and update entries upon resolution. In YOLO/Express mode, the Finishing a Development Branch override archives context directories to `.feature-flow/sessions/{date}-{branch}/` before PR creation and injects an `## Implementation Context` section into the PR body with selective excerpts (Key Decisions, blockers found, How to Code This — omitting files with only template placeholder text). (Related: #171)
- **Design preferences preamble for Feature/Major Feature brainstorming (GH170)** — for Feature and Major Feature scopes, the brainstorming lifecycle now captures 5 project-wide design preferences (error handling pattern, API style, state management, testing approach, UI component pattern) before feature-specific questions begin. Preferences are stored in `.feature-flow.yml` under `design_preferences` and loaded silently on subsequent runs. Stack-filtered options hide irrelevant choices (e.g., server actions only shown for `next-js` stacks, Q5 skipped for backend-only stacks). YOLO/Express mode infers preferences from the codebase via 5 grep-based scan methods and announces each inference. A per-feature override injects session-level context without writing back to the config. Design verification gains Category 24 "Design Preferences Compliance" (Batch 8) which emits WARNING-level findings when the design uses a different pattern than declared without acknowledgment. `design_preferences` absent → preamble fires; present → load silently. (Closes #170)
- **Smarter context filtering for design-verification agents** — Step 3 now dispatches 5 parallel tagged exploration agents (schema, pipeline, ui, config, patterns) instead of a single flat dump, and Step 4 batch agents each receive only the domain-relevant subset of exploration results per a Context Filter Map table. Reduces wasted context: Batch 1 (Schema & Types) receives only `schema`, Batch 5 (Structure & Layout) receives only `ui`, etc. No behavioral change to verification output. (Closes #168)
- **Optional XML-hybrid plan format** — Plan files may now open with `<plan version="1.0">` to enable machine-readable structure for task metadata. XML wraps task status (`status="pending|in-progress|done"`), file references (`<file action="create|modify" path="...">`), and acceptance criteria (`<criterion>` with `<what>/<how>/<command>` children) while keeping prose content (quality constraints, steps, rationale) as plain markdown inside `<task>` blocks. Detection scans only the first 50 non-fenced lines; any plan without `<plan version="` is parsed by the existing prose parser unchanged. Malformed XML (unclosed `<task>`, unclosed `<criteria>`, duplicate task IDs, missing `</plan>`) triggers a full fallback to prose mode with a specific log message. (Closes #166)
- **`references/xml-plan-format.md`** — Canonical reference for the XML plan format. Documents the full schema (root, task, title, files, criteria elements and their required attributes), detection algorithm with code-fence tracking and truncation guard, two-tier error handling (structural failures fall back to prose; per-criterion flags are reported inline without abandoning XML mode), edge cases table, `[MANUAL]` / `type="manual"` equivalence, authoring guide, and v1 constraints (no split plan support; export CLI deferred). (Closes #166)
- **XML detection and extraction in `verify-plan-criteria` and `verify-acceptance-criteria`** — Both skills now detect XML plans using `/^<plan version="/` (anchored, outside code fences, first 50 lines) and extract structured data from XML attributes and child elements. Task status is read from the `status=` attribute, files from `<file action path>` elements, and criteria from `<criterion>` / `<criterion type="manual">` children. A `status=` update path is offered after a task passes instead of prose checkbox edits. (Closes #166)
- **XML plan test fixtures** — `tests/fixtures/sample-xml-plan.md` and `tests/fixtures/sample-prose-plan.md` provide canonical reference examples for both plan formats. (Closes #166)
- **Atomic git commit guidelines** — introduces `references/git-workflow.md` with Conventional Commits format template (`feat(scope): description — ✓criterion`), step-by-step atomic commit workflow (one commit per acceptance criterion), and `git-bisect` integration docs. Updated `yolo-overrides.md` to inject Atomic Commit Protocol as item 7 in implementer quality context, and cross-referenced `git-workflow.md` in `inline-steps.md` commit steps. (Related: #169)
- **Structured acceptance criteria format enforcement in `verify-plan-criteria`** — Step 3 now checks that every non-`[MANUAL]`, non-completed criterion contains both `measured by` and `verified by` keywords. Non-conforming criteria are flagged with a message referencing `references/acceptance-criteria-patterns.md`. Already-completed (`- [x]`) and `[MANUAL]`-prefixed criteria are exempt. All 9 Step 4 draft templates updated to produce structured `[WHAT] measured by [HOW] verified by [COMMAND]` criteria instead of plain-text descriptions. (Closes #173)
- **`references/acceptance-criteria-patterns.md` reference document** — authoritative definition of the `[WHAT] measured by [HOW] verified by [COMMAND]` format, including a good-vs-bad examples table, 7 common pattern templates (file existence, command passes, typecheck, lint, export presence, content presence, test suite), `[MANUAL]` prefix usage guide, and an anti-patterns table. Uses `<!-- section: slug -->` markers for programmatic extraction. (Closes #173)
- **Automated failure diagnosis in `task-verifier`** — when a `verified by [COMMAND]` fails, the agent now automatically diagnoses the root cause and suggests a fix. A new Step 3 (Diagnose Failures) runs pattern-matching across 9 known error patterns (missing imports, type mismatches, undefined variables, lint violations, test assertion failures, missing files, runtime errors, and TypeScript catch-all), a similar-pattern Grep search for type errors, and an LLM fallback for unrecognized errors. Results appear in a new Diagnosis column in the verification report, with suggested fixes surfaced inline in the INCOMPLETE branch of `verify-acceptance-criteria`. Zero overhead on passing commands — diagnosis triggers only on failure. (Closes #172)

## [1.24.1] - 2026-03-09

### Added
- **Context Engineering & Knowledge Base (GH165):** Per-feature `FEATURE_CONTEXT.md` persists curated decisions across sessions. The start skill's Step 0 pre-flight loads the file, archives decisions older than 14 days (or when the file exceeds 150 lines), injects remaining decisions into the lifecycle context, and prints a resume notice. `FEATURE_CONTEXT.md` is created automatically at worktree setup. Configurable via `.feature-flow.yml` `knowledge_base.max_lines` and `knowledge_base.stale_days`.

## [1.23.7] - 2026-03-09

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
- **Fix agent-based plugin detection in `start` skill pre-flight** — the pre-flight check for `backend-api-security` used namespace-prefix detection (scanning the skill list for `backend-api-security:*` entries) which fails for plugins that expose agents instead of skills. Added fallback detection via `find ~/.claude/plugins/cache -maxdepth 3 -name backend-api-security -type d 2>/dev/null | head -1` — if the plugin directory exists in the cache, it is considered installed regardless of whether it exposes skills with a namespace prefix. (Closes #153)
- **Post-compaction tool parameter type reminders** — Added explicit type reminder blocks to compaction-resistant locations: (1) Progress Index "For Claude:" callout template in `yolo-overrides.md` (both standard and split-plan variants), so every generated plan file carries the reminder at the post-compaction re-entry point; (2) new `### Tool Parameter Types` subsection in `SKILL.md` Pre-Flight Check, visible at lifecycle start. Covers three parameters observed causing post-compaction type confusion: `Edit` `replace_all` must be boolean (not string), `Read` `offset`/`limit` must be numbers (not strings). (Closes #154)

### Added
- **Split large implementation plans into per-phase files** — `writing-plans` quality context injection now enforces a 15,000-word size constraint. Plans exceeding the threshold are split into a lightweight index file (with Progress Index and `## Phase Manifest` table) plus per-phase detail files, preventing Read token limit failures that caused cascading tool-call cancellations. (Closes #155)
- **Subagent-driven-development split plan reading protocol** — orchestrator now detects split plans via `## Phase Manifest`, loads the correct phase file before each implementer dispatch, and maintains the Progress Index in the index file only. Includes fallback for older plans without `— Phase:` annotations. (Closes #155)
- **verify-acceptance-criteria split plan support** — skill now detects split plans via `## Phase Manifest`, reads all phase files, and extracts acceptance criteria from them. Labels task criteria with source phase file (e.g., `Task 1 [from phase-1]`) for traceability. (Closes #155)
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
- **`Parallelizable:` field requirement in Writing Plans Quality Constraints** — implementation plans must now include a `Parallelizable:` field in each task's Quality Constraints section, declaring whether the task can execute concurrently with others (`yes` / `no` / `unknown`). `unknown` defaults to sequential unless promoted by the orchestrator's minimum threshold rule. The `subagent-driven-development` orchestrator reads this field during its Parallelization Protocol to group tasks into execution waves. (Closes #156)
- **Parallelization Protocol in Subagent-Driven Development YOLO Override** — orchestrator now runs a four-phase analysis before the task loop: Phase A (dependency analysis using `Parallelizable:` field and `Files modified` fallback), Phase B (mechanical classification: ≤2 files + pattern match + no complexity keywords), Phase C (execution waves: Wave 1 = independent mechanical tasks dispatched as parallel `Task()` calls in a single message; Wave 2+ in dependency order), Phase D (minimum threshold: plans with >5 tasks promote border-case tasks to reach ≥50% parallel dispatch). Safety constraint prevents parallel dispatch of tasks sharing file dependencies. (Closes #156)
- **Descriptive option descriptions and recommendations in all interactive-mode AskUserQuestion calls** — 12 `AskUserQuestion` calls across 9 skill files (`session-report`, `spike`, `design-verification`, `create-issue`, `start/project-context`, `start/step-lists`, `start/orchestration-overrides`, `start/inline-steps`, `verify-plan-criteria`) were missing `with description:` fields or recommendation markers. All options now have descriptions explaining consequences, and the most common/safe option in each question is marked `*Recommended — [reasoning]*` consistent with the convention in `start/SKILL.md`. (Closes #163)

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
- **Standardize Recommended format in step-lists skip option** — `"Skip — continue without installing"` description updated from `"Proceed with currently installed plugins only"` to `*Recommended — proceed with currently installed plugins; install more later if needed*` matching the standard recommendation format. (Closes #163)

### Changed
- **Deduplicate YOLO execution continuity instructions into Turn Bridge Rule** — the "always call `TaskUpdate` to keep your turn alive" pattern was repeated 5+ times throughout the `start:` skill. Consolidated into a single named **Turn Bridge Rule** defined in Step 3's YOLO Execution Continuity section, with all inline occurrences replaced by one-line references. Reduces token overhead and improves scannability. (Closes #139)

### Documentation
- **`notifications` field in `references/project-context-schema.md`** — documents the new `notifications.on_stop` field (`bell | desktop | none`), its read/write semantics, YAML example, and the semantic distinction between `on_stop: none` (explicitly declined) vs field absent (not yet prompted). Updates the `start (reads + writes)` section. (Closes #113)

### Maintenance
- **Bump version to 1.22.3** — `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and `.feature-flow.yml` updated to reflect the new plugin version.
- Bump version to 1.23.4

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
