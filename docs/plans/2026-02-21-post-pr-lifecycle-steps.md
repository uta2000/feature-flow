# Post-PR Lifecycle Steps — Design Document

**Date:** 2026-02-21
**Status:** Approved
**Issue:** #34

## Overview

After the lifecycle creates a PR, users are left without guidance — no issue closure, no implementation summary, no next steps. This feature adds three things: (1) a new inline step that comments on and closes the linked GitHub issue with a detailed implementation summary, (2) configurable PR target branch detection replacing the hardcoded `main` assumption, and (3) an expanded completion summary with worktree status and actionable next steps.

## User Flow

### Step 1 — PR is created
The existing "Commit and PR" step completes as today. The `finishing-a-development-branch` skill creates the PR with `Related: #N` (not `Closes #N`) in the body to link without auto-closing.

### Step 2 — Issue is commented and closed
The lifecycle posts a detailed comment to the linked GitHub issue summarizing what was implemented, then explicitly closes the issue via `gh issue close`. This gives the issue a rich record of what was done, not just a silent close on merge.

### Step 3 — Completion summary
The expanded summary tells the user what happened (PR created, issue closed, worktree status) and what to do next (review PR, verify on staging, clean up local branch).

## Changes to `skills/start-feature/SKILL.md`

### 1. New Inline Step: "Comment and Close Issue"

Insert after "Commit and PR" and before "Step 5: Completion" in the skill mapping table and all scope step lists.

**Step list changes (all scopes):**
- Quick fix: Add step between current step 6 and completion (new step 7: "Comment and close issue")
- Small enhancement: Add step between current step 16 and completion (new step 17)
- Feature: Add step between current step 17 and completion (new step 18)
- Major feature: Add step between current step 18 and completion (new step 19)

**Mobile platform ordering:** For mobile platforms, "Comment and close issue" goes **after** all platform-specific steps (device matrix testing, beta testing, app store review) and **before** completion. Rationale: don't close the issue until all testing/review gates pass.

**Skill mapping addition:**

| Step | Skill to Invoke | Expected Output |
|------|----------------|-----------------|
| Comment and close issue | No skill — inline step | Issue commented with summary + closed |

**Inline step definition:**

The step only runs when an issue was linked in Step 1 (issue reference detection). Process:

1. Generate comment body from lifecycle context:
   - PR number (from the just-created PR)
   - "What was built" bullets from the design doc and commit history
   - Acceptance criteria from the implementation plan, marked as verified
   - Key files changed (limit to 10 most significant)

2. Post the comment: `gh issue comment N --body "[generated comment]"`

3. Close the issue: `gh issue close N`

4. Announce: `"Issue #N commented and closed."`

**Comment template:**
```markdown
## Implementation Complete

**PR:** #[PR number]

### What was built
- [2-4 bullet points from design doc and commit history]

### Acceptance criteria verified
- [x] [Each criterion from implementation plan]

### Key files changed
- `[file path]` — [1-line description]
[limit to 10 most significant files]
```

**Edge cases:**
- No issue linked → skip silently
- Issue already closed → log warning, skip
- `gh` command fails → log warning, continue (don't block completion)

**YOLO behavior:** No prompt needed — always automated in both modes.

### 2. PR Target Branch Detection

Replace the hardcoded `main` assumption in the "Finishing a Development Branch YOLO Override" section with a detection cascade.

**Detection order:**
1. `.feature-flow.yml` → `default_branch` field (if present)
2. `git config --get init.defaultBranch` (if set)
3. Check if `staging` branch exists: `git rev-parse --verify staging 2>/dev/null`
4. Fall back to `main` (or `master` if `main` doesn't exist)

**What changes in SKILL.md:**

- **Finishing YOLO Override:** Change "Auto-confirm `main` (or `master` if `main` doesn't exist)" to "Auto-confirm detected default branch" with the detection cascade above
- **CHANGELOG git log:** Change `git log --format="%s" main...HEAD` to use detected base branch
- **Code review pipeline:** Change `git diff main...HEAD` references to use detected base branch
- **Commit planning artifacts:** "committed to base branch" language already generic — no change needed

**Important:** The base branch is detected once during Step 0 and announced (e.g., "Detected base branch: staging"). All references to `main` in git commands throughout the lifecycle (CHANGELOG generation, code review pipeline, finishing override) use the detected base branch instead. Since this is an LLM-orchestrated lifecycle with no programmatic state, the announcement serves as the storage mechanism — the LLM carries the detected value through conversation context.

### 3. PR Body: `Related: #N` Instead of `Closes #N`

Add an explicit instruction in the "Finishing a Development Branch YOLO Override" section:

> When a GitHub issue is linked to the lifecycle, include `Related: #N` in the PR body to link the PR to the issue. Do NOT use `Closes #N` — the lifecycle closes the issue explicitly in the "Comment and Close Issue" step with a detailed comment.

### 4. Expanded Completion Summary

Replace the current Step 5: Completion template with an expanded version that includes:
- Issue close status (commented and closed, or not linked)
- PR target branch (the detected default branch)
- Worktree status (removed or still active with cleanup command)
- Next steps guidance (review PR, verify on staging, clean up branch)

**New template:**
```
Lifecycle complete!

Summary:
- Platform: [web/ios/android/cross-platform]
- Design doc: docs/plans/YYYY-MM-DD-feature.md
- Issue: #[number] (commented and closed)
- PR: #[number] → [base branch]
- All acceptance criteria verified

Worktree: [Removed / Still active at .worktrees/feature-name]
[If still active: "Run `git worktree remove .worktrees/feature-name` when done."]

What to do next:
1. Review PR #[number] on GitHub (or request team review)
2. After PR merges to [base branch], verify in [base branch] environment
3. Clean up local branch: `git branch -d feature-name && git fetch --prune`

[List any skipped steps and their risks]
[List any platform-specific notes]
```

## Changes to `references/project-context-schema.md`

### Add `default_branch` Field

Add a new `### default_branch` section after the existing `types_path` section.

**Schema addition:**
```yaml
default_branch: staging  # Optional: PR target branch (default: detected via cascade)
```

**Documentation:**
- Optional string field
- When set, overrides the detection cascade for PR target branch
- When absent, detection cascade runs: `git config --get init.defaultBranch` → check `staging` → `main`/`master`
- Used by: `start-feature` (lifecycle context), `finishing-a-development-branch` (PR target)

Also add `default_branch` to the example in the Schema section and to the "How Skills Use This File" section under `start-feature`.

## Scope

**Included:**
- New "Comment and Close Issue" inline step in SKILL.md
- PR target branch detection cascade in SKILL.md
- `Related: #N` instruction in finishing override
- Expanded completion summary template
- `default_branch` field in project-context-schema.md
- YOLO behavior for all new functionality

**Excluded:**
- Changes to `create-issue` skill (already handles existing issues)
- Changes to `design-verification` skill
- Changes to `verify-acceptance-criteria` skill (issue explicitly excludes this)
- Changes to hook scripts (no hooks needed for this feature)
- Changes to any other skills beyond start-feature
