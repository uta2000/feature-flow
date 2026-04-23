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

**If a specific PR number was provided:**

```bash
ls .feature-flow/handoffs/<pr-number>.yml 2>/dev/null
```

If the file does not exist, announce: `cleanup-merged: no handoff found for PR #<pr-number> — nothing to clean up.` Exit cleanly.

**If no argument was provided (batch mode):**

```bash
ls .feature-flow/handoffs/*.yml 2>/dev/null
```

If no files match, announce: `cleanup-merged: no handoff files found — nothing to clean up.` Exit cleanly (this is the expected no-op path when no sessions have completed).

Exclude `.feature-flow/handoffs/.log` from the list (it is not a handoff YAML file).

### Step 2: For each handoff file — eligibility check

Read the YAML file. Parse the following fields:
- `schema_version` (integer)
- `pr_number` (integer or null)
- `branch` (string)
- `worktree_path` (string)
- `slug` (string)

**Schema version guard:** If `schema_version` is absent or `< 1`, log a warning and skip:
```
cleanup-merged: WARNING — .feature-flow/handoffs/<file>.yml has schema_version < 1 or missing. Skipping (clean up manually: rm .feature-flow/handoffs/<file>.yml).
```

**Pending handoffs:** If `pr_number` is null or absent (the handoff is a `pending-<slug>.yml` file created at Worktree setup but before PR creation), skip silently — the PR does not exist yet.

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

**CWD-safety guard:** Before any action, verify the process is NOT currently inside the worktree being removed:

```bash
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

```bash
git push origin --delete "<branch>" 2>/dev/null || true
```

If the branch is already gone on remote, `git push --delete` exits 0 — treat as success.
If `cleanup.delete_remote_branch: false`, skip this action silently.

**Action 5 — Remove handoff file:**

```bash
rm -f ".feature-flow/handoffs/<handoff_filename>"
```

**Action 6 — Append log entry:**

```bash
mkdir -p .feature-flow/handoffs
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "${TIMESTAMP}  pr=<pr_number>  slug=<slug>  outcome=success" >> .feature-flow/handoffs/.log
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
- `pending-<slug>.yml` files (no `pr_number`) — skipped; PR does not exist yet.

---

## Config

Read from `.feature-flow.yml` `cleanup:` section. All fields optional with defaults:

| Field | Default | Description |
|-------|---------|-------------|
| `cleanup.delete_remote_branch` | `true` | Delete the feature branch from `origin` after merge |
