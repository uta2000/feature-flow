---
name: cleanup-merged
description: Cleans up worktrees, local branches, remote branches, and handoff files for merged or closed PRs. Invoked automatically by merge-prs after a successful merge, and opportunistically by start: at session kickoff. Safe to run manually at any time — all actions are idempotent.
tools: Read, Bash
---

# Cleanup Merged — Post-Merge Worktree Reclaimer

Remove the local artifacts (worktree, local branch, remote branch, handoff file) that were created for a feature branch once its PR is merged or closed.

**Announce at start:** "Running cleanup-merged to reclaim worktrees and branches for merged PRs..."

---

## Invocation

| Argument pattern | Behavior |
|-----------------|----------|
| `cleanup-merged <pr-number>` | Clean up exactly one PR's handoff |
| `cleanup-merged` (no argument) | Scan `.feature-flow/handoffs/*.yml`, clean up every handoff whose PR is `MERGED` or `CLOSED` |

---

## Process

### Step 1: Resolve handoff files to process

**CWD to base repo first.** Handoff files live at `.feature-flow/handoffs/` relative to the base repo root. If this skill is invoked from inside a worktree (or any other subdirectory), relative paths in the subsequent discovery would silently miss the handoffs. Resolve the base repo root up front and `cd` there:

```bash
BASE_REPO=$(git rev-parse --show-toplevel 2>/dev/null || git rev-parse --git-common-dir 2>/dev/null | xargs dirname)
if [ -z "$BASE_REPO" ] || [ ! -d "$BASE_REPO/.feature-flow/handoffs" ]; then
  echo "cleanup-merged: no base repo or no .feature-flow/handoffs/ directory — nothing to clean up."
  exit 0
fi
cd "$BASE_REPO"
```

**If a specific PR number was provided:**

```bash
ls .feature-flow/handoffs/<pr-number>.yml 2>/dev/null
```

If the file does not exist, announce: `cleanup-merged: no handoff found for PR #<pr-number> — nothing to clean up.` Exit cleanly.

**If no argument was provided (batch mode):**

Use `find` (not `ls`) to avoid literal-pattern pitfalls under `nullglob` unset:

```bash
find .feature-flow/handoffs -maxdepth 1 -type f -name '*.yml' 2>/dev/null
```

If no files match, announce: `cleanup-merged: no handoff files found — nothing to clean up.` Exit cleanly (this is the expected no-op path when no sessions have completed).

Exclude `.feature-flow/handoffs/.log` from the list (it is not a handoff YAML file).

### Step 2: For each handoff file — eligibility check

Read the YAML file. Parse the following fields:
- `schema_version` (integer)
- `pr_number` (integer)
- `branch` (string)
- `worktree_path` (string)
- `slug` (string)
- `feature_flow_version` (string, optional — the feature-flow version that created this handoff; also stored as `plugin_version`)

**Schema version guard:** If `schema_version` is absent or `< 1`, or YAML parsing fails, log a warning and skip. Never abort batch mode on a single unparseable file:

```
cleanup-merged: WARNING — .feature-flow/handoffs/<file>.yml is unparseable or has schema_version < 1. Skipping (clean up manually: rm .feature-flow/handoffs/<file>.yml).
```

**Missing pr_number:** If `pr_number` is null or absent, route by filename pattern before deciding to skip:

