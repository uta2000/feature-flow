# Inline Step Definitions

Reference file for the start skill lifecycle orchestrator. Each section contains the full instructions for an inline step (no separate skill invocation).

**Usage:** The orchestrator reads the relevant section when reaching that lifecycle step.

---

## Documentation Lookup Step

This step queries Context7 for current patterns relevant to the feature being built. It runs between brainstorming and the design document to ensure the design uses up-to-date patterns.

**Prerequisites:**
- The Context7 MCP plugin must be available (`context7@claude-plugins-official`)
- `.feature-flow.yml` must have a `context7` field (populated during auto-detection)

**If Context7 is not available:** Skip this step silently. Announce: "Context7 not available — skipping documentation lookup. Proceeding with stack reference files only."

**Process:**
1. From the brainstorming output, identify which stack technologies are relevant to this feature (e.g., a new API route touches Next.js + Supabase; a UI change touches Next.js only)
2. Read the `context7` field from `.feature-flow.yml` to get library IDs for relevant stacks
3. Query each relevant Context7 library using `mcp__plugin_context7_context7__query-docs` with a focused query about the feature's specific needs:
   - Example: building a new API route → query `/vercel/next.js` for "server actions error handling revalidation"
   - Example: adding a new table → query `/supabase/supabase-js` for "typed queries insert RPC" and `/websites/supabase` for "RLS policies migration"
4. Synthesize the results into a concise summary of recommended patterns
5. Pass these patterns to the design document step as context

**Output format:**
```
## Documentation Lookup Results

### [Stack Name] — Current Patterns
- [Pattern 1]: [code example or description]
- [Pattern 2]: [code example or description]

### Gotchas from Docs
- [Any deprecation warnings or common mistakes found in the docs]
```

**Quality rules:**
- Query at most 3 libraries per feature (focus on the most relevant)
- Keep queries specific to the feature, not generic
- If the docs contradict the stack reference file, note the discrepancy

## Copy Env Files Step

This step runs after worktree setup and before study existing patterns. It copies non-production `.env*` files from the main worktree into the new worktree so that tests, tools, and dependency scripts have access to environment configuration.

**Process:**
1. Locate the main worktree root:
   ```bash
   MAIN_WORKTREE=$(git worktree list --porcelain | head -1 | sed 's/^worktree //')
   ```
2. Copy non-production env files:
   ```bash
   for f in "$MAIN_WORKTREE"/.env*; do
     [ -f "$f" ] || continue
     name=$(basename "$f")
     case "$name" in
       .env.production|.env.production.local|*.production|*.production.*) continue ;;
       .env.example) continue ;;
     esac
     cp "$f" "./$name"
   done
   ```
3. **If env files were copied:** Announce what was copied: `"Copied N env files from main worktree: .env .env.local"`
4. **If no env files exist:** Silent skip — not all projects use env files. Do not warn or error.

**Why before study existing patterns:** Ensures environment variables are available for implementation, test runs, and any tools that depend on env configuration later in the lifecycle. Production files are excluded as a safety measure (principle of least privilege).

**What is skipped and why:**
- `.env.production`, `.env.production.local`, any `*.production` or `*.production.*` — never propagate production secrets to development worktrees
- `.env.example` — tracked by git, already present in the worktree automatically

**Hook interaction:** This step accesses `.env*` files, which may trigger security alerts from PreToolUse hooks or system-level .env protection. This is expected — the step only copies non-production env files (production files are explicitly excluded). If a security alert fires, acknowledge it and proceed — this is a known-safe operation that only copies development env files. Do NOT stop the lifecycle or ask the user for confirmation. If the user has a hook that blocks `.env` access entirely, announce: "The .env copy step was blocked by a security hook. You may need to manually copy .env files to the worktree, or whitelist this operation in your hooks configuration."

---

## Study Existing Patterns Step

This step runs after copy env files and before implementation. It forces reading the actual codebase to understand how similar things are done before writing new code. This prevents "vibing" — writing code that works but doesn't follow the project's established patterns.

**Process:**
1. Read `../../references/coding-standards.md` to load the senior-engineer principles
2. Identify the areas of the codebase that will be modified or extended (from the implementation plan)
3. **Parallel dispatch** — For each identified area, dispatch one Explore agent to read 2-3 example files and extract patterns. Each agent also flags anti-patterns (files >300 lines, mixed concerns, circular dependencies, duplicated logic).

   Use the Task tool with `subagent_type: "Explore"` and `model: "haiku"` (per Model Routing Defaults; see `../../references/tool-api.md` — Task Tool for parameter syntax). Launch all agents in a **single message** to run them concurrently. Sequential dispatch wastes N-1 parent API turns — all N agents must appear in one message. Announce: "Dispatching N pattern study agents in parallel..."

   **Context passed to each agent:**
   - Area name and file paths/directories to examine
   - Instructions: read 2-3 example files, extract file structure, error handling, naming conventions, and state management patterns
   - Instructions: flag anti-patterns — files exceeding 300 lines (god files), mixed concerns, circular dependency imports, duplicated logic
   - Instructions: before reading any file, check its size with `wc -c <file>`. If >200KB, use Grep to find relevant sections instead of reading the whole file, or use Read with offset/limit parameters targeting the specific functions/components being studied.
   - Instructions: identify 2-3 exemplary files per area that best demonstrate the project's patterns — these will be passed to code review agents as "known good" reference examples

   **Expected return format per agent:**

   ```
   { area: string, patterns: [{ aspect: string, pattern: string }], antiPatterns: [{ file: string, issue: string, recommendation: string }], referenceExamples: [{ file: string, aspects: string }] }
   ```

   **Failure handling:** If an agent fails or crashes, retry it once. If it fails again, skip that area and log a warning: "[Area] pattern study failed — skipping. Continuing with available results."

4. **Consolidation** — Merge all agent results into the following sections:

**Output format:**
```
## Existing Patterns Found

### [Area: e.g., API Routes]
- File structure: [how existing routes are organized]
- Error handling: [how existing routes handle errors]
- Response format: [what shape existing routes return]
- Auth pattern: [how auth is checked]
- Reference examples:
  - `[file path]` ([aspects this file exemplifies])
  - `[file path]` ([aspects this file exemplifies])

### [Area: e.g., Components]
- State management: [local state vs hooks vs context]
- Loading states: [how loading is shown]
- Error states: [how errors are displayed]
- Reference examples:
  - `[file path]` ([aspects this file exemplifies])
  - `[file path]` ([aspects this file exemplifies])

### Coding Standards to Follow
- [List relevant items from coding-standards.md for this feature]
```

   **Anti-Patterns Found (do NOT replicate):**

