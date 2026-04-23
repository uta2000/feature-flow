# Worktree-First Lifecycle — Implementation Plan

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1.1: Create skills/cleanup-merged/SKILL.md — STATUS: pending — Phase: phase-1
Task 1.2: Add .feature-flow/handoffs/ gitignore entry — STATUS: pending — Phase: phase-1
Task 1.3: Create docs/plans/README.md advisory — STATUS: pending — Phase: phase-1
Task 1.4: Phase 1 integration test — STATUS: pending — Phase: phase-1
Task 2.1: Rewrite step-lists.md — four non-quick scope templates — STATUS: pending — Phase: phase-2
Task 2.2: Update SKILL.md Skill Mapping table — STATUS: pending — Phase: phase-2
Task 2.3: Rewrite inline-steps.md — delete Commit Planning Artifacts section and defer-logic — STATUS: pending — Phase: phase-2
Task 2.4: Phase 2 integration test — STATUS: pending — Phase: phase-2
Task 3.1: Rewrite skills/design-document/SKILL.md — issue-body merge protocol — STATUS: pending — Phase: phase-3
Task 3.2: Rewrite skills/design-verification/SKILL.md Step 1 — load design from issue body — STATUS: pending — Phase: phase-3
Task 3.3: Rewrite skills/create-issue/SKILL.md — marker contract + no docs/plans glob — STATUS: pending — Phase: phase-3
Task 3.4: Update conflict-resolution.md fallback in start skill — STATUS: pending — Phase: phase-3
Task 3.5: Update feature-flow-metadata-schema.md — design_doc → design_issue — STATUS: pending — Phase: phase-3
Task 3.6: Update yolo-overrides.md — remove design_doc from lifecycle context object — STATUS: pending — Phase: phase-3
Task 3.7: Phase 3 integration test — STATUS: pending — Phase: phase-3
Task 4.1: Wire merge-prs to invoke cleanup-merged after successful merge — STATUS: pending — Phase: phase-4
Task 4.2: Add opportunistic cleanup pre-flight to start SKILL.md — STATUS: pending — Phase: phase-4
Task 4.3: Update yolo-overrides.md Handoff step — do NOT remove worktree — STATUS: pending — Phase: phase-4
Task 4.4: Phase 4 integration test — STATUS: pending — Phase: phase-4
CURRENT: none
-->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the `start:` lifecycle so every session isolates immediately in its own worktree, design content lives in the GitHub issue body, and worktree/branch cleanup defers to after PR merge.

**Architecture:** Four phases track the design doc's §4 implementation strategy: (1) scaffold the new `cleanup-merged` skill and gitignore entry; (2) restructure step-lists and inline-steps to put Worktree first and remove Commit Planning Artifacts; (3) fold design document writing into the GitHub issue body and update all consumers; (4) wire post-merge cleanup into `merge-prs` and add an opportunistic pre-flight to `start:`. All changes are Markdown/skill-file edits verified by grep/test/file-existence ACs.

**Tech Stack:** Skill markdown files (`*.md`), `gh` CLI, `git` CLI, YAML state files; no compiled code.

---

## Phase 1 — Scaffold cleanup-merged skill

### Task 1.1: Create skills/cleanup-merged/SKILL.md

**Files:**
- Create: `skills/cleanup-merged/SKILL.md`

- [ ] **Step 1: Create the skills/cleanup-merged/ directory**

```bash
mkdir -p /Users/paulholstein/projects/feature-flow/skills/cleanup-merged
```

Expected: exits 0, directory exists.

- [ ] **Step 2: Write SKILL.md with the full cleanup-merged skill definition**

Write `/Users/paulholstein/projects/feature-flow/skills/cleanup-merged/SKILL.md` with the following content:

```markdown
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
```

- [ ] **Step 3: Verify the file was created with correct content**

```bash
test -f /Users/paulholstein/projects/feature-flow/skills/cleanup-merged/SKILL.md && echo "exists"
```

Expected: `exists`

- [ ] **Step 4: Commit**

```bash
cd /Users/paulholstein/projects/feature-flow
git add skills/cleanup-merged/SKILL.md
git commit -m "feat(cleanup-merged): scaffold new cleanup-merged skill — ✓AC-16"
```

**Acceptance Criteria:**
- [ ] `test -f skills/cleanup-merged/SKILL.md` exits 0
- [ ] `grep -q "cleanup-merged" skills/cleanup-merged/SKILL.md`
- [ ] `grep -q "schema_version" skills/cleanup-merged/SKILL.md`
- [ ] `grep -q "MERGED\|CLOSED" skills/cleanup-merged/SKILL.md`
- [ ] `grep -q "dispatcher-worktrees" skills/cleanup-merged/SKILL.md` (confirms exclusion is documented)
- [ ] `grep -q "pending_slug\|pending-" skills/cleanup-merged/SKILL.md`
- [ ] `grep -q "outcome=success" skills/cleanup-merged/SKILL.md`
- [ ] `grep -q "cleanup.delete_remote_branch" skills/cleanup-merged/SKILL.md`

**Quality Constraints:**
- Parallelizable: no (new file; no conflicts with other tasks)
- Pattern reference: follow existing SKILL.md conventions in `skills/merge-prs/SKILL.md`

---

### Task 1.2: Add .feature-flow/handoffs/ gitignore entry

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Verify the entry does not already exist**

```bash
grep -q "handoffs" /Users/paulholstein/projects/feature-flow/.gitignore && echo "already present" || echo "missing"
```

Expected: `missing` (proceed only if missing).

- [ ] **Step 2: Append the gitignore entry**

Read `/Users/paulholstein/projects/feature-flow/.gitignore` and append the following block at the end:

```
# feature-flow handoff state files (local only — never committed)
.feature-flow/handoffs/
```

Note: `.feature-flow/` is already gitignored broadly. The explicit `handoffs/` entry is belt-and-suspenders and makes the intent clear to readers.

- [ ] **Step 3: Verify the entry is present**

```bash
grep -q ".feature-flow/handoffs/" /Users/paulholstein/projects/feature-flow/.gitignore && echo "present"
```

Expected: `present`

- [ ] **Step 4: Commit**

```bash
cd /Users/paulholstein/projects/feature-flow
git add .gitignore
git commit -m "chore(gitignore): add .feature-flow/handoffs/ explicit entry — ✓AC-15"
```

**Acceptance Criteria:**
- [ ] `grep -q ".feature-flow/handoffs/" .gitignore`

**Quality Constraints:**
- Parallelizable: no (depends on worktree existing; precondition for Task 1.1)
- Pattern reference: follow existing `.gitignore` section structure

---

### Task 1.3: Create docs/plans/README.md advisory

**Files:**
- Create: `docs/plans/README.md`

- [ ] **Step 1: Write the advisory README**

Write `/Users/paulholstein/projects/feature-flow/docs/plans/README.md` with the following content:

```markdown
# Design Documents — Historical Archive

This directory contains design documents created before 2026-04-23.

**Active designs (created after 2026-04-23) live in their linked GitHub issue body** under the `## Design (feature-flow)` section, inserted by the `feature-flow:design-document` skill between HTML-comment markers:

```
<!-- feature-flow:design:start -->
## Design (feature-flow)

<generated design content>

<!-- feature-flow:design:end -->
```

To read the design for an active feature, open the linked GitHub issue and scroll to `## Design (feature-flow)`.

## Why issues instead of files?

- Design is a working artifact consumed within a single session. After merge, the PR body, linked issue, and commit log are the durable record.
- Running multiple `start:` sessions in parallel previously caused collisions when all sessions wrote to `docs/plans/` on the base branch simultaneously.
- The natural home for a design is the GitHub issue it belongs to.

## Files in this directory