- **`in-progress-*.yml` filename pattern:** These are durable phase-state files written during the lifecycle (before PR creation). Their schema is documented in `start/SKILL.md` → "In-Progress State File Schema". They are orphaned when their worktree no longer exists. Check worktree existence and remove the file if the worktree is gone:

  ```bash
  FILENAME=$(basename "<handoff_filepath>")
  if [[ "$FILENAME" == in-progress-*.yml ]]; then
    WORKTREE_PATH=$(python3 -c "import yaml; d=yaml.safe_load(open('<handoff_filepath>')); print(d.get('worktree_path',''))" 2>/dev/null)
    if [ -n "$WORKTREE_PATH" ] && [ ! -d "$WORKTREE_PATH" ]; then
      # Worktree is gone — orphaned in-progress file; remove it.
      rm -f "<handoff_filepath>"
      echo "cleanup-merged: orphaned in-progress file removed — ${FILENAME} (worktree ${WORKTREE_PATH} no longer exists)"
      # Append log entry: outcome=success-orphan
      TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
      SLUG=${FILENAME#in-progress-}; SLUG=${SLUG%.yml}
      echo "${TIMESTAMP}  pr=null  slug=${SLUG}  outcome=success-orphan" >> .feature-flow/handoffs/.log
    elif [ -n "$WORKTREE_PATH" ] && [ -d "$WORKTREE_PATH" ]; then
      # Worktree still exists — feature is in progress; skip silently (no announcement).
      :
    else
      # worktree_path field missing or empty — skip with warning.
      echo "cleanup-merged: WARNING — ${FILENAME} has no worktree_path field. Skipping (clean up manually: rm .feature-flow/handoffs/${FILENAME})."
    fi
    continue   # Done processing this file — do not fall through to the legacy branch.
  fi
  ```

- **Legacy filename (no `in-progress-` prefix and no `pr_number`):** This is a legacy artifact — skip silently and log:

  ```
  cleanup-merged: WARNING — <filename> has no pr_number and is not an in-progress file. Skipping (clean up manually).
  ```

Since 2026-04-23, numbered handoff files are only written after PR creation (no more `pending-<slug>.yml`), so any `*.yml` file with no `pr_number` is either an in-progress file (handled above) or a legacy artifact.

**PR state check:** Query the PR state:

```bash
gh pr view <pr_number> --json state --jq '.state'
```

- `"OPEN"` → skip (not eligible). No announcement.
- `"MERGED"` or `"CLOSED"` → proceed to Step 3.
- Command fails (PR number not found, network error) → log warning, skip:
  `cleanup-merged: WARNING — could not check state for PR #<pr_number>: <error>. Skipping.`

### Step 3: Cleanup actions (idempotent, best-effort, non-fatal)

Run all six actions in order. Each action tolerates "already done" state — a missing worktree, an already-deleted branch, or an already-removed file is treated as success for that action.

**CWD-safety guard:** Before any action, capture the base repo root and verify the process is NOT currently inside the worktree being removed:

```bash
# Capture BASE_REPO before any removal — if CWD is inside the worktree,
# git rev-parse will still work because the worktree exists at this point.
BASE_REPO=$(git rev-parse --show-toplevel)

CURRENT_DIR=$(pwd)
if [[ "$CURRENT_DIR" == "${worktree_path}"* ]]; then
  echo "cleanup-merged: SAFETY — refusing to remove worktree currently in use at ${worktree_path}. Change to the base repo root first."
  # Skip the worktree removal action only; continue with remaining actions
fi
```

**Action 1 — Remove worktree:**

```bash
git worktree remove "<worktree_path>" --force 2>/dev/null || true
```

Announce on success: `cleanup-merged: worktree removed — <worktree_path>`
Announce on skip (CWD safety): `cleanup-merged: worktree removal skipped — currently inside worktree (safe to retry from base repo root).`

```bash
# Ensure CWD is stable for Actions 2–6 even if CWD was inside the removed worktree.
cd "$BASE_REPO" || exit 1
```

**Action 2 — Fallback directory removal:**

If Action 1 succeeded but the directory still exists:

```bash
if [ -d "<worktree_path>" ]; then
  rm -rf "<worktree_path>"
fi
```

**Action 3 — Delete local branch:**

```bash
git branch -D "<branch>" 2>/dev/null || true
```

Announce on success: `cleanup-merged: local branch deleted — <branch>`
"Already gone" (branch not found) is treated as success — announce nothing.