```
### Anti-Patterns Found (do NOT replicate)
- `[file]` ([N] lines) — [issue]. [recommendation].
```

5. **Generate "How to Code This" notes** for each task in the implementation plan. For each task, write a brief note mapping the task to the patterns found:

```
## How to Code This (per task)

### Task 1: [title from implementation plan]
- Follow pattern from: [existing file that does something similar]
- Error handling: [specific pattern to use, from the patterns found above]
- Types: [specific types to import or generate]

### Task 2: [title]
- Follow pattern from: [existing file]
- State management: [specific approach matching existing patterns]
```

6. **Write to context file.** After generating the "How to Code This" notes, write the full findings (Existing Patterns Found, Anti-Patterns, How to Code This) to `.feature-flow/implement/patterns-found.md`. Append to the existing file rather than overwriting, so multiple study passes accumulate.

7. Pass these patterns, the "How to Code This" notes, anti-pattern warnings, AND reference examples from the consolidated output to BOTH the implementation step AND the code review pipeline step as mandatory context. **New code MUST follow these patterns unless there is a documented reason to deviate.** The code review pipeline uses reference examples to check new code against known-good patterns.

**Quality rules:**
- Read at least 2 existing files per area being modified
- Don't just skim — understand the pattern deeply enough to replicate it
- If existing patterns conflict with coding-standards.md, note the conflict and follow the existing codebase pattern (consistency > purity)
- If existing patterns conflict with structural quality (god files, tight coupling), document the conflict. New code follows the better pattern, not the existing anti-pattern. Note: this is the ONE exception to the "consistency > purity" rule — structural anti-patterns should not be replicated even for consistency.

---

## Post-Task Quality Gate

After all acceptance criterion commits for a task are complete, run a lightweight quality gate before proceeding to the next task.

**When to run:** Once per task, after the last criterion commit for that task. Not after every individual criterion commit — only after the task boundary.

**Skip condition:** Read `quality_gates.after_task` from `.feature-flow.yml`. If explicitly set to `false`, skip this gate silently for all tasks and announce once at the start of the Implement step: "Post-task quality gate disabled via `quality_gates.after_task: false`."

**Process:**

1. **Announce start:**
   ```
   Post-task quality gate — Task N: [task title]
   ```

2. **Detect changed files for this task** (to scope lint):
   ```bash
   # Count commits since the previous task gate (or branch start for Task 1)
   git diff --name-only HEAD~<N>..HEAD
   ```
   where `<N>` = number of criterion commits in the current task (tracked from the atomic commit workflow). Store the resulting file paths as `CHANGED_FILES`.

3. **Run TypeScript check** (if `tsconfig.json`, `tsconfig.app.json`, or `tsconfig.build.json` exists and `node_modules/.bin/tsc` exists):
   ```bash
   npx tsc --noEmit --project <tsconfig>
   ```
   Full project check — incremental tsc is already fast and needs cross-file context.

4. **Run lint check** (scoped to changed files when `quality_gates.scope_lint` is `true`, default `true`):
   Use the same linter detection as `hooks/scripts/quality-gate.js` `checkLint()`:
   - If `package.json` has a `lint` script: run `npm run lint` (unscoped — custom scripts may have their own scope)
   - Else if `node_modules/.bin/eslint` exists and ESLint config present: `npx eslint <CHANGED_FILES>`
   - Else if `node_modules/.bin/biome` exists and Biome config present: `npx biome check <CHANGED_FILES>`
   - Else: skip lint (no supported linter detected)

   When `quality_gates.scope_lint` is `false`, run all linters on the full project (pass `.` instead of `<CHANGED_FILES>`).

5. **Run tests** (only if TypeScript check passed; skip if `quality_gates.skip_tests: true`):
   Use the same test command detection as `hooks/scripts/quality-gate.js` `detectTestCommand()`:
   - `package.json` has `test` script (and not "no test specified") → `npm test`
   - `Cargo.toml` exists → `cargo test`
   - `go.mod` exists → `go test ./...`
   - `mix.exs` exists → `mix test`
   - `pyproject.toml`, `pytest.ini`, `setup.cfg`, or `tox.ini` exists → `python -m pytest`
   - `deno.json` or `deno.jsonc` exists → `deno test`
   - `bun.lockb`, `bun.lock`, or `bunfig.toml` exists → `bun test`
   - Else: skip tests (no test runner detected)

6. **On success:** Write the verification marker:
   ```bash
   git rev-parse HEAD > "$(git rev-parse --git-dir)/feature-flow-verified"
   ```
   Announce:
   ```
   Post-task gate ✓ — Task N passed. Proceeding to Task N+1.
   ```

7. **On failure:** Announce clearly:
   ```
   Post-task quality gate FAILED after Task N. Fix before proceeding.
   [TSC] 2 type errors
     src/foo.ts:12:4 — Cannot find name 'Bar'
   [LINT] ESLint errors
     src/foo.ts:8:1 — 'unused' is defined but never used
   ```
   Then:
   a. Fix the errors immediately (same task context is still active — do not defer)
   b. Commit the fix: either amend the last criterion commit or add a new `fix: ...` commit
   c. Re-run the gate from step 2
   d. Do not advance to the next task until the gate passes

**YOLO behavior:** Run silently. Gate failures pause YOLO automatically — announce:
```
YOLO: start — Post-task gate FAILED after Task N → fixing inline
```
After fix: `YOLO: start — Post-task gate re-run → PASSED. Resuming YOLO.`

**Performance budget:** The gate adds < 60 seconds per task for most projects:
- `tsc --noEmit` (incremental): 2–10s
- Scoped lint (changed files only): 1–5s
- `npm test` / `pytest`: varies

For slow test suites (> 60s), set `quality_gates.skip_tests: true` to run only typecheck + lint per task. Tests then run at Final Verification as usual.

---

## Self-Review Step

This step runs after implementation and before formal code review. It catches "it works but it's sloppy" problems before a reviewer sees them.

**Process:**
1. Read `../../references/coding-standards.md` to load the review criteria
2. Get the full diff of all files changed during implementation: `git diff`
3. Review every changed file against the checklist in `../../references/coding-standards.md`.

