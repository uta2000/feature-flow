---
name: merge-prs
description: Merges feature-flow PRs in batch. Invoked as the "Ship" phase from the start lifecycle (lifecycle mode), directly with PR numbers or patterns (standalone mode), or as "merge-prs feature-flow" to merge all labeled PRs (cross-session mode).
tools: Read, Glob, Grep, Bash, AskUserQuestion, Task
---

# Merge-PRs — Ship Phase Orchestrator

Discover, order, and merge feature-flow PRs. Supports three invocation modes determined by `$ARGUMENTS`.

**Announce at start:** "Starting Ship phase — discovering feature-flow PRs..."

---

## Mode Detection

Inspect `$ARGUMENTS`:

| Pattern | Mode | Example |
|---------|------|---------|
| Contains PR numbers (e.g. `185 186`) | **Standalone** | `merge-prs 185 186` |
| Contains `all open` | **Standalone** | `merge-prs all open` |
| Contains `epic N` | **Standalone** | `merge-prs epic 175` |
| Equals `feature-flow` | **Cross-session** | `merge-prs feature-flow` |
| Empty / absent | **Lifecycle** | Invoked from start orchestrator |

---

## Lifecycle Mode

Invoked after "Comment and close issue" completes. Session context (base branch, current PR number, design doc path) is passed via `args`.

### Step 1: Discover open feature-flow PRs

```bash
gh pr list \
  --label feature-flow \
  --base <base_branch> \
  --state open \
  --json number,title,headRefName,baseRefName,mergeable,statusCheckRollup
```

- If zero PRs found: announce "Ship: no feature-flow PRs found — lifecycle complete." and exit.
- If PRs found: continue to Step 2.

**YOLO behavior:** `YOLO: ship — [N] PRs discovered`
**Express behavior:** `Express: ship — [N] PRs discovered`

### Step 2: Present Ship phase options

**Interactive/Express — use `AskUserQuestion`:**
- Option 1: "Merge this PR only" — merge just the current session's PR (number from `pr` context key)
- Option 2: "Batch merge all ([N] PRs)" — merge all discovered PRs in optimal order
- Option 3: "Skip — end lifecycle without merging"

**YOLO behavior:** Auto-select based on CI state:
- All PRs have green CI (`statusCheckRollup` all passing): auto-select "Batch merge all"
- Otherwise: auto-select "Merge this PR only"
- Announce: `YOLO: ship — [N] PRs discovered → [choice] ([reason])`

### Step 3: Determine merge order

**Read `references/dependency-analysis.md`** to perform cross-PR import dependency analysis before applying heuristics.

Sort the discovered PRs to minimize conflicts:

1. **Dependency constraints** — if PR B's changed files import a file that PR A changes, PR A merges first. Run dependency analysis per `references/dependency-analysis.md` before applying heuristics 2–5. If a circular dependency is detected, warn and skip to heuristics 2–5.
2. PRs with no pending CI checks first (fastest path)
3. PRs with fewest changed files second (lowest conflict surface)
4. PRs targeting `main` / `master` before PRs targeting feature branches
5. Within ties: ascending PR number (oldest first)

**Express/YOLO:** Announce: `Express: ship — Merge order: #[N1] → #[N2] → ... Proceeding...`
**Interactive:** Present order, wait for confirmation via `AskUserQuestion` before proceeding.

### Step 4: Sequential merge execution

For each PR in merge order:

**4a. Pre-merge checks (parallel `gh` calls):**
```bash
# Check current state
gh pr view <number> --json state,mergeable,statusCheckRollup,reviews
```

- If `state: "MERGED"`: announce "PR #N already merged — skipping." Continue.
- If `mergeable: "CONFLICTING"`: attempt conflict resolution (see §Conflict Resolution).
- If CI failing: enter bounded remediation loop. Read `references/ci-remediation.md` and apply the attempt loop (default: 3 attempts, 10-min wall-clock, 30s poll interval). Skip only after budget exhausted or an `unknown` category is encountered.
- If any unresolved review threads, discussion comments, or formal reviews exist: enter single-pass review triage loop. Read `references/review-triage.md` and apply the triage flow (fetch all feedback surfaces in parallel, filter stale/resolved/self-reply threads, classify and fix, post replies). Review triage runs **before** the CI remediation loop so that any fix commits trigger a fresh CI run which `ci-remediation.md` can then handle. Skip the PR only if an unfixable blocker remains or (in YOLO) an unclear thread is found.