**Action 4 — Delete remote branch (gated by config):**

Read `.feature-flow.yml` field `cleanup.delete_remote_branch` (default: `true`).
If `cleanup.delete_remote_branch: false`, skip this action silently.

Distinguish **"already gone"** (expected — treat as success) from **real failures** (auth, network, permissions — must NOT swallow, or the handoff file is incorrectly removed in Action 5):

```bash
# Capture both exit code and stderr to classify failure type.
PUSH_OUT=$(git push origin --delete "<branch>" 2>&1)
PUSH_RC=$?
if [ $PUSH_RC -eq 0 ]; then
  :  # success
elif echo "$PUSH_OUT" | grep -qE 'remote ref does not exist|unable to delete .*: remote ref does not exist'; then
  :  # already gone — treat as success
else
  # Real failure (auth, network, permissions). Route through partial-failure handling:
  # retain the handoff file for retry and log the outcome as partial.
  echo "cleanup-merged: remote branch delete failed for '<branch>' — $PUSH_OUT"
  REMOTE_DELETE_FAILED=1
fi
```

If `REMOTE_DELETE_FAILED` is set, skip Action 5 (do NOT remove the handoff file) and set the log outcome (Action 6) to `partial-remote-delete`. The handoff file stays so the next `cleanup-merged` run retries.

**Action 5 — Remove handoff file:**

Skip this action if `REMOTE_DELETE_FAILED` was set in Action 4 — the handoff file stays so the next run retries the remote delete.

```bash
if [ -z "$REMOTE_DELETE_FAILED" ]; then
  rm -f ".feature-flow/handoffs/<handoff_filename>"
fi
```

**Action 6 — Append log entry:**

```bash
mkdir -p .feature-flow/handoffs
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
OUTCOME=${REMOTE_DELETE_FAILED:+partial-remote-delete}
OUTCOME=${OUTCOME:-success}
echo "${TIMESTAMP}  pr=<pr_number>  slug=<slug>  outcome=${OUTCOME}" >> .feature-flow/handoffs/.log
```

### Step 4: Failure handling

If any action exits with a non-zero status (and the "already done" tolerance does not apply):

1. Announce: `cleanup-merged: <action> failed for PR #<pr_number>: <error> — handoff retained for retry.`
2. Leave the handoff file in place (skip Action 5 and Action 6 for that handoff; log `outcome=partial-<action>` instead of `outcome=success`).
3. Continue with the next handoff (do not abort batch cleanup).

Log format for partial failure:

```bash
echo "${TIMESTAMP}  pr=<pr_number>  slug=<slug>  outcome=partial-action<N>" >> .feature-flow/handoffs/.log
```

### Step 5: Summary

After processing all handoffs:

```
cleanup-merged: done.
  Cleaned: PR #123 (logout-button-a3f2), PR #124 (billing-renewal-9c1e)
  Orphaned in-progress removed: in-progress-9c1e.yml (worktree gone)
  Skipped (open): PR #125
  Failed (retrying on next run): PR #120 — worktree removal failed: <reason>
  No-op: 0 handoffs found
```

If this was a silent pre-flight invocation from `start:` and no handoffs were cleaned, output nothing (silent no-op).

---

## Scope

### Explicitly excluded

- `.dispatcher-worktrees/` — managed by the GSD dispatcher; never touched by this skill.
- Handoffs with `schema_version < 1` — skip with a warning; user cleans manually.
- Worktrees without a handoff file — these aren't auto-reclaimed (no state to reconcile). Users clean those manually if/when needed. Since 2026-04-23, handoff files are only written post-PR-creation, so this matches the "worktree exists but no PR yet" case naturally.

---

## Config

Read from `.feature-flow.yml` `cleanup:` section. All fields optional with defaults:

| Field | Default | Description |
|-------|---------|-------------|
| `cleanup.delete_remote_branch` | `true` | Delete the feature branch from `origin` after merge |