4. For each violation found, fix it immediately. Do not proceed to code review with known violations.
5. If a violation cannot be fixed without significant rework, document it as tech debt with a TODO referencing the issue.

**Output format:**
```
## Self-Review Results

### Fixed
- [file:line] Extracted 45-line function into 3 smaller functions
- [file:line] Replaced `any` with proper type
- [file:line] Added error handling for API call

### Accepted (tech debt)
- [file:line] TODO(#XX): [reason it can't be fixed now]

### No Issues Found
- [area] follows existing patterns
```

*(Turn Bridge Rule applies — call `TaskUpdate` immediately after outputting self-review results.)*

---

## Generate CHANGELOG Entry Step

This step runs after code review and before final verification. It auto-generates a CHANGELOG entry from the feature branch's git commits and presents it for user approval before writing. It runs for all scopes except Quick fix.

**Process:**

#### Phase 1: Collect commits

1. Get all commit messages on the feature branch: `git log --format="%s" [base-branch]...HEAD`
2. Filter out merge commits matching `^Merge (branch|pull request)`
3. Filter out fixup/squash commits matching `^(fixup|squash)!`
4. If no commits remain after filtering, skip the step: "No commits found on feature branch — skipping CHANGELOG generation."

#### Phase 2: Categorize by conventional commit prefix

For each commit message, match against these prefixes:

| Prefix | Keep a Changelog Category |
|--------|--------------------------|
| `feat:` | Added |
| `fix:` | Fixed |
| `refactor:` | Changed |
| `docs:` | Documentation |
| `test:` | Testing |
| `chore:` | Maintenance |

**Processing rules:**
1. Match prefix case-insensitively: `feat:`, `Feat:`, `FEAT:` all match
2. Strip the prefix and optional scope: `feat(csv): add export` → `Add export`
3. Capitalize the first letter of the remaining message
4. Deduplicate entries with identical messages (case-insensitive, keep first occurrence)
5. If no commits match any prefix, put all entries under a single `### Changes` category
6. Omit empty categories from the output

#### Phase 3: Detect version (optional)

Check these sources in order, use the first one found:

1. `package.json` → `version` field
2. `Cargo.toml` → `[package]` section `version` field
3. `pyproject.toml` → `[project]` section `version` field
4. `mix.exs` → `@version` attribute
5. Latest git tag matching semver pattern: `git tag --sort=-v:refname | grep -E '^v?[0-9]+\.[0-9]+\.[0-9]+' | head -1`

If a version is detected, present it alongside `[Unreleased]` via `AskUserQuestion`:
- **Option 1:** `[Unreleased]` with description: "*Recommended — assign version at release time; keeps the entry flexible until the next release*"
- **Option 2:** `[X.Y.Z] - YYYY-MM-DD` with description: "Stamp the detected version now — use if this PR completes the release"

If no version detected, use `[Unreleased]` without asking.

**YOLO behavior:** If YOLO mode is active, skip this question. Auto-select `[Unreleased]` and announce: `YOLO: start — CHANGELOG version heading → [Unreleased]`

#### Phase 4: Generate entry

Format the entry in Keep a Changelog format:

```
## [Unreleased]

### Added
- Entry from feat: commit
- Entry from feat: commit

### Fixed
- Entry from fix: commit

### Changed
- Entry from refactor: commit
```

Category order: Added, Fixed, Changed, Documentation, Testing, Maintenance, Changes (fallback last).

#### Phase 5: Present for approval

Present the generated entry to the user via `AskUserQuestion`:

- **Option 1:** "Looks good — write it" with description: "*Recommended — writes the entry to a changelog fragment file*"
- **Option 2:** "Let me edit" with description: "Provide corrections in freeform text — the entry will be revised before writing"
- **Option 3:** "Skip CHANGELOG" with description: "Omit the entry — note: missing CHANGELOG entries complicate release note generation"

**YOLO behavior:** If YOLO mode is active, skip this question. Auto-select "Looks good — write it" and announce: `YOLO: start — CHANGELOG entry → Accepted`

#### Phase 6: Write changelog fragment

Instead of writing directly to `CHANGELOG.md`, write the entry to a per-PR fragment file. This prevents merge conflicts when multiple PRs are created concurrently — each PR writes a unique file.

**Fragment filename:**
- If a GitHub issue is linked: `.changelogs/<issue-number>.md` (e.g., `.changelogs/195.md`)
- If no issue is linked: `.changelogs/<branch-name>.md` (e.g., `.changelogs/feat-csv-export.md`)

**Fragment format:**
```markdown
---
date: YYYY-MM-DD
pr: <pr-number or "pending">
scope: <lifecycle scope>
---

### Added
- Entry from feat: commit

### Fixed
- Entry from fix: commit

### Changed
- Entry from refactor: commit
```

**Process:**
1. Create `.changelogs/` directory if it doesn't exist: `mkdir -p .changelogs`
2. Write the fragment file with frontmatter metadata and categorized entries
3. Stage the fragment: `git add .changelogs/<filename>.md`
4. Do NOT modify `CHANGELOG.md` — consolidation happens at merge time via the Ship phase

After writing, announce: "Changelog fragment written to `.changelogs/<filename>.md` with N entries across M categories."

**Existing CHANGELOG.md:** Do not read, parse, merge into, or deduplicate against `CHANGELOG.md` during this step. The fragment is self-contained.

**`.changelogs/` in `.gitignore`:** This directory MUST be committed (unlike `.feature-flow/`). Do not add it to `.gitignore`. Each PR carries its own fragment file.

**Output format:**
```
## CHANGELOG Generation Results

**Fragment file:** `.changelogs/<filename>.md`
**Version heading:** [Unreleased] (or [X.Y.Z] - YYYY-MM-DD)
**Commits parsed:** N
**Entries generated:** M (after dedup)
**Categories:** [list]
**Action:** Written to `.changelogs/<filename>.md` / Skipped by user
```

*(Turn Bridge Rule applies — call `TaskUpdate` immediately after outputting CHANGELOG results.)*

---

## Sync with Base Branch Step

This step runs after final verification and before commit and PR. It fetches the latest from origin and merges the base branch into the feature branch, ensuring no divergence has accumulated from parallel feature work. Uses `git merge` instead of `git rebase` — merge produces a single conflict resolution pass regardless of commit count, while rebase replays each commit individually (N commits = up to N separate conflict rounds).

