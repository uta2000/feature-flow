---
name: merge-prs
description: Merges feature-flow PRs in batch. Invoked directly with PR numbers or patterns (standalone mode), or as "merge-prs feature-flow" to merge all labeled PRs (cross-session mode).
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

For `all open` and `epic N`: execute Step 3 (dependency analysis + merge order), then Step 4 (sequential merge) and Step 5 (summary) as described in the sections below.

For explicit PR numbers (e.g. `185 186`): skip Step 3 — the user specified the order. Execute Step 4 and Step 5 directly.

---

## Cross-Session Mode

Argument: `feature-flow`

Discover all PRs labeled `feature-flow`:
```bash
gh pr list --label feature-flow --state open --json number,title,headRefName,baseRefName,mergeable,statusCheckRollup
```

Then execute Step 3 (merge order), Step 4 (sequential merge), and Step 5 (summary) as described in the sections below.

---

## Step 3: Determine Merge Order

**Read `references/dependency-analysis.md`** to perform cross-PR import dependency analysis before applying heuristics.

Sort the discovered PRs to minimize conflicts:

1. **Dependency constraints** — if PR B's changed files import a file that PR A changes, PR A merges first. Run dependency analysis per `references/dependency-analysis.md` before applying heuristics 2–5. If a circular dependency is detected, warn and skip to heuristics 2–5.
2. PRs with no pending CI checks first (fastest path)
3. PRs with fewest changed files second (lowest conflict surface)
4. PRs targeting `main` / `master` before PRs targeting feature branches
5. Within ties: ascending PR number (oldest first)

**Express/YOLO:** Announce: `Express: merge-prs — Merge order: #[N1] → #[N2] → ... Proceeding...`
**Interactive:** Present order, wait for confirmation via `AskUserQuestion` before proceeding.

## Step 4: Sequential Merge Execution

For each PR in merge order:

**4a. Pre-merge checks:**

**4a.0 Parse feature-flow-metadata block.** Fetch the PR body and parse the `feature-flow-metadata` block per ../../references/feature-flow-metadata-schema.md §Parsing:
```bash
gh pr view <number> --json body --jq '.body'
```
- On successful parse: bind `metadata.sibling_prs`, `metadata.depends_on_prs`, `metadata.risk_areas`, and `metadata.remediation_log` into the PR's pre-merge context for use in dependency analysis (Step 3) and CI remediation de-duplication (Step 4b).
- On absent block, unparseable block, unknown version, or missing required fields: log one warning (per ../../references/feature-flow-metadata-schema.md §Parsing warning budget), bind `metadata` to `null`, and continue with diff-based inference. This is the expected path for PRs created outside the lifecycle.
- See `references/fixtures/` for test cases: `metadata-block-happy.md` (success path), `metadata-block-minimal.md` (required-only / optional fields default to null), `metadata-block-unparseable.md`, `metadata-block-absent.md`, `metadata-block-unknown-version.md`.

**4a.1 Check current state (parallel `gh` calls):**
```bash
# Check current state
gh pr view <number> --json state,mergeable,statusCheckRollup,reviews
```

- If `state: "MERGED"`: announce "PR #N already merged — skipping." Continue.
- If `mergeable: "CONFLICTING"`: attempt conflict resolution (see §Conflict Resolution).
- If CI failing: enter bounded remediation loop. Read `../../references/ci-remediation.md` and apply the attempt loop (default: 3 attempts, 10-min wall-clock, 30s poll interval). Skip only after budget exhausted or an `unknown` category is encountered.
- If any unresolved review threads, discussion comments, or formal reviews exist: enter single-pass review triage loop. Read `../../references/review-triage.md` and apply the triage flow (fetch all feedback surfaces in parallel, filter stale/resolved/self-reply threads, classify and fix, post replies). Review triage runs **before** the CI remediation loop so that any fix commits trigger a fresh CI run which `../../references/ci-remediation.md` can then handle. Skip the PR only if an unfixable blocker remains or (in YOLO) an unclear thread is found.

**4b. Merge:**
```bash
gh pr merge <number> --squash --delete-branch
```

Merge strategy from `.feature-flow.yml` `merge.strategy` (default: `squash`).
Delete branch from `merge.delete_branch` (default: `true`).

**4c. Post-merge actions:**
```bash
# Comment on merged PR
gh pr comment <number> --body "Merged via feature-flow merge-prs (batch merge, order: N/M)"
```

<!-- Issue closure happens via `Closes #N` in PR bodies (GitHub native auto-close).
     The lifecycle no longer closes issues here — see issue #228. -->

**4c.1 Post-merge cleanup (non-blocking):**

Invoke `feature-flow:cleanup-merged` for this PR:

```
Skill(skill: "feature-flow:cleanup-merged", args: "<pr_number>")
```

If `cleanup-merged` fails or throws an error, log a warning and continue:
```
merge-prs: cleanup-merged failed for PR #<pr_number>: <error> — handoff retained for next opportunistic run.
```