The `*.md` files here are historical — kept as-is for reference. Do not delete or move them.
See the [feature-flow plugin](../../skills/design-document/SKILL.md) for the current lifecycle.
```

- [ ] **Step 2: Verify the file was created**

```bash
test -f /Users/paulholstein/projects/feature-flow/docs/plans/README.md && echo "exists"
```

Expected: `exists`

- [ ] **Step 3: Verify advisory content**

```bash
grep -q "feature-flow:design:start" /Users/paulholstein/projects/feature-flow/docs/plans/README.md && echo "has marker"
grep -q "2026-04-23" /Users/paulholstein/projects/feature-flow/docs/plans/README.md && echo "has date"
```

Expected: both print their confirmation strings.

- [ ] **Step 4: Commit**

```bash
cd /Users/paulholstein/projects/feature-flow
git add docs/plans/README.md
git commit -m "docs(plans): add advisory README pointing to GitHub issues for active designs — ✓AC-21"
```

**Acceptance Criteria:**
- [ ] `test -f docs/plans/README.md` exits 0
- [ ] `grep -q "feature-flow:design:start" docs/plans/README.md`
- [ ] `grep -q "2026-04-23" docs/plans/README.md`
- [ ] `grep -q "GitHub issue" docs/plans/README.md`

**Quality Constraints:**
- Parallelizable: yes (no file conflicts with Tasks 1.1 or 1.2)
- Pattern reference: advisory README, no special format required

---

### Task 1.4: Phase 1 integration test

Validates AC-9, AC-15, AC-16, AC-21 from the design doc.

**Files:**
- Read: `skills/cleanup-merged/SKILL.md`, `.gitignore`, `docs/plans/README.md`

- [ ] **Step 1: Verify cleanup-merged skill exists and has required sections**

```bash
test -f /Users/paulholstein/projects/feature-flow/skills/cleanup-merged/SKILL.md
grep -q "name: cleanup-merged" /Users/paulholstein/projects/feature-flow/skills/cleanup-merged/SKILL.md
grep -q "gh pr view" /Users/paulholstein/projects/feature-flow/skills/cleanup-merged/SKILL.md
grep -q "git worktree remove" /Users/paulholstein/projects/feature-flow/skills/cleanup-merged/SKILL.md
grep -q "git branch -D" /Users/paulholstein/projects/feature-flow/skills/cleanup-merged/SKILL.md
grep -q "git push origin --delete" /Users/paulholstein/projects/feature-flow/skills/cleanup-merged/SKILL.md
grep -q "rm -f.*handoffs" /Users/paulholstein/projects/feature-flow/skills/cleanup-merged/SKILL.md
grep -q "\.log" /Users/paulholstein/projects/feature-flow/skills/cleanup-merged/SKILL.md
```

All must exit 0.

- [ ] **Step 2: Verify idempotency documentation**

```bash
grep -q "idempotent\|already done\|already gone" /Users/paulholstein/projects/feature-flow/skills/cleanup-merged/SKILL.md
```

Expected: exits 0.

- [ ] **Step 3: Verify gitignore entry**

```bash
grep -q ".feature-flow/handoffs/" /Users/paulholstein/projects/feature-flow/.gitignore
```

Expected: exits 0.

- [ ] **Step 4: Verify README advisory**

```bash
test -f /Users/paulholstein/projects/feature-flow/docs/plans/README.md
grep -q "GitHub issue" /Users/paulholstein/projects/feature-flow/docs/plans/README.md
```

Expected: both exit 0.

- [ ] **Step 5: Verify dispatcher-worktrees exclusion**

```bash
grep -q "dispatcher-worktrees" /Users/paulholstein/projects/feature-flow/skills/cleanup-merged/SKILL.md
```

Expected: exits 0 (confirms the explicit exclusion is documented).

**Acceptance Criteria (maps to design doc ACs):**
- [ ] AC-9: `test -f skills/cleanup-merged/SKILL.md` AND `grep -q "MERGED\|CLOSED" skills/cleanup-merged/SKILL.md`
- [ ] AC-15: `grep -q ".feature-flow/handoffs/" .gitignore`
- [ ] AC-16: `grep -q "schema_version" skills/cleanup-merged/SKILL.md` AND `grep -q "git worktree remove" skills/cleanup-merged/SKILL.md` AND `grep -q "git branch -D" skills/cleanup-merged/SKILL.md` AND `grep -q "git push origin --delete" skills/cleanup-merged/SKILL.md` AND `grep -q "rm -f" skills/cleanup-merged/SKILL.md` AND `grep -q "\.log" skills/cleanup-merged/SKILL.md`
- [ ] AC-21: `test -f docs/plans/README.md` AND `grep -q "GitHub issue" docs/plans/README.md`

**Quality Constraints:**
- Parallelizable: no (depends on Tasks 1.1–1.3 completing)

---

## Phase 2 — Step-list restructure

### Task 2.1: Rewrite step-lists.md — four non-quick scope templates

**Files:**
- Modify: `skills/start/references/step-lists.md` (lines ~39–139)

- [ ] **Step 1: Read the current file to understand the exact content to replace**

Read `skills/start/references/step-lists.md` lines 39–139 to capture exact text for the old_string parameters.

- [ ] **Step 2: Replace the Small enhancement — standard step list**

Find the block starting at `### Small enhancement` and replace the standard step list (lines ~42–64) with:

```markdown
### Small enhancement

If the small enhancement qualifies for fast-track (issue richness 3+ or equivalent inline detail), use the fast-track step list. Otherwise, use the standard step list.

*Standard (no fast-track):*
```
- [ ] 1. Worktree setup
- [ ] 2. Copy env files
- [ ] 3. Brainstorm requirements
- [ ] 4. Documentation lookup (Context7)
- [ ] 5. Create issue
- [ ] 6. Design document
- [ ] 7. Implementation plan
- [ ] 8. Verify plan criteria
- [ ] 9. Study existing patterns
- [ ] 10. Implement (TDD)
- [ ] 11. Self-review
- [ ] 12. Code review
- [ ] 13. Generate CHANGELOG entry
- [ ] 14. Final verification
- [ ] 15. Sync with base branch
- [ ] 16. Commit and PR
- [ ] 17. Wait for CI and address reviews
- [ ] 18. Post implementation comment
```
```

- [ ] **Step 3: Replace the Small enhancement — fast-track step list**

Find and replace the fast-track step list block (lines ~66–84) with:

```markdown
*Fast-track (issue richness 3+ or detailed inline context):*
```
- [ ] 1. Worktree setup
- [ ] 2. Copy env files
- [ ] 3. Documentation lookup (Context7)
- [ ] 4. Create issue
- [ ] 5. Implementation plan
- [ ] 6. Study existing patterns
- [ ] 7. Implement (TDD)
- [ ] 8. Self-review
- [ ] 9. Code review
- [ ] 10. Generate CHANGELOG entry
- [ ] 11. Final verification
- [ ] 12. Sync with base branch
- [ ] 13. Commit and PR
- [ ] 14. Wait for CI and address reviews
- [ ] 15. Post implementation comment
```
```

- [ ] **Step 4: Replace the Feature step list**

Find and replace the Feature step list block (lines ~87–111) with:

```markdown
### Feature

```
- [ ] 1. Worktree setup
- [ ] 2. Copy env files
- [ ] 3. Brainstorm requirements
- [ ] 4. Documentation lookup (Context7)
- [ ] 5. Create issue
- [ ] 6. Design document
- [ ] 7. Design verification
- [ ] 8. Implementation plan
- [ ] 9. Verify plan criteria
- [ ] 10. Study existing patterns
- [ ] 11. Implement (TDD)
- [ ] 12. Self-review
- [ ] 13. Code review
- [ ] 14. Generate CHANGELOG entry
- [ ] 15. Final verification
- [ ] 16. Sync with base branch
- [ ] 17. Commit and PR
- [ ] 18. Wait for CI and address reviews
- [ ] 19. Harden PR
- [ ] 20. Post implementation comment
- [ ] 21. Handoff
```
```

- [ ] **Step 5: Replace the Major feature step list**

Find and replace the Major feature step list block (lines ~114–139) with:

```markdown
### Major feature

```
- [ ] 1. Worktree setup
- [ ] 2. Copy env files
- [ ] 3. Brainstorm requirements
- [ ] 4. Spike / PoC (if risky unknowns)
- [ ] 5. Documentation lookup (Context7)
- [ ] 6. Create issue
- [ ] 7. Design document
- [ ] 8. Design verification
- [ ] 9. Implementation plan
- [ ] 10. Verify plan criteria
- [ ] 11. Study existing patterns
- [ ] 12. Implement (TDD)
- [ ] 13. Self-review
- [ ] 14. Code review
- [ ] 15. Generate CHANGELOG entry
- [ ] 16. Final verification
- [ ] 17. Sync with base branch
- [ ] 18. Commit and PR
- [ ] 19. Wait for CI and address reviews
- [ ] 20. Harden PR
- [ ] 21. Post implementation comment
- [ ] 22. Handoff
```
```

- [ ] **Step 6: Verify all changes**

```bash
grep -n "Worktree setup" /Users/paulholstein/projects/feature-flow/skills/start/references/step-lists.md
```

Expected: four lines, each showing `1. Worktree setup` for small enhancement standard, small enhancement fast-track, feature, and major feature.

```bash
grep -c "Commit planning artifacts" /Users/paulholstein/projects/feature-flow/skills/start/references/step-lists.md
```

Expected: `0` (no remaining references).

```bash
grep -n "Create issue" /Users/paulholstein/projects/feature-flow/skills/start/references/step-lists.md
```

Expected: `Create issue` appears before `Design document` in every non-quick scope list.

- [ ] **Step 7: Commit**

```bash
cd /Users/paulholstein/projects/feature-flow
git add skills/start/references/step-lists.md
git commit -m "feat(start): rewrite step-lists — worktree-first, create-issue before design, remove commit-artifacts — ✓AC-1 ✓AC-2 ✓AC-20"
```

**Acceptance Criteria:**
- [ ] `grep -q "1. Worktree setup" skills/start/references/step-lists.md`
- [ ] `grep -c "Commit planning artifacts" skills/start/references/step-lists.md` outputs `0`
- [ ] `grep -c "Commit Planning Artifacts" skills/start/references/step-lists.md` outputs `0`
- [ ] Four occurrences of `1. Worktree setup`: `grep -c "1. Worktree setup" skills/start/references/step-lists.md` outputs `4`
- [ ] Quick fix step list is unchanged: `grep -A 10 "### Quick fix" skills/start/references/step-lists.md | grep -q "1. Understand the problem"`
- [ ] `Create issue` precedes `Design document` in small enhancement standard: `awk '/\*Standard/,/\*Fast-track/' skills/start/references/step-lists.md | grep -n "Create issue\|Design document"` — Create issue line number < Design document line number
- [ ] `Create issue` precedes `Design document` in feature list: `awk '/### Feature/,/### Major/' skills/start/references/step-lists.md | grep -n "Create issue\|Design document"` — Create issue line < Design document line
- [ ] No step list references `docs/plans/` as a write target: `grep -q "docs/plans" skills/start/references/step-lists.md` exits non-zero

**Quality Constraints:**
- Parallelizable: no (reads and edits same file as Task 2.2 — run sequentially)
- Pattern reference: match existing step-list format in the file
- Files modified: `skills/start/references/step-lists.md` (design-first — 322 lines)

---

### Task 2.2: Update SKILL.md Skill Mapping table

**Files:**
- Modify: `skills/start/SKILL.md` (Skill Mapping table, ~lines 696–724)

- [ ] **Step 1: Read current Skill Mapping table entries for Design document and Worktree setup**

Read `skills/start/SKILL.md` lines 696–730 to capture exact text.

- [ ] **Step 2: Update the Design document row**