**Configuration:** The merge strategy is the default. Projects requiring linear history can set `git_strategy: rebase` in `.feature-flow.yml` to use the old rebase behavior.

**Process:**

1. Fetch latest from origin:
   ```bash
   git fetch origin
   ```

2. Check for divergence:
   ```bash
   git rev-list HEAD..origin/<base-branch> --count
   ```
   - If output is `0`: announce "Base branch is up to date — no merge needed." Skip to step 5.
   - If output is non-zero: proceed to step 3.

3. Read `git_strategy` from `.feature-flow.yml` (default: `merge`). Then integrate:
   ```bash
   # Default (merge):
   git merge origin/<base-branch> --no-edit

   # If git_strategy: rebase:
   git rebase origin/<base-branch>
   ```

4. If merge/rebase exits with conflicts:
   a. Identify conflicted files:
      ```bash
      git diff --name-only --diff-filter=U
      ```
   b. **For conflicted files:**
      - Announce: "Conflicts detected in: [files]. Pausing for manual resolution."
      - Show the user exactly what to do:
        ```
        1. Resolve conflicts in: [file list]
        2. Stage resolved files: git add <file>
        3. Complete: git commit (for merge) or git rebase --continue (for rebase)
        4. Type 'continue' to resume the lifecycle
        ```
      - Wait for the user to resolve and respond before proceeding.

5. Announce: "Synced with origin/<base-branch>. Ready to push and create PR."

**YOLO behavior:** Run silently. If conflicts are detected, pause and announce the conflict files — YOLO cannot resolve arbitrary conflicts automatically. Announce: `YOLO: start — Sync with base branch → [up to date | merged N commits | conflicts in: files (paused)]`

---

## Final Verification Step

This step runs after CHANGELOG generation and before commit and PR. It verifies acceptance criteria and runs quality gates — but skips redundant quality gate runs when the code review pipeline already passed them.

**Process:**

1. **Check for redundant quality gates:** Before running `verification-before-completion` (which runs typecheck, lint, build), check whether quality gates have already been validated at HEAD without subsequent changes. Two sources qualify:
   - **Code Review Pipeline Phase 4** passed quality checks in this lifecycle, OR
   - **Post-task quality gate** ran at HEAD and wrote the verification marker

   In either case, check `git status --porcelain` and the verification marker:
   ```bash
   CURRENT_HEAD=$(git rev-parse HEAD)
   SAVED_HEAD=$(cat "$(git rev-parse --git-dir)/feature-flow-verified" 2>/dev/null)
   ```
   - If marker matches HEAD (`$CURRENT_HEAD` = `$SAVED_HEAD`) **and** `git status --porcelain` is empty: Skip `verification-before-completion`. Announce: "Quality gates already passed (verified at HEAD, working tree clean) — skipping redundant checks."
   - If marker does not match HEAD **or** working tree is dirty: Run `verification-before-completion` normally.

2. **Always run `verify-acceptance-criteria`:** This checks plan-specific criteria and must always run regardless of quality gate skip.

3. **Write verification marker:** After all checks pass (both acceptance criteria and any quality gates that ran), write the HEAD commit hash to the git directory for the stop hook to read:
   ```bash
   git rev-parse HEAD > "$(git rev-parse --git-dir)/feature-flow-verified"
   ```
   This prevents the stop hook from re-running the same quality gates when the session ends.

4. **Capture diff stats:** Run `git diff --stat [base-branch]...HEAD` to record line counts in the session transcript, substituting the actual detected base branch for `[base-branch]`. The `session-report` analysis script uses this output to populate `cost_per_line_changed`. Run without truncation — do not pipe through `head`.
   - If the output is empty (no commits on the branch yet), announce: "No commits on branch — skipping diff stats capture." No further action needed.
   - If the command fails or produces a `fatal:` error, log a warning: "git diff --stat failed — cost_per_line_changed will be null. Error: [output]" Then skip. Do not treat git error output as diff output.

---

## PR Metadata Block Step

This step runs during the `Commit and PR` phase, immediately after the PR body (summary, test plan, `## Implementation Context`, code-review summary) is assembled but **before** `gh pr create` is invoked. It assembles the `feature-flow-metadata` YAML block from in-memory lifecycle state and appends it as an HTML-commented block to the PR body.

**Runs in all modes** (YOLO, Express, Interactive). Not YOLO-specific.

**Skip condition:** If `lifecycle.metadata_block.enabled: false` in `.feature-flow.yml`, skip this step entirely with no warning.

**Process:**

1. Read lifecycle state to assemble the metadata object:
   - `lifecycle_session`: read from `.feature-flow/session.txt`
   - `created_at`: `date -u +%Y-%m-%dT%H:%M:%SZ`
   - `scope`, `risk_tier`, `issue`: from Step 1 lifecycle context
   - `design_issue`: the integer issue number from lifecycle context (`issue`); null if no issue is linked
   - `plan_file`: repo-relative path from lifecycle state (null if scope skips this)
   - `acceptance_criteria_verified_at`, `acceptance_criteria_verified_sha`, `acceptance_criteria_count`: from `verify-acceptance-criteria` output (null if not yet run)
   - `risk_areas`: `git diff --name-only <base>...HEAD` → take top-level directories of changed files plus any individual file with >50 changed lines; dedupe; cap at 10 entries
   - `sibling_prs`: always `[]` (multi-PR session support deferred)
   - `depends_on_prs`: parse explicit `gh-pr:<N>` tokens from design doc body (empty list if none or no design doc)
   - `remediation_log`: always `[]` at PR creation

