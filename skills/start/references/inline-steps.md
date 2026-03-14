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

---

## Commit Planning Artifacts Step

This step runs after verify-plan-criteria and before worktree setup. It commits design documents and project config to the base branch so the worktree inherits them via git history, preventing untracked file clutter.

**Process:**
1. Run inline: `git status --porcelain docs/plans/*.md .feature-flow.yml 2>&1`
   - If output is empty: skip — "No planning artifacts to commit."
   - If output is non-empty (changes detected OR git error output): proceed to step 2 — treat conservatively as "artifacts may exist."
2. Dispatch a general-purpose subagent to commit. **Before dispatching, substitute `[feature-name]` with the actual feature name from Step 1** (e.g., "csv-export", "auth-refresh-token"). The orchestrator holds this value in context:

   ```
   Task(
     subagent_type: "general-purpose",
     model: "sonnet",
     description: "Commit planning artifacts to base branch",
     prompt: "Commit the following files to git. Files: docs/plans/*.md and .feature-flow.yml (git add is safe on unchanged tracked files — it no-ops). Commit message: 'docs: add design and implementation plan for [feature-name]'. Run: git add docs/plans/*.md .feature-flow.yml && git commit -m '[message]'. If no files are staged after add, report 'nothing to commit'. Return: committed SHA or 'nothing to commit'."
   )
   ```

   If the subagent fails or errors, log the error and continue — commit failure is non-blocking.

3. Announce: "Planning artifacts committed: [SHA returned by subagent]" or "Nothing to commit — skipping."

**Edge cases:**
- **`.feature-flow.yml` already tracked and unchanged** — `git add` no-ops on unchanged tracked files
- **No plan files exist** — git status in step 1 returns empty (exit 0), step skipped
- **Only `.feature-flow.yml` changed** — still dispatches subagent; file should be tracked regardless
- **git errors in output** — `2>&1` redirects stderr to stdout; git errors appear as non-empty output and are treated conservatively as "may have artifacts" — the subagent proceeds and determines the actual state

> **Note:** The commit message in this step is fixed (`docs: add design and implementation plan for [feature-name]`). For implementation commits (created during the Implement step), follow the atomic commit format in `references/git-workflow.md` — one commit per acceptance criterion with the `feat(scope): description — ✓criterion` format.

---

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

6. **Write to context file.** After generating the "How to Code This" notes, write the full findings (Existing Patterns Found, Anti-Patterns, How to Code This) to `.feature-flow/implement/patterns-found.md`. Append to the existing file rather than overwriting, so multiple study passes accumulate. If the file does not exist yet (e.g., worktree was set up without the init step), create it using the template from `../../references/phase-context-templates.md`.

7. Pass these patterns, the "How to Code This" notes, anti-pattern warnings, AND reference examples from the consolidated output to BOTH the implementation step AND the code review pipeline step as mandatory context. **New code MUST follow these patterns unless there is a documented reason to deviate.** The code review pipeline uses reference examples to check new code against known-good patterns.

**Quality rules:**
- Read at least 2 existing files per area being modified
- Don't just skim — understand the pattern deeply enough to replicate it
- If existing patterns conflict with coding-standards.md, note the conflict and follow the existing codebase pattern (consistency > purity)
- If existing patterns conflict with structural quality (god files, tight coupling), document the conflict. New code follows the better pattern, not the existing anti-pattern. Note: this is the ONE exception to the "consistency > purity" rule — structural anti-patterns should not be replicated even for consistency.

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

- **Option 1:** "Looks good — write it" with description: "*Recommended — writes the entry to CHANGELOG.md under the appropriate version heading*"
- **Option 2:** "Let me edit" with description: "Provide corrections in freeform text — the entry will be revised before writing"
- **Option 3:** "Skip CHANGELOG" with description: "Omit the entry — note: missing CHANGELOG entries complicate release note generation"

**YOLO behavior:** If YOLO mode is active, skip this question. Auto-select "Looks good — write it" and announce: `YOLO: start — CHANGELOG entry → Accepted`

#### Phase 6: Write to CHANGELOG.md

**If CHANGELOG.md exists with an `[Unreleased]` section:**
1. Parse existing categories under `[Unreleased]`
2. For each generated category:
   - If the category exists in the file, append new entries at the end of that category's list
   - If the category doesn't exist, add it after the last existing category under `[Unreleased]`