Find the row:
```
| Design document | `feature-flow:design-document` | File at `docs/plans/YYYY-MM-DD-*.md` **Context capture:** After the design document is saved, write key scope decisions, approach choices, and rejected alternatives to `.feature-flow/design/design-decisions.md` (append to the existing template — do not overwrite). |
```

Replace with:
```
| Design document | `feature-flow:design-document` | Design content merged into the linked GitHub issue body between `<!-- feature-flow:design:start -->` / `<!-- feature-flow:design:end -->` markers. **Context capture:** After the design is merged into the issue, write key scope decisions, approach choices, and rejected alternatives to `.feature-flow/design/design-decisions.md` (append to the existing template — do not overwrite). |
```

- [ ] **Step 3: Update the Commit planning artifacts row to remove or mark deprecated**

Find the row:
```
| Commit planning artifacts | No skill — inline step (see below) | Planning docs and config committed to base branch |
```

Remove this row entirely from the Skill Mapping table (the step has been removed from all step lists).

- [ ] **Step 4: Update the Worktree setup row to add handoff file note**

Find the Worktree setup row and add a note about handoff file creation:

Find: `**After worktree creation:** Create \`FEATURE_CONTEXT.md\``

The row's override note already describes context directory creation. Append after the last sentence of the Worktree setup cell:

`**Handoff file:** Immediately after worktree creation, write a pending handoff file at \`.feature-flow/handoffs/pending-<slug>.yml\` in the **base repo** (not the worktree) using the schema from §1.3 of the design doc. The \`pr_number\` field is null at this stage.`

- [ ] **Step 5: Update the lifecycle context object table**

Find the `design_doc` entry in the Lifecycle Context Object table (approximately line 668):
```
| `design_doc` | After design document step (the absolute path returned by the skill) |
```

Replace with:
```
| `design_issue` | After create-issue step (the GitHub issue number; design content is in the issue body) |
```

- [ ] **Step 6: Verify updates**

```bash
grep -q "feature-flow:design:start" /Users/paulholstein/projects/feature-flow/skills/start/SKILL.md
grep -q "design_issue" /Users/paulholstein/projects/feature-flow/skills/start/SKILL.md
grep -q "pending-<slug>.yml" /Users/paulholstein/projects/feature-flow/skills/start/SKILL.md
```

All must exit 0.

```bash
grep -c "Commit planning artifacts" /Users/paulholstein/projects/feature-flow/skills/start/SKILL.md
```

Expected: `1` (only the inline step section reference under "Commit Planning Artifacts Step" header, which will be removed in Task 2.3). After Task 2.3 completes this will become `0`.

- [ ] **Step 7: Commit**

```bash
cd /Users/paulholstein/projects/feature-flow
git add skills/start/SKILL.md
git commit -m "feat(start): update Skill Mapping — design_doc→design_issue, remove commit-artifacts row, add handoff-file note — ✓AC-6"
```

**Acceptance Criteria:**
- [ ] `grep -q "design_issue" skills/start/SKILL.md`
- [ ] `grep -q "feature-flow:design:start" skills/start/SKILL.md`
- [ ] `grep -q "pending-<slug>.yml" skills/start/SKILL.md`
- [ ] `grep -q "docs/plans/YYYY-MM-DD" skills/start/SKILL.md` exits non-zero (old path reference removed)

**Quality Constraints:**
- Parallelizable: no (same SKILL.md as Tasks 2.3, 4.2)
- Pattern reference: follow existing Skill Mapping table row format
- Files modified: `skills/start/SKILL.md` (design-first — ~912 lines)

---

### Task 2.3: Rewrite inline-steps.md — delete Commit Planning Artifacts section and defer-logic

**Files:**
- Modify: `skills/start/references/inline-steps.md` (lines ~47–78 for Commit Planning Artifacts; lines ~186–189 for Study Existing Patterns defer-logic)

- [ ] **Step 1: Read the file to locate the Commit Planning Artifacts section and defer-logic fallbacks**

Read `skills/start/references/inline-steps.md` lines 47–80 (Commit Planning Artifacts Step section).

Read lines 185–195 (defer-logic fallback in Study Existing Patterns).

- [ ] **Step 2: Delete the entire Commit Planning Artifacts Step section**

Find and remove the entire section from the header through the closing separator:

```markdown
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
```

After deletion, the section from `## Documentation Lookup Step` should be followed directly by `## Copy Env Files Step`.

- [ ] **Step 3: Remove the defer-logic fallback in Study Existing Patterns**

Find in the Study Existing Patterns section:

```
6. **Write to context file.** After generating the "How to Code This" notes, write the full findings (Existing Patterns Found, Anti-Patterns, How to Code This) to `.feature-flow/implement/patterns-found.md`. Append to the existing file rather than overwriting, so multiple study passes accumulate. If the file does not exist yet (e.g., worktree was set up without the init step), create it using the template from `../../references/phase-context-templates.md`.
```

Replace with:

```
6. **Write to context file.** After generating the "How to Code This" notes, write the full findings (Existing Patterns Found, Anti-Patterns, How to Code This) to `.feature-flow/implement/patterns-found.md`. Append to the existing file rather than overwriting, so multiple study passes accumulate. The file must already exist (created at Worktree setup — see §Worktree setup row in SKILL.md Skill Mapping). If it does not exist, the worktree setup step failed — report the error rather than silently creating the file.
```

- [ ] **Step 4: Remove the Blocker Logging defer-logic in the blockers file**

Find in the Blocker Logging section any reference to creating the blockers file if missing. If present:

```bash
grep -n "blockers-and-resolutions\|does not exist" /Users/paulholstein/projects/feature-flow/skills/start/references/inline-steps.md
```

If the `Blocker Logging` section contains a "create it if missing" fallback, replace it with the same hard-requirement pattern: "The file must already exist (created at Worktree setup)."

- [ ] **Step 5: Verify deletions**

```bash
grep -c "Commit Planning Artifacts Step" /Users/paulholstein/projects/feature-flow/skills/start/references/inline-steps.md
```

Expected: `0`

```bash
grep -q "worktree was set up without the init step" /Users/paulholstein/projects/feature-flow/skills/start/references/inline-steps.md
```

Expected: exits non-zero (phrase removed).

```bash
grep -q "must already exist" /Users/paulholstein/projects/feature-flow/skills/start/references/inline-steps.md
```

Expected: exits 0 (new hard-requirement language present).

- [ ] **Step 6: Commit**

```bash
cd /Users/paulholstein/projects/feature-flow
git add skills/start/references/inline-steps.md
git commit -m "feat(start): delete Commit-Planning-Artifacts step and defer-logic fallbacks from inline-steps — ✓AC-3"
```

**Acceptance Criteria:**
- [ ] `grep -c "Commit Planning Artifacts Step" skills/start/references/inline-steps.md` outputs `0`
- [ ] `grep -c "## Commit Planning Artifacts" skills/start/references/inline-steps.md` outputs `0`
- [ ] `grep -q "worktree was set up without the init step" skills/start/references/inline-steps.md` exits non-zero
- [ ] `grep -q "must already exist" skills/start/references/inline-steps.md`
- [ ] `grep -q "docs/plans/\*.md" skills/start/references/inline-steps.md` exits non-zero (glob removed with the deleted section)

**Quality Constraints:**
- Parallelizable: no (run after Task 2.2 which also touches SKILL.md for the inline step reference)
- Pattern reference: follow existing section structure in `inline-steps.md`
- Files modified: `skills/start/references/inline-steps.md` (design-first — ~1053 lines)

---

### Task 2.4: Phase 2 integration test

Validates AC-1, AC-2, AC-3, AC-11, AC-20 from the design doc.

**Files:**
- Read: `skills/start/references/step-lists.md`, `skills/start/references/inline-steps.md`, `skills/start/SKILL.md`

- [ ] **Step 1: Verify worktree is step 1 in all four non-quick scopes**

```bash
# Count occurrences of "1. Worktree setup" in step-lists.md
grep -c "1. Worktree setup" /Users/paulholstein/projects/feature-flow/skills/start/references/step-lists.md
```

Expected: `4`

- [ ] **Step 2: Verify no Commit Planning Artifacts step remains**

```bash
grep -rci "commit planning artifacts" /Users/paulholstein/projects/feature-flow/skills/start/
```

Expected: `0`

- [ ] **Step 3: Verify Quick fix is unchanged**

```bash
grep -A 12 "### Quick fix" /Users/paulholstein/projects/feature-flow/skills/start/references/step-lists.md | grep "1. Understand the problem"
```

Expected: outputs the matching line (Quick fix still starts with "Understand the problem").

- [ ] **Step 4: Verify no docs/plans write target in any step list**

```bash
grep -n "docs/plans" /Users/paulholstein/projects/feature-flow/skills/start/references/step-lists.md
```

Expected: no output (or only comment/metadata references, not write-target instructions).

- [ ] **Step 5: Verify create-issue before design-document ordering in all scopes**

```bash
# Small enhancement standard: Create issue at step 5, Design document at step 6
grep -n "Create issue\|Design document" /Users/paulholstein/projects/feature-flow/skills/start/references/step-lists.md
```

Expected: in every non-fast-track, non-quick scope, the line number for `Create issue` is lower than `Design document`.

- [ ] **Step 6: Verify inline-steps defer-logic removed**

```bash
grep -q "worktree was set up without the init step" /Users/paulholstein/projects/feature-flow/skills/start/references/inline-steps.md
```

Expected: exits non-zero.