2. Build the JSON representation using `jq -n` (avoids shell quoting pitfalls).

   **Convention:** The optional string field (`plan_file`) uses the empty string `""` to mean "absent/null". The `with_entries` filter at the end converts every empty-string field value to JSON `null` so the serialized YAML emits `null` instead of `""`. Optional integer fields (`issue`, `design_issue`, `acceptance_criteria_count`) and list/dict fields use `--argjson` and pass the literal string `null` or a JSON-encoded list when absent.

   ```bash
   METADATA_JSON=$(jq -n \
     --argjson schema_version 1 \
     --arg lifecycle_session "$LIFECYCLE_SESSION" \
     --arg created_at "$CREATED_AT" \
     --arg scope "$SCOPE" \
     --arg risk_tier "$RISK_TIER" \
     --argjson issue "${ISSUE_OR_NULL:-null}" \
     --argjson design_issue "${ISSUE_OR_NULL:-null}" \
     --arg plan_file "${PLAN_FILE:-}" \
     --argjson acceptance_criteria_verified_at null \
     --argjson acceptance_criteria_verified_sha null \
     --argjson acceptance_criteria_count null \
     --argjson risk_areas "${RISK_AREAS_JSON:-[]}" \
     --argjson sibling_prs '[]' \
     --argjson depends_on_prs "${DEPENDS_ON_PRS_JSON:-[]}" \
     --argjson remediation_log '[]' \
     '$ARGS.named | with_entries(if (.value | type) == "string" and .value == "" then .value = null else . end)')
   ```

   The `with_entries` filter coerces empty-string optional fields to `null` so the serialized YAML uses `null` (not `""`) consistently. Required string fields (`lifecycle_session`, `created_at`, `scope`, `risk_tier`) are populated by lifecycle state and never empty in practice — if they were, the parser would correctly reject them in the `null` form.

3. Serialize to YAML via Python one-liner (canonical field order, see ../../references/feature-flow-metadata-schema.md §Serialization):
   ```bash
   METADATA_YAML=$(python3 -c \
     "import yaml,sys,json; d=json.loads(sys.argv[1]); print(yaml.safe_dump(d, sort_keys=False, default_flow_style=False).rstrip())" \
     "$METADATA_JSON")
   ```
   If this fails (PyYAML unavailable), use the printf fallback per ../../references/feature-flow-metadata-schema.md §Serialization. If fallback also fails, log warning and skip block (continue to PR creation without block).

4. Append the block to the PR body file:
   ```bash
   printf '\n<!-- feature-flow-metadata:v1\n%s\n-->\n' "$METADATA_YAML" >> /tmp/ff_pr_body.md
   ```

5. Pass `/tmp/ff_pr_body.md` to `gh pr create --body-file /tmp/ff_pr_body.md` as the PR body.

**All failures are non-fatal.** If any sub-step fails (state read, serialization, file write), log a warning to stderr and proceed to PR creation without the block. The lifecycle never blocks on metadata.

See `../../references/feature-flow-metadata-schema.md` for field definitions, types, and derivation rules.

---

## Wait for CI and Address Reviews Step

This step runs after commit and PR (or after mobile-specific steps like app store review) and before comment and close issue. It has two independent phases: (1) wait for CI checks to pass, and (2) wait for automated code review bot comments and address them. These are decoupled because CI and code review are independent processes — CI typically completes in 1-2 minutes, while review bots like Gemini Code Review may not post their review for 5+ minutes after the PR is created.

**Process:**

**On step entry — fire both of the following in a single parallel message (two simultaneous tool calls):**

1. Phase 1 first poll: `gh pr checks <pr_number> --json name,status,conclusion`
2. Phase 2 bot-history detection: Check the last 5 merged/closed PRs for bot reviews (full script in Phase 2 Step 2a below)

Use both results together to determine (a) initial CI state and (b) whether bot-review polling is needed. Then proceed to the Phase 1 and Phase 2 loops described below.

### Phase 1: Wait for CI checks

1. Get the PR number from the previous step's output.

2. Poll CI check status every 30 seconds:
   ```bash
   gh pr checks <pr_number> --json name,status,conclusion
   ```
   Note: the JSON field is `status` (values: `queued`, `in_progress`, `completed`), NOT `state`. The `conclusion` field is only populated when `status == "completed"`.

3. Wait until every check has `status: "completed"`.
   - If all have `conclusion: "success"` → Phase 1 complete.
   - If any have `conclusion: "failure"` → proceed to Phase 3 (CI failure handling).
   - If no checks exist (empty response) → announce: "No CI checks configured." Phase 1 complete.

4. Safety valve: if checks haven't resolved after 15 minutes (configurable via `ci_timeout_seconds` in `.feature-flow.yml`, default 900), announce:
   ```
   CI checks still pending after 15 minutes. Continuing without waiting.
   Pending checks: [list names]
   ```
   Phase 1 complete (timed out).

### Phase 2: Wait for and address bot review comments

CI and code review are **independent processes**. Review bots (Gemini Code Review, CodeRabbit, etc.) typically post their review 5-10 minutes after the PR is created — well after CI has already passed. This phase detects whether the repo uses review bots and waits for their review to land before proceeding.

**Step 2a: Detect if the repo uses review bots**

Check the last 5 merged/closed PRs for reviews from bot users:
```bash
# Get recent PR numbers
PR_NUMS=$(gh api repos/{owner}/{repo}/pulls?state=all&per_page=5 --jq '.[].number')

# For each, check for bot reviews
for pr in $PR_NUMS; do
  gh api repos/{owner}/{repo}/pulls/$pr/reviews \
    --jq '.[] | select(.user.type == "Bot") | .user.login'
done
```

- If any bot reviews found → this repo uses review bots. Record the bot login names. Proceed to step 2b.
- If no bot reviews found on any of the last 5 PRs → this repo does not use review bots. Skip Phase 2 entirely. Announce: "No review bot history detected — skipping review wait."

**Step 2b: Wait for the bot review to appear on THIS PR**

Poll for a review from a bot user on the current PR:
```bash
gh api repos/{owner}/{repo}/pulls/{pr_number}/reviews \
  --jq '.[] | select(.user.type == "Bot") | .user.login'
```

Poll every 30 seconds. The **completion signal** is a review from a bot user appearing — this is what we're waiting for, not CI passing.

- If a bot review appears → proceed to step 2c.
- Safety valve: if no bot review appears after `ci_timeout_seconds` (default 900 = 15 minutes), announce:
  ```
  Review bot has not posted after 15 minutes. Continuing lifecycle.
  ```
  Skip to output.

**Step 2c: Fetch and address inline review comments**

Review bots like Gemini Code Review and CodeRabbit post inline code review comments as **PR review threads** — comments attached to specific file lines. Each thread must be replied to individually.

1. Derive owner/repo for API calls:
   ```bash
   gh repo view --json owner,name -q '.owner.login + "/" + .name'
   ```

2. Fetch all review comments (inline thread comments) on the PR:
   ```bash
   gh api repos/{owner}/{repo}/pulls/{pr_number}/comments
   ```