3. Deduplicate: skip any generated entry that matches an existing entry (case-insensitive)
4. Preserve all existing entries — never remove or reorder them

**If CHANGELOG.md exists without `[Unreleased]`:**
1. Find the first `## [` heading (the latest version section)
2. Insert the new `## [Unreleased]` section before it

**If no CHANGELOG.md exists:**
1. Create the file with the Keep a Changelog header:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

[generated categories and entries]
```

After writing, announce: "CHANGELOG.md updated with N entries across M categories."

**Output format:**
```
## CHANGELOG Generation Results

**Version heading:** [Unreleased] (or [X.Y.Z] - YYYY-MM-DD)
**Commits parsed:** N
**Entries generated:** M (after dedup)
**Categories:** [list]
**Action:** Written to CHANGELOG.md / Skipped by user
```

*(Turn Bridge Rule applies — call `TaskUpdate` immediately after outputting CHANGELOG results.)*

---

## Sync with Base Branch Step

This step runs after final verification and before commit and PR. It fetches the latest from origin and merges the base branch into the feature branch, ensuring no divergence has accumulated from parallel feature work. Uses `git merge` instead of `git rebase` — merge produces a single conflict resolution pass regardless of commit count, while rebase replays each commit individually (N commits = up to N separate conflict rounds). This is especially important for feature-flow branches that touch context tracking files (`.feature-flow/*`, `FEATURE_CONTEXT.md`, `CHANGELOG.md`), which are guaranteed conflict targets.

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
   b. **For `CHANGELOG.md` conflicts (auto-resolved):**
      - Read the conflicted file
      - Extract HEAD's Unreleased entries: lines between `<<<<<<< HEAD` and `=======`
      - Extract incoming Unreleased entries: lines between `=======` and `>>>>>>> <hash>`
      - Merge strategy: start with HEAD's full Unreleased block, then append any category entries from the incoming block that aren't already present (case-insensitive dedup per entry)
      - Write the resolved file (no conflict markers)
      - Stage the file: `git add CHANGELOG.md`
   c. **For other conflicted files:**
      - Announce: "Non-CHANGELOG conflicts detected in: [files]. Pausing for manual resolution."
      - Show the user exactly what to do:
        ```
        1. Resolve conflicts in: [file list]
        2. Stage resolved files: git add <file>
        3. Complete: git commit (for merge) or git rebase --continue (for rebase)
        4. Type 'continue' to resume the lifecycle
        ```
      - Wait for the user to resolve and respond before proceeding.
   d. If only CHANGELOG.md was conflicted (now auto-resolved and staged):
      - For merge: `git commit --no-edit` (completes the merge commit)
      - For rebase: `git rebase --continue` (may trigger further conflicts on subsequent commits — repeat step 4b)

5. Announce: "Synced with origin/<base-branch>. Ready to push and create PR."

**YOLO behavior:** Run silently. If non-CHANGELOG conflicts are detected, pause and announce the conflict files — YOLO cannot resolve arbitrary conflicts automatically. Announce: `YOLO: start — Sync with base branch → [up to date | merged N commits | conflicts in: files (paused)]`

---

## Final Verification Step

This step runs after CHANGELOG generation and before commit and PR. It verifies acceptance criteria and runs quality gates — but skips redundant quality gate runs when the code review pipeline already passed them.

**Process:**

1. **Check for redundant quality gates:** Before running `verification-before-completion` (which runs typecheck, lint, build), check if the Code Review Pipeline's Phase 4 already passed these checks in this lifecycle. If it did, check `git status --porcelain`:
   - If output is empty (no modifications since Phase 4): Skip `verification-before-completion`. Announce: "Quality gates already passed in code review Phase 4 — no changes since. Skipping redundant checks."
   - If output is non-empty: Run `verification-before-completion` normally (files changed since Phase 4).

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

## Wait for CI and Address Reviews Step

This step runs after commit and PR (or after mobile-specific steps like app store review) and before comment and close issue. It waits for all CI checks to complete, then addresses any inline code review comments from automated review bots (e.g., Gemini Code Review, CodeRabbit).

**Process:**

### Phase 1: Wait for CI checks

1. Get the PR number from the previous step's output.

2. Poll CI check status every 30 seconds:
   ```bash
   gh pr checks <pr_number> --json name,status,conclusion
   ```
   Note: the JSON field is `status` (values: `queued`, `in_progress`, `completed`), NOT `state`. The `conclusion` field is only populated when `status == "completed"`.

3. Wait until every check has `status: "completed"`.
   - If all have `conclusion: "success"` → proceed to Phase 2.
   - If any have `conclusion: "failure"` → proceed to Phase 3.
   - If no checks exist (empty response) → skip this step entirely, announce: "No CI checks configured — skipped."

4. Safety valve: if checks haven't resolved after 15 minutes (configurable via `ci_timeout_seconds` in `.feature-flow.yml`, default 900), announce:
   ```
   CI checks still pending after 15 minutes. Continuing lifecycle.
   Pending checks: [list names]
   ```

### Phase 2: Address inline review comments

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

4. If no bot comments → skip to output.

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

8. After pushing fixes, re-wait for CI (Phase 1) one more time to confirm the fix commit passes.

### Phase 3: Handle CI failures

1. Identify which checks failed from the `conclusion` field.
2. Categorize:
   - **Test failure** → read failure output via `gh pr checks <pr_number> --json name,conclusion,detailsUrl`, attempt fix, push
   - **Lint / typecheck** → read errors, fix, push
   - **Deploy / infra failure** → not actionable by code changes, warn and continue
   - **Review bot failure** → same as Phase 2
3. After pushing a fix, return to Phase 1 (re-wait for CI).

### Loop Termination

Maximum 2 total fix-and-recheck cycles across Phase 2 and Phase 3 combined. After 2 cycles:
- If checks still failing → warn: "CI still failing after 2 fix attempts. Continuing lifecycle." List failing checks.
- If review bot posts new comments on a fix commit → covered by the cycle count.

**Output:** "CI checks: [N passed, M failed]. Review comments: [X addressed, Y declined]." or "No CI checks configured — skipped."

**YOLO behavior:** Auto-wait silently. Announce periodic status every 60 seconds:
`YOLO: start — Waiting for CI checks (N of M complete, K pending: [names])`
After addressing: `YOLO: start — Review comments → N addressed, K declined`

**Interactive/Express behavior:** Announce wait and show progress. The user can type "skip" to continue without waiting.

**Edge cases:**

| Scenario | Behavior |
|----------|----------|
| Repo has no CI checks | `gh pr checks` returns empty → skip entire step |
| Bot posts summary comment but no inline comments | No inline thread comments to address → skip Phase 2 |
| Bot review arrives after timeout | Missed — user can re-run manually |
| PR has merge conflicts blocking CI | Warn and continue |
| Multiple review bots on same repo | Address inline comments from all bots in one pass |
| Bot suggests change that contradicts design doc | Decline with rationale in the thread reply |

---

## Comment and Close Issue Step

This step runs after "Wait for CI and address reviews" (or after mobile-specific steps like app store review) and before the completion summary. It only runs when a GitHub issue was linked during Step 1 (issue reference detection). If no issue was linked, skip this step silently.

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
     description: "Post issue comment and close issue #[N]",
     prompt: "Post a comment on GitHub issue #[N], then close it. Use exactly this comment body:

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

   Run: gh issue comment [N] --body-file /tmp/ff_issue_comment.md then gh issue close [N] (write the comment body to /tmp/ff_issue_comment.md first to avoid shell quoting issues with apostrophes and special characters). Return 'success' or 'failed: [reason]' so the orchestrator can branch the announcement."
   )
   ```

4. **Announce:**
   - If subagent returned `'success'`: `"Issue #[N] commented and closed."`
   - If subagent returned `'failed: [reason]'`: log `"Issue #[N] comment/close failed — [reason]. Continuing."` and skip success announcement.

**Edge cases:**
- **No issue linked:** Skip this step silently — not all lifecycle runs start from an issue
- **Issue already closed:** Caught in step 1 — skip dispatch. Do not reopen or double-comment.
- **`gh` command fails:** Subagent logs error and continues — non-blocking
- **YOLO/mode propagation:** YOLO propagation applies only to `Skill()` invocations, not `Task()` dispatches. These git/gh subagents require no mode flag.

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