**Acceptance Criteria (maps to design doc ACs):**
- [ ] AC-1: `grep -c "1. Worktree setup" skills/start/references/step-lists.md` outputs `4`
- [ ] AC-2: `grep -rci "commit planning artifacts" skills/start/` outputs `0`
- [ ] AC-3: `grep -c "## Commit Planning Artifacts Step" skills/start/references/inline-steps.md` outputs `0`
- [ ] AC-10: `grep -A 12 "### Quick fix" skills/start/references/step-lists.md | grep -q "1. Understand the problem"`
- [ ] AC-11: `grep -q "docs/plans" skills/start/references/step-lists.md` exits non-zero
- [ ] AC-20: For all non-quick step lists, `Create issue` appears before `Design document` (verify with line-number comparison per Step 5)

**Quality Constraints:**
- Parallelizable: no (depends on Tasks 2.1–2.3 completing)

---

## Phase 3 — Design-in-issue-body

### Task 3.1: Rewrite skills/design-document/SKILL.md — issue-body merge protocol

**Files:**
- Modify: `skills/design-document/SKILL.md` (Steps 4, 7; remove file-writing logic)

- [ ] **Step 1: Read the file to understand current Step 4 (Save the Document) and Step 7**

Read `skills/design-document/SKILL.md` lines 156–170 (Step 4) and lines 326–337 (Step 7).

- [ ] **Step 2: Replace Step 4 (Save the Document) with issue-body merge protocol**

Find:
```markdown
### Step 4: Save the Document

Write the document to the plans directory:

```
docs/plans/YYYY-MM-DD-[feature-name].md
```

Use today's date. Use kebab-case for the feature name.

If a design doc for this feature already exists (from a previous session), update it rather than creating a new file.
```

Replace with:

```markdown
### Step 4: Merge design into GitHub issue body

Design content is written into the linked GitHub issue body — not to a file under `docs/plans/`.

**Prerequisites:** The GitHub issue must already exist. Its number is in the lifecycle context as `issue`. If no issue number is available, stop and ask the user to create one first via `feature-flow:create-issue`.

**Protocol:**

1. **Fetch the current issue body:**
   ```bash
   gh issue view <issue_number> --json body --jq '.body'
   ```

2. **Generate the design content block** (the formatted document sections assembled in Step 3 above).

3. **Build the marker-wrapped block:**
   ```
   <!-- feature-flow:design:start -->
   ## Design (feature-flow)

   <generated design content>

   _Generated by feature-flow design-document on YYYY-MM-DD. Re-running design-document will update this section in place._
   <!-- feature-flow:design:end -->
   ```

4. **Merge rules:**
   - **If markers present:** Replace everything between `<!-- feature-flow:design:start -->` and `<!-- feature-flow:design:end -->` (inclusive of those tags) with the new marker-wrapped block. Preserve all content outside the markers verbatim.
   - **If markers absent:** Append the full marker-wrapped block to the end of the body.

5. **Size check:** If the merged body exceeds 65,536 characters:
   - Post the `## Design (feature-flow)` block as a standalone issue comment:
     ```bash
     TMPFILE=$(mktemp /tmp/ff_design_comment_XXXXXX.md)
     cat > "$TMPFILE" << 'DESIGN_BODY'
     ## Design (feature-flow)
     <generated design content>
     DESIGN_BODY
     COMMENT_URL=$(gh issue comment <issue_number> --body-file "$TMPFILE" --json url --jq '.url')
     rm -f "$TMPFILE"
     ```
   - Write a reference link inside the markers instead:
     ```
     <!-- feature-flow:design:start -->
     Design is too large to inline — see comment: <comment_url>
     <!-- feature-flow:design:end -->
     ```

6. **Write via temp file** (avoids shell-escaping issues with multi-kilobyte content):
   ```bash
   TMPFILE=$(mktemp /tmp/ff_design_body_XXXXXX.md)
   cat > "$TMPFILE" << 'ISSUE_BODY'
   <full merged body>
   ISSUE_BODY
   gh issue edit <issue_number> --body-file "$TMPFILE"
   rm -f "$TMPFILE"
   ```