3. Filter for bot-authored comments: check `user.type == "Bot"` in the response. This catches any review bot without hardcoding names.

4. If no bot inline comments (bot posted a review but no inline threads) → skip to output.

5. For each bot inline comment:
   a. Read the comment body, the `path` (file), and `line`/`original_line` it references.
   b. Read the referenced file and surrounding code to understand context.
   c. Evaluate against the design doc — if the suggestion contradicts a design decision, mark as "declined."
   d. Classify priority:
      - **Bug / security** → always address
      - **Style / convention** → address if it aligns with project conventions
      - **Nit / suggestion** → address if trivial, decline if subjective
      - **Contradicts design** → decline with explanation
   e. Make the code change (if addressing).

6. Batch all fixes into a single commit:
   ```bash
   git add <changed files>
   git commit -m "fix: address automated code review feedback

   Addressed N of M review comments. Declined K with rationale."
   git push
   ```

7. **Post a review thread reply for each inline comment.** This is critical — review bots expect replies on their specific threads, not a single summary comment on the PR. For each bot comment, reply directly to that comment's thread:

   ```bash
   # For addressed comments — reply on the inline thread:
   gh api repos/{owner}/{repo}/pulls/{pr_number}/comments \
     -f body="Fixed in <commit_sha>. <brief description of what was changed>." \
     -F in_reply_to=<comment_id>

   # For declined comments — reply on the inline thread:
   gh api repos/{owner}/{repo}/pulls/{pr_number}/comments \
     -f body="Declined — <rationale>. This was a deliberate design decision." \
     -F in_reply_to=<comment_id>
   ```

   **IMPORTANT:** The GitHub API for replying to PR review comments uses `POST /repos/{owner}/{repo}/pulls/{pr_number}/comments` with the `in_reply_to` field set to the original comment's `id`. There is NO `/replies` sub-resource on this endpoint.

8. After pushing fixes, re-wait for CI (Phase 1) one more time to confirm the fix commit passes. Do NOT re-wait for a second round of bot reviews — the fix commit does not trigger a new full review from most bots.

9. **Update PR metadata remediation_log.** After the fix commit is pushed, append an entry to the `remediation_log` in the PR's `feature-flow-metadata` block. Follow the read-modify-write protocol in ../../references/feature-flow-metadata-schema.md §Update Protocol. Entry fields: `type: "review-bot"`, `description: "addressed N review comments (K declined)"`, `commit: <fix_commit_sha>`, `at: <current UTC timestamp>`. This step is non-fatal — if it fails, log a warning and continue.

### Phase 3: Handle CI failures

1. Identify which checks failed from the `conclusion` field.
2. Categorize:
   - **Test failure** → read failure output via `gh pr checks <pr_number> --json name,conclusion,detailsUrl`, attempt fix, push
   - **Lint / typecheck** → read errors, fix, push
   - **Deploy / infra failure** → not actionable by code changes, warn and continue
3. After pushing a fix, return to Phase 1 (re-wait for CI).

4. **Update PR metadata remediation_log.** After the fix commit is pushed, append an entry to the `remediation_log` in the PR's `feature-flow-metadata` block. Follow the read-modify-write protocol in ../../references/feature-flow-metadata-schema.md §Update Protocol. Entry fields: `type: "ci-<category>"` (e.g. `"ci-lint"`, `"ci-test"`), `description: "<check name>: <brief fix description>"`, `commit: <fix_commit_sha>`, `at: <current UTC timestamp>`. This step is non-fatal — if it fails, log a warning and continue.

### Phase Ordering

Phase 1 (CI) and Phase 2 (bot review) run sequentially but are logically independent:

```
Phase 1: Wait for CI → handle failures if any → CI green
Phase 2: Detect bot history → wait for bot review → address inline comments → push fix → reply to threads
Phase 1 (again): Re-wait for CI after fix push (if fixes were made)
```

If Phase 1 times out or has no checks, Phase 2 still runs (the bot review is independent of CI). If Phase 2 detects no bot history, it skips immediately.

### Loop Termination

Maximum 2 total fix-and-recheck cycles across Phase 1 and Phase 3 combined. After 2 cycles:
- If checks still failing → warn: "CI still failing after 2 fix attempts. Continuing lifecycle." List failing checks.

Phase 2 (bot review) runs at most once per PR — no loop. If the bot posts additional comments on the fix commit, they are not automatically addressed (this would require a separate manual invocation).

**Output:** "CI checks: [N passed, M failed]. Review comments: [X addressed, Y declined]." or "No CI checks configured, no review bot history — skipped."

**YOLO behavior:** Auto-wait silently. Announce periodic status every 60 seconds:
`YOLO: start — Waiting for CI checks (N of M complete, K pending: [names])`
`YOLO: start — CI passed. Waiting for review bot ([bot_name] detected on recent PRs)...`
After addressing: `YOLO: start — Review comments → N addressed, K declined`

**Interactive/Express behavior:** Announce wait and show progress. The user can type "skip" to continue without waiting at either phase.

**Edge cases:**

| Scenario | Behavior |
|----------|----------|
| Repo has no CI checks | Phase 1 skips (no checks). Phase 2 still runs (independent). |
| Repo has CI but no review bot history | Phase 1 waits for CI. Phase 2 skips (no bot history on last 5 PRs). |
| Bot posts summary comment but no inline comments | No inline thread comments to address → skip step 2c |
| Bot review arrives after timeout | Missed — user can re-run manually |
| PR has merge conflicts blocking CI | Warn and continue |
| Multiple review bots on same repo | Address inline comments from all bots in one pass |
| Bot suggests change that contradicts design doc | Decline with rationale in the thread reply |
| CI passes before bot review arrives | Normal — Phase 2 waits independently for the bot review |
| Bot review arrives before CI passes | Phase 2 will find it when it runs after Phase 1 |

---

## Post Implementation Comment Step

This step runs after the Harden PR step (for Feature and Major Feature scopes) or after "Wait for CI and address reviews" (for smaller scopes, or after app store review for mobile platforms), and before the Handoff step (or before the lifecycle completion summary for non-feature scopes). It only runs when a GitHub issue was linked during Step 1 (issue reference detection). If no issue was linked, skip this step silently.

**Process:**