Cleanup failure **must not** fail the merge operation itself. The handoff file remains on disk for the next `start:` session's pre-flight to retry.

**4d. Opportunistic Vercel deploy check (non-blocking):**
Check `.feature-flow.yml` `plugin_registry` for any key containing `vercel`:
```bash
# Only if vercel plugin detected:
gh api repos/{owner}/{repo}/deployments --jq '.[0].statuses_url' 2>/dev/null || true
```
Log result but do not block on it.

**4e. Rate limiting:**
For batches of 10+ PRs: add a 1-second delay between merge operations (`sleep 1`).

## Step 5: Merge Summary

After all PRs are processed:

```
Merge Summary:
  Merged: #185, #186 (2/3)
  Skipped: #190 — behavioral conflict in src/api/handler.ts, could not auto-resolve

  Action needed: Resolve conflict in #190 manually, then run `merge-prs 190`
```

Fire the notification from `notifications.on_stop` in `.feature-flow.yml` if set.

## Step 6: Changelog Consolidation

After all PRs have been processed (merged, skipped, or failed), consolidate any `.changelogs/` fragment files into `CHANGELOG.md`:

1. Check for fragments: `ls .changelogs/*.md 2>/dev/null`
   - If no fragments exist: skip silently
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

**YOLO/Express behavior:** Run consolidation automatically, announce inline: `YOLO: merge-prs — Consolidated N fragments into CHANGELOG.md`

**If no fragments found:** Announce nothing; skip silently.

---

## Conflict Resolution

**Read `../../references/conflict-resolution.md`** when a PR reports `mergeable: "CONFLICTING"`.

Summary of resolution strategy — the **4-tier ladder** (Tier 1 → Tier 2 → Tier 3 → Tier 4):

1. Create a temporary worktree for conflict resolution:
   ```bash
   git worktree add /tmp/merge-prs-conflict-<number> <headRefName>
   ```
2. Merge base branch into the worktree:
   ```bash
   cd /tmp/merge-prs-conflict-<number> && git merge origin/<base_branch>
   ```
3. For each conflict, run Structure Classification per `../../references/conflict-resolution.md` and route to the appropriate tier.
4. **Tier 1 — Trivial auto-resolve.** Imports, lockfiles, adjacent additions, one-sided modifications, context-only keywords → auto-resolve and announce. No user interaction in any mode.
5. **Tier 2 — Attempt-with-test-verification.** Both-sided modifications that pass the structural independence gate → attempt an additive union merge, run the project test suite under a hard 5-minute timeout (`merge.conflict_resolution.test_timeout_minutes`, configurable), and commit with the literal message `merge: resolve conflict, verified by tests` if tests pass. On test failure or timeout, discard the attempt via `git checkout -- .` and escalate to Tier 3 with the test output captured for presentation.
6. **Tier 3 — Diff presentation. ALWAYS pauses regardless of mode, including YOLO (safety invariant).** Present the conflict diff, the Tier 2 proposed resolution (if any), and the test failure output (if Tier 2 was attempted) via `AskUserQuestion`. Options: Accept proposed / Accept ours / Accept theirs / I'll resolve manually / Skip this PR.
7. **Tier 4 — Skip (last resort).** Reached only when Tier 3 is declined or manual resolution fails. Log reason, report in Ship Phase Summary, continue with remaining PRs.
8. After Tier 1 or Tier 2 success: `git add . && git commit && git push`. Tier 1 uses its existing per-type commit message; Tier 2 uses the fixed literal message `merge: resolve conflict, verified by tests`.
9. **Cleanup:** Always remove the worktree, even on error:
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
| Merge conflict, structurally independent | Tier 2: attempt additive merge + run tests. Commit if green, escalate to Tier 3 if red. |
| Merge conflict, semantic overlap | Tier 3: pause via `AskUserQuestion`, present diff + proposed resolution + test output. Always pauses regardless of mode. |
| CI failing | Enter bounded remediation loop (see `../../references/ci-remediation.md`). Skip only after `MAX_ATTEMPTS` / `MAX_WALL_CLOCK` exhausted or `unknown` category detected. |
| Unresolved review requests | Enter single-pass review triage loop (see `../../references/review-triage.md`). Skip only if blockers cannot be fixed or (in YOLO) unclear threads remain. |
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
| `ci_remediation.max_attempts` | `3` | Max CI fix attempts before skipping (integer >= 1). See `../../references/ci-remediation.md`. |
| `ci_remediation.max_wall_clock_minutes` | `10` | Wall-clock budget per PR (integer >= 1) |
| `ci_remediation.ci_poll_interval_seconds` | `30` | CI poll interval (integer >= 10) |
| `conflict_resolution.test_command` | *(none)* | Optional override for Tier 2 test runner. If unset, stack-based detection is used. See `../../references/conflict-resolution.md` § Test Runner Discovery. |
| `conflict_resolution.test_timeout_minutes` | `5` | Hard wall-clock timeout for Tier 2 test verification. Minimum 1. |