**4b. Merge:**
```bash
gh pr merge <number> --squash --delete-branch
```

Merge strategy from `.feature-flow.yml` `merge.strategy` (default: `squash`).
Delete branch from `merge.delete_branch` (default: `true`).

**4c. Post-merge actions:**
```bash
# Comment on merged PR
gh pr comment <number> --body "Merged via feature-flow Ship phase (batch merge, order: N/M)"

# Check and close linked issue if not already closed
gh issue view <issue_number> --json state --jq '.state'
# If "OPEN": gh issue close <issue_number>
```

**4d. Opportunistic Vercel deploy check (non-blocking):**
Check `.feature-flow.yml` `plugin_registry` for any key containing `vercel`:
```bash
# Only if vercel plugin detected:
gh api repos/{owner}/{repo}/deployments --jq '.[0].statuses_url' 2>/dev/null || true
```
Log result but do not block on it.

**4e. Rate limiting:**
For batches of 10+ PRs: add a 1-second delay between merge operations (`sleep 1`).

### Step 5: Ship Phase Summary

After all PRs are processed:

```
Ship Phase Summary:
  Merged: #185, #186 (2/3)
  Skipped: #190 — behavioral conflict in src/api/handler.ts, could not auto-resolve

  Action needed: Resolve conflict in #190 manually, then run `merge-prs 190`
```

Fire the notification from `notifications.on_stop` in `.feature-flow.yml` if set.

### Step 6: Changelog Consolidation

After all PRs have been processed (merged, skipped, or failed), consolidate any `.changelogs/` fragment files into `CHANGELOG.md`:

1. Check for fragments: `ls .changelogs/*.md 2>/dev/null`
   - If no fragments exist: skip silently and proceed to Standalone Mode
   - If fragments exist: continue

2. Read all fragment files. For each fragment:
   - Parse frontmatter (date, pr, scope)
   - Parse categorized entries (Added, Fixed, Changed, etc.)

3. Read existing `CHANGELOG.md` (or create with Keep a Changelog header if absent):
   ```markdown
   # Changelog

   All notable changes to this project will be documented in this file.

   The format is based on [Keep a Changelog](https://keepachangelog.com/),
   and this project adheres to [Semantic Versioning](https://semver.org/).

   ## [Unreleased]
   ```

4. Merge all fragment entries into `CHANGELOG.md` under `[Unreleased]`:
   - For each category, append entries from all fragments
   - Deduplicate entries with identical text (case-insensitive)
   - Sort categories in standard order: Added, Fixed, Changed, Documentation, Testing, Maintenance
   - Within each category, sort entries alphabetically

5. Delete all processed fragment files: `rm .changelogs/*.md`
   - If `.changelogs/` is now empty, remove the directory: `rmdir .changelogs 2>/dev/null || true`

6. Stage and commit:
   ```bash
   git add CHANGELOG.md
   git rm -r --ignore-unmatch .changelogs/
   git commit -m "chore: consolidate changelog fragments"
   ```

7. Announce: "Consolidated N changelog fragments into CHANGELOG.md (M total entries across K categories)."

**YOLO/Express behavior:** Run consolidation automatically, announce inline: `YOLO: ship — Consolidated N fragments into CHANGELOG.md`

**If no fragments found:** Announce nothing; skip silently.

**Single-PR workflows (no Ship phase):** The fragment file stays on the branch. When the PR is merged manually, the fragment lands on the base branch. The next Ship phase (or manual `merge-prs` invocation) picks it up during consolidation.

---

## Standalone Mode

Accepts explicit PR targets:

| Argument pattern | Behavior |
|-----------------|----------|
| `185 186` | Merge PRs #185 and #186 in the given order |
| `all open` | Query all open PRs on current base branch; merge in optimal order |
| `epic 175` | Query PRs linked to issue #175 via body/title; merge in optimal order |

For `all open`:
```bash
gh pr list --base <current_branch> --state open --json number,title,headRefName,mergeable,statusCheckRollup
```

For `epic N`:
```bash
gh pr list --state open --json number,title,body --jq "[.[] | select(.body | test(\"#N\"))]"
```

For `all open` and `epic N`: execute Step 3 (dependency analysis + merge order), then Step 4 (sequential merge) and Step 5 (summary) from Lifecycle Mode above.

For explicit PR numbers (e.g. `185 186`): skip Step 3 — the user specified the order. Execute Step 4 and Step 5 directly.

---

## Cross-Session Mode

Argument: `feature-flow`

Discover all PRs labeled `feature-flow`:
```bash
gh pr list --label feature-flow --state open --json number,title,headRefName,baseRefName,mergeable,statusCheckRollup
```

Then execute Step 3 (merge order), Step 4 (sequential merge), and Step 5 (summary) from Lifecycle Mode above.

---

## Conflict Resolution

**Read `references/conflict-resolution.md`** when a PR reports `mergeable: "CONFLICTING"`.

Summary of resolution strategy:

1. Create a temporary worktree for conflict resolution:
   ```bash
   git worktree add /tmp/merge-prs-conflict-<number> <headRefName>
   ```
2. Merge base branch into the worktree:
   ```bash
   cd /tmp/merge-prs-conflict-<number> && git merge origin/<base_branch>
   ```
3. Classify each conflict per `references/conflict-resolution.md` rules.
4. For trivial conflicts: auto-resolve and announce.
5. For behavioral conflicts: **always pause** regardless of mode. Present conflict diff and ask for direction.
6. After resolution: `git add . && git commit && git push`
7. **Cleanup:** Always remove the worktree, even on error:
   ```bash
   ORIG_DIR=$(pwd)
   # ... conflict resolution work ...
   cd "$ORIG_DIR"
   git worktree remove /tmp/merge-prs-conflict-<number> --force 2>/dev/null || true
   ```

**CWD Safety Guard:** Before removing any worktree, capture `ORIG_DIR=$(pwd)` and `cd "$ORIG_DIR"` after worktree operations. Never `cd` into a path that is about to be deleted.

---

## Error Recovery

Strategy: continue-on-failure. Every skip is reported with a reason.

| Error | Action |
|-------|--------|
| PR already merged | Detect via `gh pr view`. Announce "PR #N already merged — skipping." Continue. |
| Merge conflict, auto-resolvable | Auto-resolve (trivial), announce, continue |
| Merge conflict, behavioral | Pause for confirmation. If unresolved, skip with reason |
| CI failing | Enter bounded remediation loop (see `references/ci-remediation.md`). Skip only after `MAX_ATTEMPTS` / `MAX_WALL_CLOCK` exhausted or `unknown` category detected. |
| Unresolved review requests | Skip with reason |
| GitHub API error | Retry once after 5 seconds. If still failing, skip with reason |

---

## Config

Read from `.feature-flow.yml` `merge:` section. All fields optional with defaults:

| Field | Default | Description |
|-------|---------|-------------|
| `strategy` | `squash` | `squash` \| `merge` \| `rebase` |
| `delete_branch` | `true` | Delete branch after merge |
| `require_ci` | `true` | Require CI green before merge |
| `require_review` | `true` | Require approved review before merge |
| `auto_discover` | `label` | `label` \| `body_marker` \| `both` |
| `ci_remediation.max_attempts` | `3` | Max CI fix attempts before skipping (integer >= 1). See `references/ci-remediation.md`. |
| `ci_remediation.max_wall_clock_minutes` | `10` | Wall-clock budget per PR (integer >= 1) |
| `ci_remediation.ci_poll_interval_seconds` | `30` | CI poll interval (integer >= 10) |