1. **Check if issue is already closed** (substitute `[N]` with the actual issue number from Step 1):
   ```bash
   gh issue view [N] --json state --jq '.state'
   ```
   - If the state is `CLOSED`, log: `"Issue #[N] is already closed — skipping."` and skip.
   - If the command fails (non-zero exit, network error, auth failure), log: `"Issue state check failed for #[N] — skipping comment and close step."` and skip.

2. **Gather context inline** (2 bash calls — substitute `[base-branch]` with the base branch detected in Step 0):
   ```bash
   git log --format="%s" [base-branch]...HEAD
   ```
   → Derive 2-4 "What was built" bullets from commit messages.
   > **Note:** With atomic commits (see `references/git-workflow.md`), each criterion has its own commit. Include these criterion-level commits as-is in the bullets — they provide precise traceability.
   ```bash
   git diff --stat [base-branch]...HEAD | head -10
   ```
   → Key files changed list.
   - **PR number:** from conversation context (produced by "Commit and PR" step — already in context)
   - **Acceptance criteria:** from conversation context (implementation plan tasks + final verification results)

3. **Dispatch a general-purpose subagent** with the fully-assembled comment content. **Before dispatching, substitute every bracket placeholder** — `[N]`, `[PR number]`, all `[bullet N from git log]` entries, all `[criterion N]` entries, all `[file path]` entries — using the data gathered in step 2. No bracket placeholders should remain in the prompt string sent to the subagent:

   ```
   Task(
     subagent_type: "general-purpose",
     model: "sonnet",
     description: "Post implementation comment on issue #[N]",
     prompt: "Post a comment on GitHub issue #[N]. Use exactly this comment body:

   ## Implementation Complete

   **PR:** #[PR number from context]

   ### What was built
   - [bullet 1 from git log]
   - [bullet 2 from git log]
   [up to 4 bullets]

   ### Acceptance criteria verified
   - [x] [criterion 1 from implementation plan]
   - [x] [criterion 2 from implementation plan]
   [all criteria]

   ### Key files changed
   - \`[file path]\` — [1-line description]
   [up to 10 files from git diff --stat]

   *This issue will close automatically when PR #[PR number from context] is merged (via `Closes #[N]` in the PR body).*

   Run: gh issue comment [N] --body-file /tmp/ff_issue_comment.md (write the comment body to /tmp/ff_issue_comment.md first to avoid shell quoting issues with apostrophes and special characters). Return 'success' or 'failed: [reason]' so the orchestrator can branch the announcement."
   )
   ```

4. **Announce:**
   - If subagent returned `'success'`: `"Issue #[N] commented (will auto-close on PR merge)."`
   - If subagent returned `'failed: [reason]'`: log `"Issue #[N] comment/close failed — [reason]. Continuing."` and skip success announcement.

**Edge cases:**
- **No issue linked:** Skip this step silently — not all lifecycle runs start from an issue
- **Issue already closed:** Caught in step 1 — skip dispatch. Do not reopen or double-comment.
- **`gh` command fails:** Subagent logs error and continues — non-blocking
- **YOLO/mode propagation:** YOLO propagation applies only to `Skill()` invocations, not `Task()` dispatches. These git/gh subagents require no mode flag.

---

## Harden PR Step

This step runs after "Wait for CI and address reviews" and before the "Post Implementation Comment" step. Feature and Major Feature scopes only — smaller scopes skip this step entirely.

Harden PR applies a bounded best-effort remediation loop to drive the PR from its current state (possibly red CI, conflicts, or unresolved reviews) to a mergeable state. Unlike "Wait for CI and address reviews" (which waits for initial CI + bot reviews to land), Harden PR actively attempts to fix remaining problems.

**Process:**

1. **Read shared references** (in this order):
   - `../../references/best-effort-remediation.md` — bounded-attempt loop skeleton and mode escalation contract
   - `../../references/ci-remediation.md` — category-specific CI fix strategies
   - `../../references/conflict-resolution.md` — graduated conflict resolution ladder
   - `../../references/review-triage.md` — review comment triage and remediation

2. **Read bounds from `.feature-flow.yml`:**
   - `lifecycle.harden_pr.enabled` (default: `true`) — if `false`, skip this step
   - `lifecycle.harden_pr.max_attempts` (default: `3`)
   - `lifecycle.harden_pr.max_wall_clock_minutes` (default: `10`)
   - `lifecycle.harden_pr.pause_on_unresolvable_conflict` (default: `true`)

3. **Get current PR state:**
   ```bash
   gh pr view <pr_number> --json state,mergeable,statusCheckRollup,reviews,reviewDecision
   ```

4. **Fast path: already mergeable?** If `mergeable: MERGEABLE` AND `reviewDecision != CHANGES_REQUESTED` AND all checks green, skip the loop. Announce: `Harden PR: PR #N already mergeable — no remediation needed.`

5. **Apply bounded remediation loop:**
   - **CI red?** Apply `../../references/ci-remediation.md` strategies. After each fix commit, push and re-poll CI.
   - **Mergeable: CONFLICTING?** Apply `../../references/conflict-resolution.md` graduated ladder. Tier 3 always pauses — even in YOLO — when `pause_on_unresolvable_conflict: true`.
   - **Unresolved human reviews?** Apply `../../references/review-triage.md` to classify and remediate. Blockers without an automated fix always pause.
   - **All clean?** Exit loop.

6. **Final mergeable check:**
   ```bash
   gh pr view <pr_number> --json mergeable,reviewDecision,statusCheckRollup
   ```
   - `mergeable: MERGEABLE` AND `reviewDecision != CHANGES_REQUESTED` AND CI green → record status `READY`
   - Otherwise → record status `BLOCKED` and the outstanding blockers

7. **Output structured summary:**
   ```
   Harden PR: PR #N status — [READY | BLOCKED]
     CI: [green | red — N failing checks: name1, name2]
     Conflicts: [none | unresolved in: file1, file2]
     Reviews: [approved | N unresolved: blockers=K, suggestions=L]
     Remediation log: [N attempts, M fixes applied across X categories]
   ```

**Mode behavior:**

| Mode | Behavior |
|------|----------|
| YOLO | All remediation automatic. Pause only when conflict-resolution.md or review-triage.md mandate it (Tier 3 conflicts, unresolvable blockers). Announce each attempt: `YOLO: harden-pr — Attempt N/3 → [action]` |
| Express | First remediation attempt confirmed via `AskUserQuestion`; subsequent attempts automatic. Announce: `Express: harden-pr — Attempt N/3 → [action]` |
| Interactive | Confirm each remediation attempt with proposed diff via `AskUserQuestion` before applying |