7. **Announce:** `Design merged into issue #<issue_number> body (N chars, markers [present|added]).`
```

- [ ] **Step 3: Update Step 7 (Suggest Next Steps) to remove docs/plans reference**

Find in Step 7:
```
Design document saved to `docs/plans/YYYY-MM-DD-[feature-name].md`.
```

Replace with:
```
Design merged into issue #<issue_number> body.
```

Also update the "Format patterns" agent instruction in Step 1 to note that it reads `docs/plans/*.md` as structural examples only and never writes there:

Find in the Format patterns agent row:
```
| Format patterns | Read existing design docs in `docs/plans/` and extract document structure, section patterns, and conventions | Yes |
```

Replace with:
```
| Format patterns | Read existing design docs in `docs/plans/` and extract document structure, section patterns, and conventions. **Read-only — never writes to `docs/plans/`.** | Yes |
```

- [ ] **Step 4: Verify updates**

```bash
grep -q "feature-flow:design:start" /Users/paulholstein/projects/feature-flow/skills/design-document/SKILL.md
grep -q "gh issue edit.*body-file" /Users/paulholstein/projects/feature-flow/skills/design-document/SKILL.md
grep -q "65,536" /Users/paulholstein/projects/feature-flow/skills/design-document/SKILL.md
```

All must exit 0.

```bash
grep -q "docs/plans/YYYY-MM-DD-\[feature-name\].md" /Users/paulholstein/projects/feature-flow/skills/design-document/SKILL.md
```

Expected: exits non-zero (old write path removed).

- [ ] **Step 5: Commit**

```bash
cd /Users/paulholstein/projects/feature-flow
git add skills/design-document/SKILL.md
git commit -m "feat(design-document): replace file-write with issue-body merge protocol — ✓AC-4 ✓AC-19"
```

**Acceptance Criteria:**
- [ ] `grep -q "feature-flow:design:start" skills/design-document/SKILL.md`
- [ ] `grep -q "feature-flow:design:end" skills/design-document/SKILL.md`
- [ ] `grep -q "gh issue edit.*body-file\|body-file.*gh issue edit" skills/design-document/SKILL.md`
- [ ] `grep -q "65,536" skills/design-document/SKILL.md`
- [ ] `grep -q "gh issue comment.*body-file\|body-file.*gh issue comment" skills/design-document/SKILL.md` (size-overflow fallback)
- [ ] `grep -q "docs/plans/YYYY-MM-DD" skills/design-document/SKILL.md` exits non-zero (no write target reference)
- [ ] `grep -q "Read-only" skills/design-document/SKILL.md` (format-patterns agent marked read-only)

**Quality Constraints:**
- Parallelizable: no (run after Phase 2 tasks that may reference this skill)
- Pattern reference: follow existing SKILL.md structure; use `gh issue edit --body-file` as specified in design doc §2.2
- Files modified: `skills/design-document/SKILL.md` (design-first — ~355 lines)

---

### Task 3.2: Rewrite skills/design-verification/SKILL.md Step 1 — load design from issue body

**Files:**
- Modify: `skills/design-verification/SKILL.md` (Step 1: Load the Design Document, lines ~23–36)

- [ ] **Step 1: Read current Step 1 in design-verification/SKILL.md**

Read `skills/design-verification/SKILL.md` lines 22–40.

- [ ] **Step 2: Replace Step 1 (Load the Design Document)**

Find:
```markdown
### Step 1: Load the Design Document

Find the design document:
1. If the user specified a path, use it
2. Otherwise, find the most recently modified `.md` file in `docs/plans/`:

```
Glob: docs/plans/*.md
```

Confirm with the user: "Verifying design: `[path]`. Is this correct?"

Read the full document and extract all proposed changes.
```

Replace with:

```markdown
### Step 1: Load the Design Document

Find the design from the linked GitHub issue:

1. **If `issue` is in the lifecycle context** (the issue number was passed as an argument or set by `create-issue` earlier in the session):
   ```bash
   gh issue view <issue_number> --json body --jq '.body'
   ```
   Extract the content between `<!-- feature-flow:design:start -->` and `<!-- feature-flow:design:end -->` markers.
   - If markers are found: use the extracted content as the design document.
   - If markers are absent: the design has not been merged into the issue yet. Stop and instruct the user: "No design found in issue #<issue_number>. Run `feature-flow:design-document` first to merge the design into the issue."
   - If the extracted content is a reference link (`Design is too large to inline — see comment: <url>`): fetch the comment URL via `gh api <url> --jq '.body'` and use that content instead.

2. **If the user specified a file path directly** (legacy support for pre-2026-04-23 design docs in `docs/plans/`):
   Read the file at the specified path. Announce: "Loading design from file (legacy path): `<path>`."

3. **Fallback — no issue and no path:** Stop and instruct the user: "No design source found. Pass the issue number (`issue: N`) or a file path (`design_doc: /path/to/doc.md`)."

After loading, extract all proposed changes from the design content.
```

- [ ] **Step 3: Verify the update**

```bash
grep -q "feature-flow:design:start" /Users/paulholstein/projects/feature-flow/skills/design-verification/SKILL.md
grep -q "gh issue view.*body\|body.*gh issue view" /Users/paulholstein/projects/feature-flow/skills/design-verification/SKILL.md
```

Both must exit 0.

```bash
grep -q "Glob: docs/plans/\*.md" /Users/paulholstein/projects/feature-flow/skills/design-verification/SKILL.md
```

Expected: exits non-zero (old glob removed).

- [ ] **Step 4: Commit**

```bash
cd /Users/paulholstein/projects/feature-flow
git add skills/design-verification/SKILL.md
git commit -m "feat(design-verification): load design from issue body via gh issue view — ✓AC-5"
```

**Acceptance Criteria:**
- [ ] `grep -q "feature-flow:design:start" skills/design-verification/SKILL.md`
- [ ] `grep -q "gh issue view.*json body\|json body.*gh issue view" skills/design-verification/SKILL.md`
- [ ] `grep -q "Glob: docs/plans" skills/design-verification/SKILL.md` exits non-zero
- [ ] `grep -q "legacy" skills/design-verification/SKILL.md` (fallback for pre-cutover files documented)

**Quality Constraints:**
- Parallelizable: yes (no file conflicts with Task 3.1 or 3.3)
- Pattern reference: follow existing Step 1 structure; keep the same announce-at-start pattern

---

### Task 3.3: Rewrite skills/create-issue/SKILL.md — marker contract + no docs/plans glob

**Files:**
- Modify: `skills/create-issue/SKILL.md` (Step 1, Step 4 draft format, Step 6 create command)

- [ ] **Step 1: Read current create-issue/SKILL.md Steps 1 and 4**

Read `skills/create-issue/SKILL.md` lines 22–45 (Step 1) and lines 66–103 (Step 4 draft format).

- [ ] **Step 2: Replace Step 1 (Load the Design Document)**

Find:
```markdown
### Step 1: Load the Design Document

Find the design document:
1. If the user specified a path, use it
2. Otherwise, find the most recently modified `.md` file in `docs/plans/`:

```
Glob: docs/plans/*.md
```

Read the full document and extract the key sections.
```

Replace with:

```markdown
### Step 1: Assemble design content

Design content for new issues comes from the current conversation context (brainstorming output, inline arguments, or previously gathered decisions) — not from `docs/plans/`.

**Context sources (in priority order):**
1. If `issue` is already set in lifecycle context (the user passed an existing issue number): load the existing issue body via `gh issue view <issue_number> --json body,title --jq '{title, body}'`. This is **update mode** — skip draft assembly and go directly to Step 5.
2. From brainstorming output in the conversation: extract scope, approach, decisions, and acceptance criteria.
3. From inline `start:` args (user description + any explicitly provided context).
4. From any design-document content already written earlier in the session (in conversation context — not from a file).

Assemble a minimal issue body from the gathered context. The body will include an empty design marker block that `feature-flow:design-document` will fill in on the next lifecycle step.

**Design marker block (placeholder — will be replaced by design-document):**
```
<!-- feature-flow:design:start -->
(pending design-document — will be filled in by `feature-flow:design-document`)
<!-- feature-flow:design:end -->
```
```

- [ ] **Step 3: Update Step 4 issue body format to include the marker block**

Find the issue format template in Step 4 and add the marker block as the last section:

After the last `##` section in the issue template (typically `## Implementation Notes`), append:

```markdown
<!-- feature-flow:design:start -->
(pending design-document — will be filled in by `feature-flow:design-document`)
<!-- feature-flow:design:end -->
```

And update the `## Design Doc` reference:

Find:
```
## Design Doc
See `docs/plans/YYYY-MM-DD-feature.md`
```

Remove this section entirely (no `docs/plans/` reference in new issues).

- [ ] **Step 4: Update Step 7 next steps**

Find in Step 7:
```
1. Run `writing-plans` to create an implementation plan with acceptance criteria
2. Run `verify-plan-criteria` to ensure all tasks have verifiable criteria
3. Set up a worktree with `using-git-worktrees` to start implementation
```

Replace with:
```
1. Run `feature-flow:design-document` to merge the design into this issue body
2. Run `feature-flow:design-verification` to check the design against the codebase
3. Run `superpowers:writing-plans` to create an implementation plan with acceptance criteria
```

- [ ] **Step 5: Verify updates**

```bash
grep -q "feature-flow:design:start" /Users/paulholstein/projects/feature-flow/skills/create-issue/SKILL.md
grep -q "pending design-document" /Users/paulholstein/projects/feature-flow/skills/create-issue/SKILL.md
```

Both must exit 0.

```bash
grep -q "Glob: docs/plans" /Users/paulholstein/projects/feature-flow/skills/create-issue/SKILL.md
```

Expected: exits non-zero (old glob removed).

- [ ] **Step 6: Commit**

```bash
cd /Users/paulholstein/projects/feature-flow
git add skills/create-issue/SKILL.md
git commit -m "feat(create-issue): assemble body from conversation context, insert empty design marker block — ✓AC-20"
```

**Acceptance Criteria:**
- [ ] `grep -q "feature-flow:design:start" skills/create-issue/SKILL.md`
- [ ] `grep -q "pending design-document" skills/create-issue/SKILL.md`
- [ ] `grep -q "Glob: docs/plans" skills/create-issue/SKILL.md` exits non-zero
- [ ] `grep -q "docs/plans/YYYY-MM-DD" skills/create-issue/SKILL.md` exits non-zero

**Quality Constraints:**
- Parallelizable: yes (no file conflicts with Tasks 3.1 or 3.2)
- Pattern reference: follow existing SKILL.md section structure in `skills/create-issue/SKILL.md`
- Files modified: `skills/create-issue/SKILL.md` (design-first — ~223 lines)

---

### Task 3.4: Update conflict-resolution.md fallback in start skill references

**Files:**
- Read: `references/conflict-resolution.md` (check if it references `docs/plans/` scanning)
- Modify: `skills/start/SKILL.md` (the "Across sessions" recovery section, line ~835)

- [ ] **Step 1: Check if the Across sessions section references docs/plans scanning**

Read `skills/start/SKILL.md` lines 829–840.

```bash
grep -n "docs/plans" /Users/paulholstein/projects/feature-flow/skills/start/SKILL.md
```

Note all line numbers that reference `docs/plans/` in the context of session recovery.

- [ ] **Step 2: Update the cross-session recovery instructions**

Find in the `Across sessions (new conversation)` section:

```
- Check for artifacts from previous sessions: design docs in `docs/plans/`, open GitHub issues, existing worktrees, and branch history to infer progress.
```

Replace with:

```
- Check for artifacts from previous sessions: open GitHub issues (search via `gh issue search`), existing worktrees (via `git worktree list`), and branch history (via `git log --oneline -5`) to infer progress. Design content for sessions started after 2026-04-23 lives in the linked GitHub issue body under `## Design (feature-flow)` — not in `docs/plans/`.
```

- [ ] **Step 3: Verify the update**

```bash
grep -q "gh issue search" /Users/paulholstein/projects/feature-flow/skills/start/SKILL.md
grep -q "git worktree list" /Users/paulholstein/projects/feature-flow/skills/start/SKILL.md
```

Both must exit 0.

- [ ] **Step 4: Commit**

```bash
cd /Users/paulholstein/projects/feature-flow
git add skills/start/SKILL.md
git commit -m "feat(start): update cross-session recovery to use gh issue search instead of docs/plans scan — ✓AC-11"
```

**Acceptance Criteria:**
- [ ] `grep -q "gh issue search" skills/start/SKILL.md`
- [ ] `grep -q "2026-04-23" skills/start/SKILL.md` (cutover date documented)

**Quality Constraints:**
- Parallelizable: no (same SKILL.md as Task 2.2 — must run sequentially in Phase 3 after Phase 2)
- Pattern reference: follow existing `start` SKILL.md prose style

---

### Task 3.5: Update feature-flow-metadata-schema.md — design_doc → design_issue

**Files:**
- Modify: `references/feature-flow-metadata-schema.md`

- [ ] **Step 1: Read the metadata schema file**

Read `/Users/paulholstein/projects/feature-flow/references/feature-flow-metadata-schema.md` to find all occurrences of `design_doc`.

```bash
grep -n "design_doc" /Users/paulholstein/projects/feature-flow/references/feature-flow-metadata-schema.md
```

- [ ] **Step 2: Update design_doc field to design_issue**

For each occurrence of `design_doc` in the schema field definitions and example YAML blocks, evaluate whether it refers to:
- (a) a file path reference — replace with `design_issue` (an integer issue number)
- (b) a `design_doc_sha` field — replace with `design_issue` (SHA no longer applies; issue body is always live)

Replace the `design_doc` field definition row:
```
| `design_doc` | `string \| null` | Repo-relative path to the design document file | No |
```
With:
```
| `design_issue` | `integer \| null` | GitHub issue number containing the design (in body under `## Design (feature-flow)` markers) | No |
```

Replace the `design_doc_sha` field definition row (if present):
```
| `design_doc_sha` | `string \| null` | Git blob SHA of the design doc at PR creation time | No |
```
With:
```
| `design_issue` | `integer \| null` | GitHub issue number containing the design (replaces design_doc_sha — issue body is live, not snapshotted) | No |
```

Update any example YAML blocks to use `design_issue: 244` instead of `design_doc: docs/plans/...`.

- [ ] **Step 3: Verify the updates**

```bash
grep -c "design_doc" /Users/paulholstein/projects/feature-flow/references/feature-flow-metadata-schema.md
```

Expected: `0` (all references replaced).

```bash
grep -q "design_issue" /Users/paulholstein/projects/feature-flow/references/feature-flow-metadata-schema.md
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
cd /Users/paulholstein/projects/feature-flow
git add references/feature-flow-metadata-schema.md
git commit -m "feat(metadata-schema): rename design_doc→design_issue in feature-flow-metadata-schema"
```

**Acceptance Criteria:**
- [ ] `grep -c "design_doc" references/feature-flow-metadata-schema.md` outputs `0`
- [ ] `grep -q "design_issue" references/feature-flow-metadata-schema.md`

**Quality Constraints:**
- Parallelizable: yes (separate file from all other Phase 3 tasks)
- Pattern reference: follow existing field table format in the schema file

---

### Task 3.6: Update yolo-overrides.md — remove design_doc from lifecycle context object

**Files:**
- Modify: `skills/start/references/yolo-overrides.md`

- [ ] **Step 1: Find all design_doc references in yolo-overrides.md**

```bash
grep -n "design_doc" /Users/paulholstein/projects/feature-flow/skills/start/references/yolo-overrides.md
```

- [ ] **Step 2: Update lifecycle context object examples**

Find example invocations that pass `design_doc` as an argument, e.g.:

```
Task(subagent_type: "general-purpose", model: "sonnet", description: "YOLO implementation plan",
     prompt: "Invoke Skill(skill: 'superpowers:writing-plans', args: 'yolo: true. scope: [scope]. base_branch: main. issue: 119. design_doc: /abs/path/design.md. [original args]'). Return the plan file path.")
```

Replace `design_doc: /abs/path/design.md` with `design_issue: 119` in all such examples.

Also find the inline SKILL.md example block:
```
Skill(skill: "superpowers:writing-plans", args: "yolo: true. scope: [scope]. base_branch: main. issue: 119. design_doc: /abs/path/design.md. [original args]")
```

Replace with:
```
Skill(skill: "superpowers:writing-plans", args: "yolo: true. scope: [scope]. base_branch: main. issue: 119. design_issue: 119. [original args]")
```

- [ ] **Step 3: Update the Finishing a Development Branch YOLO Override section**

Find the note about design_doc in the body markers step:

```bash
grep -n "design_doc_path\|design_doc" /Users/paulholstein/projects/feature-flow/skills/start/references/yolo-overrides.md
```

In the `<!-- feature-flow-design-doc: <design_doc_path> -->` marker reference (if present in the PR body markers section), update to reflect that design is now in the issue body:

Find any reference to appending a `feature-flow-design-doc` HTML comment to PR bodies. Replace with a note that design content is in the linked issue body.

- [ ] **Step 4: Verify**

```bash
grep -c "design_doc" /Users/paulholstein/projects/feature-flow/skills/start/references/yolo-overrides.md
```

Expected: `0` (all occurrences replaced or removed).

```bash
grep -q "design_issue" /Users/paulholstein/projects/feature-flow/skills/start/references/yolo-overrides.md
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
cd /Users/paulholstein/projects/feature-flow
git add skills/start/references/yolo-overrides.md
git commit -m "feat(yolo-overrides): replace design_doc with design_issue in lifecycle context examples"
```

**Acceptance Criteria:**
- [ ] `grep -c "design_doc" skills/start/references/yolo-overrides.md` outputs `0`
- [ ] `grep -q "design_issue" skills/start/references/yolo-overrides.md`

**Quality Constraints:**
- Parallelizable: yes (separate file from all other Phase 3 tasks except Task 3.4 which touches SKILL.md)
- Pattern reference: follow existing example invocation format in yolo-overrides.md

---

### Task 3.7: Phase 3 integration test

Validates AC-4, AC-5, AC-6, AC-11, AC-19, AC-20, AC-22 from the design doc.

**Files:**
- Read: `skills/design-document/SKILL.md`, `skills/design-verification/SKILL.md`, `skills/create-issue/SKILL.md`, `skills/start/SKILL.md`, `skills/start/references/yolo-overrides.md`, `references/feature-flow-metadata-schema.md`

- [ ] **Step 1: AC-4 — design-document does not write to docs/plans/**

```bash
grep -q "docs/plans/YYYY-MM-DD" /Users/paulholstein/projects/feature-flow/skills/design-document/SKILL.md
```

Expected: exits non-zero.

- [ ] **Step 2: AC-5 — design-verification reads from issue body**

```bash
grep -q "gh issue view.*json body\|json body.*gh issue view" /Users/paulholstein/projects/feature-flow/skills/design-verification/SKILL.md
grep -q "feature-flow:design:start" /Users/paulholstein/projects/feature-flow/skills/design-verification/SKILL.md
```

Both must exit 0.

- [ ] **Step 3: AC-6 — writing-plans reads design from issue (via yolo-overrides lifecycle context)**

```bash
grep -q "design_issue" /Users/paulholstein/projects/feature-flow/skills/start/references/yolo-overrides.md
grep -c "design_doc" /Users/paulholstein/projects/feature-flow/skills/start/references/yolo-overrides.md
```

First must exit 0; second must output `0`.

- [ ] **Step 4: AC-11 — no step list references docs/plans/ as write target**

```bash
grep -rn "docs/plans" /Users/paulholstein/projects/feature-flow/skills/start/references/step-lists.md
```

Expected: no output.

- [ ] **Step 5: AC-19 — marker protocol present in design-document**

```bash
grep -q "feature-flow:design:start" /Users/paulholstein/projects/feature-flow/skills/design-document/SKILL.md
grep -q "feature-flow:design:end" /Users/paulholstein/projects/feature-flow/skills/design-document/SKILL.md
grep -q "65,536" /Users/paulholstein/projects/feature-flow/skills/design-document/SKILL.md
grep -q "gh issue comment" /Users/paulholstein/projects/feature-flow/skills/design-document/SKILL.md
```

All must exit 0.

- [ ] **Step 6: AC-20 — create-issue inserts empty marker block**

```bash
grep -q "pending design-document" /Users/paulholstein/projects/feature-flow/skills/create-issue/SKILL.md
grep -q "feature-flow:design:start" /Users/paulholstein/projects/feature-flow/skills/create-issue/SKILL.md
```

Both must exit 0.

- [ ] **Step 7: AC-22 — handoff schema documentation**

```bash
grep -q "schema_version" /Users/paulholstein/projects/feature-flow/skills/cleanup-merged/SKILL.md
grep -q "pending_slug" /Users/paulholstein/projects/feature-flow/skills/cleanup-merged/SKILL.md
grep -q "feature_flow_version" /Users/paulholstein/projects/feature-flow/skills/cleanup-merged/SKILL.md
```

All must exit 0 (schema fields documented in cleanup-merged, which reads the handoff files).

**Acceptance Criteria:**
- [ ] AC-4: `grep -q "docs/plans/YYYY-MM-DD" skills/design-document/SKILL.md` exits non-zero
- [ ] AC-5: `grep -q "feature-flow:design:start" skills/design-verification/SKILL.md`
- [ ] AC-6: `grep -q "design_issue" skills/start/references/yolo-overrides.md` AND `grep -c "design_doc" skills/start/references/yolo-overrides.md` outputs `0`
- [ ] AC-11: `grep -rn "docs/plans" skills/start/references/step-lists.md` exits with no output
- [ ] AC-19: All four grep checks from Step 5 exit 0
- [ ] AC-20: `grep -q "feature-flow:design:start" skills/create-issue/SKILL.md`

**Quality Constraints:**
- Parallelizable: no (depends on Tasks 3.1–3.6 completing)

---

## Phase 4 — Post-merge cleanup wiring

### Task 4.1: Wire merge-prs to invoke cleanup-merged after successful merge

**Files:**
- Modify: `skills/merge-prs/SKILL.md` (Step 4c post-merge actions, ~lines 116–127)

- [ ] **Step 1: Read the current Step 4c post-merge actions**

Read `skills/merge-prs/SKILL.md` lines 113–132.

- [ ] **Step 2: Add cleanup-merged invocation after the merge comment**

Find the `**4c. Post-merge actions:**` block:

```markdown
**4c. Post-merge actions:**
```bash
# Comment on merged PR
gh pr comment <number> --body "Merged via feature-flow merge-prs (batch merge, order: N/M)"
```
```

Replace with:

```markdown
**4c. Post-merge actions:**
```bash
# Comment on merged PR
gh pr comment <number> --body "Merged via feature-flow merge-prs (batch merge, order: N/M)"
```

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
```

- [ ] **Step 3: Verify the update**

```bash
grep -q "cleanup-merged" /Users/paulholstein/projects/feature-flow/skills/merge-prs/SKILL.md
grep -q "feature-flow:cleanup-merged" /Users/paulholstein/projects/feature-flow/skills/merge-prs/SKILL.md
```

Both must exit 0.

```bash
grep -q "must not.*fail the merge\|non-blocking" /Users/paulholstein/projects/feature-flow/skills/merge-prs/SKILL.md
```

Expected: exits 0 (non-fatal guarantee documented).

- [ ] **Step 4: Commit**

```bash
cd /Users/paulholstein/projects/feature-flow
git add skills/merge-prs/SKILL.md
git commit -m "feat(merge-prs): invoke cleanup-merged after successful merge — ✓AC-17"
```

**Acceptance Criteria:**
- [ ] `grep -q "feature-flow:cleanup-merged" skills/merge-prs/SKILL.md`
- [ ] `grep -q "cleanup-merged.*failed.*handoff retained\|non-blocking" skills/merge-prs/SKILL.md`

**Quality Constraints:**
- Parallelizable: no (unique file; but must run after cleanup-merged SKILL.md exists — after Phase 1)
- Pattern reference: follow existing Step 4c inline format

---

### Task 4.2: Add opportunistic cleanup pre-flight to start SKILL.md

**Files:**
- Modify: `skills/start/SKILL.md` (Step 0: Load or Create Project Context, or immediately before Step 1)

- [ ] **Step 1: Read the current Step 0 summary in SKILL.md**

Read `skills/start/SKILL.md` lines 460–475 (Step 0).

- [ ] **Step 2: Add opportunistic cleanup pre-flight as a Step 0 sub-step**

Find the Step 0 section that lists sub-steps:

```markdown
### Step 0: Load or Create Project Context

**Read `references/project-context.md`** for full Step 0 details. Summary of substeps:
1. YOLO/Express trigger phrase detection (word-boundary matching on `--yolo`, `yolo mode`, `--express`, etc.)
2. Load or create `.feature-flow.yml` (version drift check, stack cross-check, auto-detection)
3. Base branch detection (cascade: `.feature-flow.yml` → git config → develop/staging → main/master)
4. Session model check
5. Notification preference (macOS-only, saved to `.feature-flow.yml`)
6. YOLO stop_after reading (from `.feature-flow.yml`)
```

Replace with:

```markdown
### Step 0: Load or Create Project Context

**Read `references/project-context.md`** for full Step 0 details. Summary of substeps:
1. YOLO/Express trigger phrase detection (word-boundary matching on `--yolo`, `yolo mode`, `--express`, etc.)
2. Load or create `.feature-flow.yml` (version drift check, stack cross-check, auto-detection)
3. Base branch detection (cascade: `.feature-flow.yml` → git config → develop/staging → main/master)
4. Session model check
5. Notification preference (macOS-only, saved to `.feature-flow.yml`)
6. YOLO stop_after reading (from `.feature-flow.yml`)
7. **Opportunistic cleanup pre-flight.** Invoke `feature-flow:cleanup-merged` with no argument to reclaim worktrees, branches, and handoff files for any PRs that have merged since the last `start:` session. This step:
   - Runs for **all scopes including Quick fix**.
   - Is **silent on no-op** (no handoff files found, or all found PRs are still open).
   - **Announces** cleaned PRs on success: `Pre-flight: cleaned up PR #N (slug-a3f2), PR #M (slug-b742)`
   - **Does not block** the lifecycle if cleanup fails — log the failure and continue.
   - Invocation: `Skill(skill: "feature-flow:cleanup-merged", args: "")` wrapped in try/catch; any exception logs `Pre-flight cleanup failed: <error> — continuing.` and proceeds.
```

- [ ] **Step 3: Verify the update**

```bash
grep -q "Opportunistic cleanup pre-flight" /Users/paulholstein/projects/feature-flow/skills/start/SKILL.md
grep -q "feature-flow:cleanup-merged" /Users/paulholstein/projects/feature-flow/skills/start/SKILL.md
```

Both must exit 0.

```bash
grep -q "silent on no-op\|does not block\|non-blocking" /Users/paulholstein/projects/feature-flow/skills/start/SKILL.md
```

Expected: exits 0 (non-fatal guarantee documented).

- [ ] **Step 4: Commit**

```bash
cd /Users/paulholstein/projects/feature-flow
git add skills/start/SKILL.md
git commit -m "feat(start): add opportunistic cleanup pre-flight at session kickoff — ✓AC-18"
```

**Acceptance Criteria:**
- [ ] `grep -q "Opportunistic cleanup pre-flight" skills/start/SKILL.md`
- [ ] `grep -q "feature-flow:cleanup-merged" skills/start/SKILL.md`
- [ ] `grep -q "silent on no-op\|does not block" skills/start/SKILL.md`
- [ ] `grep -q "all scopes including Quick fix\|Runs for.*Quick fix" skills/start/SKILL.md`

**Quality Constraints:**
- Parallelizable: no (same SKILL.md as Tasks 2.2, 3.4 — must run last among SKILL.md edits)
- Pattern reference: follow existing Step 0 substep list format
- Files modified: `skills/start/SKILL.md` (design-first — ~912 lines)

---

### Task 4.3: Update yolo-overrides.md Handoff step — do NOT remove worktree

**Files:**
- Modify: `skills/start/references/yolo-overrides.md` (Finishing a Development Branch YOLO Override, step 9)

- [ ] **Step 1: Find the current "do NOT merge the PR or remove worktrees" language**

Read `skills/start/references/yolo-overrides.md` lines 168–175.

```bash
grep -n "worktree remove\|remove worktree\|git worktree" /Users/paulholstein/projects/feature-flow/skills/start/references/yolo-overrides.md
```

- [ ] **Step 2: Update step 9 — remove worktree cleanup instruction, add deferred-cleanup note**

Find:
```
9. **Do NOT merge the PR or remove worktrees in this step.** The lifecycle ends at PR creation. Do not run `gh pr merge`, `git worktree remove`, or `git branch -d` — the user merges and cleans up after reviewing. If worktree cleanup is needed later, always `cd` to the parent repo root first: `cd <parent-repo-root> && git worktree remove .worktrees/<name>`. Running worktree removal while CWD is inside the worktree destroys the shell and crashes the session.
```

Replace with:
```
9. **Do NOT merge the PR or remove worktrees in this step.** The lifecycle ends at PR creation. Do not run `gh pr merge`, `git worktree remove`, or `git branch -d`. The worktree and branch are cleaned up automatically by `feature-flow:cleanup-merged` after the PR is merged (invoked by `merge-prs` and opportunistically at the next `start:` session kickoff). The user merges the PR; cleanup follows automatically.
```

- [ ] **Step 3: Check the Handoff step inline-steps.md section for worktree-remove instructions**

Read `skills/start/references/inline-steps.md` lines 925–985 (Handoff Step).

```bash
grep -n "worktree remove\|git worktree remove\|clean up local branch" /Users/paulholstein/projects/feature-flow/skills/start/references/inline-steps.md
```

- [ ] **Step 4: Update the Handoff Step in inline-steps.md to remove worktree-removal instructions**

Find in the Handoff Step section any reference to running `git worktree remove` or cleaning up the branch:

```markdown
Worktree: [Removed / Still active at .worktrees/<name>]
[If still active: "Run `cd <repo-root> && git worktree remove .worktrees/<name>` from the parent repo (NOT from inside the worktree)."]
```

Replace with:
```markdown
Worktree: Still active at `.worktrees/<name>` — will be removed automatically after PR #<n> merges.
```

Also find the `Next steps` block in the Handoff Step that references cleanup and update to:
```
1. Merge PR #<number> directly in GitHub  →  closes issue #<N>
   (Or run `/merge-prs <number>` for automated cleanup after merge)
2. After merge, `feature-flow:cleanup-merged` will automatically remove the worktree, branch, and handoff file.
```

- [ ] **Step 5: Verify updates**

```bash
grep -q "automatically.*cleanup-merged\|cleanup-merged.*automatically" /Users/paulholstein/projects/feature-flow/skills/start/references/yolo-overrides.md
grep -q "automatically.*cleanup-merged\|cleanup-merged.*automatically\|removed automatically" /Users/paulholstein/projects/feature-flow/skills/start/references/inline-steps.md
```

Both must exit 0.

```bash
grep -q "git worktree remove .worktrees" /Users/paulholstein/projects/feature-flow/skills/start/references/inline-steps.md
```

Expected: exits non-zero (manual worktree-remove instruction removed from Handoff step).

- [ ] **Step 6: Commit**

```bash
cd /Users/paulholstein/projects/feature-flow
git add skills/start/references/yolo-overrides.md skills/start/references/inline-steps.md
git commit -m "feat(handoff): defer worktree removal to post-merge cleanup-merged — ✓AC-8"
```

**Acceptance Criteria:**
- [ ] `grep -q "automatically.*cleanup-merged\|cleanup-merged.*automatically" skills/start/references/yolo-overrides.md`
- [ ] `grep -q "removed automatically after PR.*merges\|cleanup-merged" skills/start/references/inline-steps.md`
- [ ] `grep -q "git worktree remove .worktrees" skills/start/references/inline-steps.md` exits non-zero (manual instruction removed)

**Quality Constraints:**
- Parallelizable: no (yolo-overrides.md touched by Task 3.6 — run after it)
- Pattern reference: follow existing step language in yolo-overrides and inline-steps

---

### Task 4.4: Phase 4 integration test

Validates AC-7, AC-8, AC-9, AC-17, AC-18 from the design doc, plus full end-to-end AC sweep.

**Files:**
- Read: all modified files across all phases

- [ ] **Step 1: AC-7 — parallel session isolation (content audit)**

```bash
# Each scope starts with worktree setup — no base-branch writes before isolation
grep -c "1. Worktree setup" /Users/paulholstein/projects/feature-flow/skills/start/references/step-lists.md
```

Expected: `4` (all four non-quick scopes).

```bash
# No commit to base branch before worktree is created
grep -q "Commit planning artifacts" /Users/paulholstein/projects/feature-flow/skills/start/references/step-lists.md
```

Expected: exits non-zero.

- [ ] **Step 2: AC-8 — Handoff step does not run git worktree remove**

```bash
grep -n "git worktree remove" /Users/paulholstein/projects/feature-flow/skills/start/references/inline-steps.md
```

Expected: any remaining references are NOT in the Handoff Step section (may exist in other sections like Copy Env Files or Sync comments).

Targeted check:
```bash
awk '/## Handoff Step/,/^---/' /Users/paulholstein/projects/feature-flow/skills/start/references/inline-steps.md | grep "git worktree remove"
```

Expected: no output (Handoff Step section contains no `git worktree remove` command).

- [ ] **Step 3: AC-9 — cleanup mechanism exists**

```bash
test -f /Users/paulholstein/projects/feature-flow/skills/cleanup-merged/SKILL.md
grep -q "feature-flow:cleanup-merged" /Users/paulholstein/projects/feature-flow/skills/merge-prs/SKILL.md
grep -q "feature-flow:cleanup-merged" /Users/paulholstein/projects/feature-flow/skills/start/SKILL.md
```

All must exit 0.

- [ ] **Step 4: AC-17 — merge-prs invokes cleanup-merged**

```bash
grep -q "feature-flow:cleanup-merged" /Users/paulholstein/projects/feature-flow/skills/merge-prs/SKILL.md
grep -q "non-blocking\|does not fail the merge\|cleanup failure.*must not fail" /Users/paulholstein/projects/feature-flow/skills/merge-prs/SKILL.md
```

Both must exit 0.

- [ ] **Step 5: AC-18 — start: invokes cleanup-merged as opportunistic pre-flight**

```bash
grep -q "Opportunistic cleanup pre-flight" /Users/paulholstein/projects/feature-flow/skills/start/SKILL.md
grep -q "silent on no-op" /Users/paulholstein/projects/feature-flow/skills/start/SKILL.md
grep -q "does not block\|non-blocking" /Users/paulholstein/projects/feature-flow/skills/start/SKILL.md
grep -q "all scopes including Quick fix\|including Quick fix" /Users/paulholstein/projects/feature-flow/skills/start/SKILL.md
```

All must exit 0.

- [ ] **Step 6: Full AC sweep — all 22 ACs**

```bash
# AC-1
grep -c "1. Worktree setup" /Users/paulholstein/projects/feature-flow/skills/start/references/step-lists.md
# Expected: 4

# AC-2
grep -rci "commit planning artifacts" /Users/paulholstein/projects/feature-flow/skills/start/
# Expected: 0

# AC-3
grep -c "## Commit Planning Artifacts" /Users/paulholstein/projects/feature-flow/skills/start/references/inline-steps.md
# Expected: 0

# AC-4
grep -q "docs/plans/YYYY-MM-DD" /Users/paulholstein/projects/feature-flow/skills/design-document/SKILL.md
# Expected: non-zero exit

# AC-5
grep -q "feature-flow:design:start" /Users/paulholstein/projects/feature-flow/skills/design-verification/SKILL.md
# Expected: exit 0

# AC-6
grep -q "design_issue" /Users/paulholstein/projects/feature-flow/skills/start/references/yolo-overrides.md
# Expected: exit 0

# AC-8
awk '/## Handoff Step/,/^---/' /Users/paulholstein/projects/feature-flow/skills/start/references/inline-steps.md | grep "git worktree remove"
# Expected: no output

# AC-9
test -f /Users/paulholstein/projects/feature-flow/skills/cleanup-merged/SKILL.md
# Expected: exit 0

# AC-10 (Quick fix unchanged)
grep -A 12 "### Quick fix" /Users/paulholstein/projects/feature-flow/skills/start/references/step-lists.md | grep "1. Understand the problem"
# Expected: match

# AC-11
grep -rn "docs/plans" /Users/paulholstein/projects/feature-flow/skills/start/references/step-lists.md
# Expected: no output

# AC-12 (slug algorithm documented)
grep -q "sha256\|content-words\|stop words" /Users/paulholstein/projects/feature-flow/skills/cleanup-merged/SKILL.md
# Note: slug algorithm lives in start SKILL.md Worktree setup step — check there
grep -q "sha256\|slug.*hash\|hash.*slug" /Users/paulholstein/projects/feature-flow/skills/start/SKILL.md
# Expected: exit 0

# AC-13
grep -q "pending-<slug>.yml\|pending-.*yml" /Users/paulholstein/projects/feature-flow/skills/start/SKILL.md
# Expected: exit 0

# AC-14
grep -q "pr-number>.yml\|renamed.*pr_number\|rename.*handoff" /Users/paulholstein/projects/feature-flow/skills/start/SKILL.md
# Expected: exit 0

# AC-15
grep -q ".feature-flow/handoffs/" /Users/paulholstein/projects/feature-flow/.gitignore
# Expected: exit 0

# AC-16
test -f /Users/paulholstein/projects/feature-flow/skills/cleanup-merged/SKILL.md
grep -q "schema_version" /Users/paulholstein/projects/feature-flow/skills/cleanup-merged/SKILL.md
grep -q "git worktree remove" /Users/paulholstein/projects/feature-flow/skills/cleanup-merged/SKILL.md
grep -q "git branch -D" /Users/paulholstein/projects/feature-flow/skills/cleanup-merged/SKILL.md
grep -q "git push origin --delete" /Users/paulholstein/projects/feature-flow/skills/cleanup-merged/SKILL.md
grep -q "rm.*handoffs" /Users/paulholstein/projects/feature-flow/skills/cleanup-merged/SKILL.md
grep -q "\.log" /Users/paulholstein/projects/feature-flow/skills/cleanup-merged/SKILL.md
# All must exit 0

# AC-17
grep -q "feature-flow:cleanup-merged" /Users/paulholstein/projects/feature-flow/skills/merge-prs/SKILL.md
# Expected: exit 0

# AC-18
grep -q "Opportunistic cleanup pre-flight" /Users/paulholstein/projects/feature-flow/skills/start/SKILL.md
# Expected: exit 0

# AC-19
grep -q "feature-flow:design:start" /Users/paulholstein/projects/feature-flow/skills/design-document/SKILL.md
grep -q "65,536" /Users/paulholstein/projects/feature-flow/skills/design-document/SKILL.md
# Both must exit 0

# AC-20
grep -q "feature-flow:design:start" /Users/paulholstein/projects/feature-flow/skills/create-issue/SKILL.md
# Expected: exit 0

# AC-21
test -f /Users/paulholstein/projects/feature-flow/docs/plans/README.md
grep -q "GitHub issue" /Users/paulholstein/projects/feature-flow/docs/plans/README.md
# Both must exit 0

# AC-22
grep -q "schema_version" /Users/paulholstein/projects/feature-flow/skills/cleanup-merged/SKILL.md
grep -q "pending_slug" /Users/paulholstein/projects/feature-flow/skills/cleanup-merged/SKILL.md
grep -q "worktree_path" /Users/paulholstein/projects/feature-flow/skills/cleanup-merged/SKILL.md
grep -q "feature_flow_version\|plugin_version" /Users/paulholstein/projects/feature-flow/skills/cleanup-merged/SKILL.md
# All must exit 0
```

**Acceptance Criteria (summary — all 22 design doc ACs):**
- [ ] AC-1: `grep -c "1. Worktree setup" skills/start/references/step-lists.md` = `4`
- [ ] AC-2: `grep -rci "commit planning artifacts" skills/start/` = `0`
- [ ] AC-3: `grep -c "## Commit Planning Artifacts" skills/start/references/inline-steps.md` = `0`
- [ ] AC-4: `grep -q "docs/plans/YYYY-MM-DD" skills/design-document/SKILL.md` exits non-zero
- [ ] AC-5: `grep -q "feature-flow:design:start" skills/design-verification/SKILL.md`
- [ ] AC-6: `grep -q "design_issue" skills/start/references/yolo-overrides.md`
- [ ] AC-7: All 4 non-quick step lists start with `Worktree setup` AND no step list writes to the base branch before that
- [ ] AC-8: `awk '/## Handoff Step/,/^---/' skills/start/references/inline-steps.md | grep "git worktree remove"` exits with no output
- [ ] AC-9: `test -f skills/cleanup-merged/SKILL.md`
- [ ] AC-10: `grep -A 12 "### Quick fix" skills/start/references/step-lists.md | grep -q "1. Understand the problem"`
- [ ] AC-11: `grep -rn "docs/plans" skills/start/references/step-lists.md` produces no output
- [ ] AC-12: `grep -q "sha256\|first.*content.*words\|stop words" skills/start/SKILL.md`
- [ ] AC-13: `grep -q "pending-<slug>\|pending_slug" skills/start/SKILL.md`
- [ ] AC-14: `grep -q "renamed\|pr-number>.yml" skills/start/SKILL.md`
- [ ] AC-15: `grep -q ".feature-flow/handoffs/" .gitignore`
- [ ] AC-16: Six grep checks on `skills/cleanup-merged/SKILL.md` (schema_version, git worktree remove, git branch -D, git push origin --delete, rm handoffs, .log) all exit 0
- [ ] AC-17: `grep -q "feature-flow:cleanup-merged" skills/merge-prs/SKILL.md`
- [ ] AC-18: `grep -q "Opportunistic cleanup pre-flight" skills/start/SKILL.md`
- [ ] AC-19: `grep -q "feature-flow:design:start" skills/design-document/SKILL.md` AND `grep -q "65,536" skills/design-document/SKILL.md`
- [ ] AC-20: `grep -q "feature-flow:design:start" skills/create-issue/SKILL.md`
- [ ] AC-21: `test -f docs/plans/README.md` AND `grep -q "GitHub issue" docs/plans/README.md`
- [ ] AC-22: `grep -q "schema_version\|pending_slug\|worktree_path\|feature_flow_version" skills/cleanup-merged/SKILL.md` (all four fields present)

**Quality Constraints:**
- Parallelizable: no (integration test — depends on all Phase 4 tasks completing)

---

## Self-review notes

**Spec coverage:**

| Design doc section | Covered by task |
|--------------------|----------------|
| §1.1 Slug algorithm | Task 2.2 (Skill Mapping row for Worktree setup) |
| §1.2 Worktree setup as Step 1 | Tasks 2.1, 2.2 |
| §1.3 Handoff state file schema | Task 1.1 (cleanup-merged reads schema) + Task 2.2 (SKILL.md documents creation) |
| §1.4 .gitignore entry | Task 1.2 |
| §1.5 Defer-logic removal | Task 2.3 |
| §2.1 create-issue before design-document ordering | Tasks 2.1, 3.3 |
| §2.2 Merge-into-issue-body protocol | Task 3.1 |
| §2.3 docs/plans/ no longer a write target + README | Tasks 1.3, 3.1, 3.3 |
| §3.1 New cleanup-merged skill | Task 1.1 |
| §3.2 merge-prs integration | Task 4.1 |
| §3.3 Opportunistic pre-flight at start: | Task 4.2 |
| §3.4 Handoff step no longer removes worktree | Task 4.3 |
| §4 New step-list orderings (four scopes) | Task 2.1 |

**Gaps found and addressed:**
- AC-12 (slug algorithm) is documented in Task 2.2's Worktree setup row update and cross-checked in Task 4.4's AC-12 grep. The slug algorithm itself is complex — the grep checks for the key design terms (`sha256`, `stop words`, `content words`) to ensure they're present in the updated Worktree setup description.
- AC-14 (handoff rename at Commit-and-PR) is documented in Task 2.2 (Skill Mapping table update adds the rename note). The inline-steps Commit and PR section is not separately tasked because the rename logic is described inline in the SKILL.md step row. Task 4.4 AC-14 grep checks this.
- The `feature-flow-metadata-schema.md` update (Task 3.5) also requires updating any inline-steps PR Metadata Block Step references to `design_doc` — covered by Task 2.3 which removes the entire Commit Planning Artifacts section and by Task 3.5's grep-zero AC check.