**Edge cases:**

- **Budget exhausted, PR still blocked:** Record what's still blocking. Proceed to "Post Implementation Comment" + "Handoff" — the user sees blockers in the handoff announcement and decides whether to fix manually or invoke `/merge-prs` later. Do NOT loop indefinitely.
- **PR already merged (user merged manually mid-lifecycle):** Announce, skip Harden PR, skip Post Implementation Comment (the comment is not useful post-merge), proceed to Handoff with a "PR was merged externally" note.
- **No remediation needed (PR already green/mergeable):** Skip all loop attempts per step 4 fast path.
- **Wall-clock budget exceeded mid-attempt:** Complete the in-progress fix (don't leave a half-applied state), then exit with `BLOCKED` status.

---

## Handoff Step

This step is the terminal step for Feature and Major Feature scopes. It replaces the previous Ship step and the current Step 5 completion output for these scopes. Smaller scopes (Quick fix, Small enhancement) use the existing Step 5 completion summary — they do not reach this step.

**Process:**

1. **Read PR state one more time** (final snapshot):
   ```bash
   gh pr view <pr_number> --json number,url,state,mergeable,reviewDecision,statusCheckRollup
   ```

2. **Count sibling feature-flow PRs** (informational only, not a gate):
   ```bash
   gh pr list --label feature-flow --base <base_branch> --state open --json number --jq 'length'
   ```
   Subtract 1 to get "other open feature-flow PRs."

3. **Count changelog fragments:**
   ```bash
   ls .changelogs/*.md 2>/dev/null | wc -l
   ```

4. **Build handoff announcement:**

   ```
   Lifecycle complete — PR is ready for merge.

   PR: #<number> — <url>
     Status: [MERGEABLE | BLOCKED — see harden-pr output above]
     CI: [green | red]
     Reviews: [approved | N unresolved]
     Issue: #<N> will close automatically on merge (via `Closes #N`)
     [or "Issue: none linked" if issue is null]

   Other open feature-flow PRs: [M]
   Changelog fragments pending: [K]

   Next steps:
     1. Merge PR #<number> directly in GitHub  →  closes issue #<N>
        (Or run `/merge-prs <number>` for automated cleanup after merge)
     2. After merge, `feature-flow:cleanup-merged` will automatically remove the worktree, branch, and handoff file.

   Worktree: Still active at `.worktrees/<name>` — will be removed automatically after PR #<number> merges.
   ```

5. **Mode behavior:**

| Mode | Behavior |
|------|----------|
| YOLO | If `lifecycle.handoff.auto_invoke_merge_prs: true` is set in config, automatically invoke `Skill(skill: "feature-flow:merge-prs", args: "yolo: true. <pr_number>")` after the announcement. Otherwise stop after announcing. **Default: do NOT auto-invoke** (preserves the "merging is a deliberate action" principle even in YOLO). Users who want full unattended end-to-end can opt in. Announce: `YOLO: handoff — PR ready, [auto-invoking merge-prs / stopping per config]` |
| Express | Stop after announcing. Suggest `/merge-prs` as next action. |
| Interactive | Stop after announcing. Suggest `/merge-prs` as next action. |

6. **Notification:** Fire `notifications.on_stop` from `.feature-flow.yml` if set.

7. **Mark final todo complete** via `TaskUpdate` (Turn Bridge Rule).

**Note on changelog consolidation:** Fragments in `.changelogs/` remain until the user runs `/merge-prs` — consolidation runs as part of merge-prs's terminal step. This matches the principle that handoff ends the lifecycle and lets the user choose when to ship.

---

## Blocker Logging

When a subagent surfaces a blocker (a problem that halts a task, requires rethinking the approach, or requires asking the user), the orchestrator logs it immediately to `.feature-flow/implement/blockers-and-resolutions.md` using this format:

```markdown
## [Task N]: [Blocker Title]
- **Blocker:** [description]
- **Resolution:** pending
- **Commit:** pending
```

Update the entry once the blocker is resolved, replacing `pending` with the actual resolution and commit SHA.

---

## Commit and PR Step

This step delegates PR creation to `superpowers:finishing-a-development-branch` via the Skill tool. After the skill returns, the orchestrator performs post-creation housekeeping.

### Post-PR-Creation: Apply feature-flow Label and Body Markers

After `superpowers:finishing-a-development-branch` returns, extract the PR number from its output (look for a GitHub PR URL pattern: `https://github.com/.*/pull/(\d+)`).

Store the extracted number as the `pr` context key for subsequent skill invocations.

Then run the following in sequence:

**1. Ensure the `feature-flow` label exists (idempotent):**
```bash
gh label create feature-flow \
  --description "Managed by feature-flow lifecycle" \
  --color 0E8A16 \
  --force 2>/dev/null || true
```

**2. Apply the label to the PR:**
```bash
gh pr edit <pr_number> --add-label feature-flow
```

**3. Append body markers:**
```bash
# Get current PR body
CURRENT_BODY=$(gh pr view <pr_number> --json body --jq '.body')

# Build markers block
MARKERS="<!-- feature-flow-session -->"
if [ -n "<issue_number>" ]; then
  MARKERS="${MARKERS}
<!-- feature-flow-design-issue: <issue_number> -->"
fi

# Append to body (only if marker not already present)
if ! echo "$CURRENT_BODY" | grep -q "feature-flow-session"; then
  gh pr edit <pr_number> --body "${CURRENT_BODY}

${MARKERS}"
fi
```

Where `<issue_number>` is the `issue` value from the lifecycle context object (integer issue number; may be absent for scopes that skip issue creation).

**YOLO behavior:** Run silently. Announce: `YOLO: start — PR #<number> labeled feature-flow + body markers applied`
**Express behavior:** Same as YOLO — run silently, announce.
**Interactive behavior:** Run silently (no prompt needed — this is automatic housekeeping).

**Error handling:** If any of these steps fail (label creation, label application, body edit), log the failure and continue. These steps are housekeeping — failure must never block the lifecycle. Announce: `Warning: feature-flow label/marker apply failed for PR #<number> — Ship phase auto-discovery may not work. Run manually: gh pr edit <number> --add-label feature-flow`
