# Harden PR + Handoff Refactor — Design Document

**Date:** 2026-04-08
**Status:** Approved (Express mode)
**Issue:** #228 — lifecycle: replace Ship step with Harden PR + Handoff; stop auto-close and auto-merge
**Scope:** Major feature (plugin-internals refactor)

## Overview

Restructure the `feature-flow:start` lifecycle so that its terminal phase no longer auto-closes the linked issue and no longer invokes `feature-flow:merge-prs`. Instead, the lifecycle **hardens** the PR (CI green, conflicts resolved, reviews addressed) via a bounded-remediation loop, then **hands off** a mergeable PR to the user with a clear next-step announcement. Issue closure rides on the GitHub merge event via `Closes #N` in the PR body. After this change, `start` and `merge-prs` become two **independent** entry points that share one remediation knowledge base at top-level `references/`.

## Motivation

Three problems exist in the current lifecycle:

1. **Ordering bug.** `Comment and Close Issue` runs *before* the Ship phase — if `merge-prs` skips the PR the issue is already closed despite nothing being shipped.
2. **Three competing closure mechanisms** (inline `gh issue close`, merge-prs safety net, `Related: #N` in PR body) compete for one state transition.
3. **Auto-merge violates the "risky actions warrant confirmation" principle** — merging has large blast radius and should be the user's deliberate action.

## Approach

**Harden + Handoff refactor.** Two new inline steps replace the Ship step at the terminal end of the lifecycle for Feature + Major Feature scopes:

```
... (existing steps through Commit and PR) ...
- [ ] N.   Wait for CI and address reviews   ← existing, unchanged
- [ ] N+1. Harden PR for merge               ← NEW: bounded remediation loop
- [ ] N+2. Post implementation comment       ← RENAMED from "Comment and close issue"
- [ ] N+3. Handoff                           ← NEW: announce mergeable PR, stop
```

`Post implementation comment` replaces `Comment and close issue` in **all** step lists (quick fix, small enhancement standard + fast-track, feature, major feature) — the rename is global, because the closure-via-merge semantics apply to every scope. Smaller scopes (quick fix, small enhancement) do **not** get Harden PR or Handoff; they end at Post Implementation Comment with the existing completion summary.

## Two independent entry points, one shared knowledge base

Four shared remediation reference files move from `skills/merge-prs/references/` to top-level `references/`:

| File | Current location | New location |
|------|------------------|--------------|
| `best-effort-remediation.md` | `skills/merge-prs/references/` | `references/` |
| `ci-remediation.md` | `skills/merge-prs/references/` | `references/` |
| `conflict-resolution.md` | `skills/merge-prs/references/` | `references/` |
| `review-triage.md` | `skills/merge-prs/references/` | `references/` |
| `dependency-analysis.md` | `skills/merge-prs/references/` | **unchanged** — merge-prs-specific |

Both `start` and `merge-prs` read from `references/` without cross-skill coupling.

## Step specifications

### Harden PR Step (new inline step)

**Location:** Runs after `Wait for CI and address reviews`, before `Post implementation comment`. Feature + Major Feature only.

**Process:**

1. Read shared references: `references/best-effort-remediation.md`, `references/ci-remediation.md`, `references/conflict-resolution.md`, `references/review-triage.md`
2. `gh pr view <pr_number> --json state,mergeable,statusCheckRollup,reviews,reviewDecision`
3. Apply remediation loop (bounded by `lifecycle.harden_pr.max_attempts` and `max_wall_clock_minutes`):
   - CI red → `ci-remediation.md` strategies
   - Conflicting → `conflict-resolution.md` graduated ladder (Tier 3 pauses even in YOLO)
   - Unresolved reviews → `review-triage.md` (blockers without auto-fix pause)
   - All clean → exit loop
4. Final mergeable check → `READY` or `BLOCKED`
5. Output structured summary (CI, Conflicts, Reviews, Remediation log)

**Mode behavior:**

| Mode | Behavior |
|------|----------|
| YOLO | Fully automatic; pause only on mandated conflict/review cases |
| Express | First attempt confirmed via AskUserQuestion; subsequent automatic |
| Interactive | Confirm each attempt with diff |

**Edge cases:** budget exhausted → BLOCKED but continue to Handoff; already merged → skip Harden + Comment, go straight to Handoff; already green → skip loop; wall-clock mid-attempt → finish current fix then exit BLOCKED.

### Post Implementation Comment Step (renamed from Comment and Close Issue)

Identical to the current step **except:**
1. Section heading renamed
2. Subagent prompt drops `gh issue close` — only `gh issue comment`
3. Comment body template adds closing line: *"This issue will close automatically when PR #N is merged."*
4. Success announce: `"Issue #N commented (will auto-close on PR merge)."`
5. "Already closed" check keeps working (handles user-merged-mid-lifecycle case)

### Handoff Step (new inline step, terminal)

**Location:** Final step for Feature + Major Feature. Replaces the Ship step and the current Step 5 completion output for these scopes.

**Process:**
1. Re-read PR state
2. Count sibling open feature-flow PRs (informational)
3. Count pending `.changelogs/*.md` fragments
4. Build handoff announcement (PR URL + status, issue auto-close note, changelog fragments pending, 3 suggested next actions, worktree state)
5. Mode behavior:
   - YOLO + `lifecycle.handoff.auto_invoke_merge_prs: true` → invoke merge-prs
   - Otherwise → stop after announcing (default, preserves deliberate-merge principle)
6. Fire `notifications.on_stop` if set

## File-level change map

### Lifecycle skill files

| File | Change |
|------|--------|
| `skills/start/SKILL.md` | Replace §"Ship Step" (line 697) with pointers to new Harden PR + Handoff inline steps. Update Skill Mapping table: rename "Comment and close issue" → "Post implementation comment"; replace "Ship (merge related PRs)" entry with "Harden PR" and "Handoff" rows. Update Step 5 Completion summary to reflect handoff terminal state. |
| `skills/start/references/inline-steps.md` | Rename §"Comment and Close Issue Step" (line 713) → "Post Implementation Comment Step". Remove `gh issue close` from subagent prompt (line 766). Add new §"Harden PR Step" + §"Handoff Step". |
| `skills/start/references/yolo-overrides.md` | Line 161: `Related: #N` → `Closes #N`. Update rationale sentence. |
| `skills/start/references/step-lists.md` | All 5 step lists: rename "Comment and close issue" → "Post implementation comment" (lines 24, 51, 71, 96, 123). Feature (line 97) and Major feature (line 124): replace "Ship (merge related PRs)" with "Harden PR" + "Handoff". Mobile adjustments updated. |

### merge-prs skill files

| File | Change |
|------|--------|
| `skills/merge-prs/SKILL.md` | Remove §"Lifecycle Mode" (lines 29-181) entirely. Remove post-merge issue closure block (lines 104-106). Update frontmatter description. Update Mode Detection table (remove Lifecycle row). Update path references for moved files. |
| `skills/merge-prs/references/best-effort-remediation.md` | **Move** to `references/best-effort-remediation.md` |
| `skills/merge-prs/references/ci-remediation.md` | **Move** to `references/ci-remediation.md` |
| `skills/merge-prs/references/conflict-resolution.md` | **Move** to `references/conflict-resolution.md` |
| `skills/merge-prs/references/review-triage.md` | **Move** to `references/review-triage.md` |
| `skills/merge-prs/references/dependency-analysis.md` | Unchanged (merge-prs-specific) |

### Configuration

| Change | Details |
|--------|---------|
| `lifecycle.harden_pr` section | Fields: `enabled` (bool, default true), `max_attempts` (int, default 3), `max_wall_clock_minutes` (int, default 10), `pause_on_unresolvable_conflict` (bool, default true) |
| `lifecycle.handoff.auto_invoke_merge_prs` | Field: bool, default **false**. When true + YOLO → Handoff auto-invokes merge-prs. Documented as "restores legacy auto-merge behavior; bypasses merge confirmation principle." |
| `yolo.stop_after` enum | Drop `ship`. Add `harden_pr` and `handoff`. `ship` becomes deprecated alias → `handoff` for one release. |

## Changelog consolidation

**Option B (defer to merge-prs invocation).** Fragments stay in `.changelogs/` until user runs `/merge-prs`, at which point consolidation runs as part of merge-prs's terminal step. The Handoff announcement states: *"Changelog fragments in `.changelogs/` will be consolidated when you run `/merge-prs`."*

## Patterns & Constraints

### Error Handling

- `gh` command failures: log warning, continue (housekeeping steps must never block the lifecycle)
- Budget exhaustion in Harden PR: record BLOCKED status, proceed to Handoff (do not loop indefinitely)
- PR merged externally mid-lifecycle: Harden PR + Post Comment skip; Handoff announces "merged externally"

### Types

This is a markdown + YAML schema refactor — no TypeScript types involved. YAML schema additions use standard types (bool, int, string).

### Performance

- Harden PR loop bounded by `max_attempts` (default 3) and `max_wall_clock_minutes` (default 10)
- No polling tighter than `ci_poll_interval_seconds` floor (30s) — GitHub API rate-limit safe

### Stack-Specific

- Plugin is skill-markdown + YAML. No code changes. Verification is grep-based mechanical acceptance criteria.

## Migration Requirements

1. Move `skills/merge-prs/references/best-effort-remediation.md` → `references/best-effort-remediation.md`
2. Move `skills/merge-prs/references/ci-remediation.md` → `references/ci-remediation.md`
3. Move `skills/merge-prs/references/conflict-resolution.md` → `references/conflict-resolution.md`
4. Move `skills/merge-prs/references/review-triage.md` → `references/review-triage.md`
5. Update cross-references per path resolution rules below.
6. Users of `yolo.stop_after: ship` in `.feature-flow.yml` are auto-mapped to `handoff` for one release with a deprecation warning. No breaking change this release.

### Path resolution rules

References to the moved files use relative paths. After the move:

- **From `skills/merge-prs/SKILL.md`** (7 locations: lines 88, 225, 237, 265, 266, 282, 285): replace bare `` `references/<name>.md` `` → `` `../../references/<name>.md` `` (matches existing `../../references/` pattern already used on lines 513, 779, 819-821 of `skills/start/SKILL.md`).
- **From `skills/start/references/inline-steps.md`** (new Harden PR Step): use `` `../../references/<name>.md` `` to reach the top-level files.
- **Internal cross-refs between the 3 moved files** (`best-effort-remediation.md` ↔ `ci-remediation.md` ↔ `review-triage.md`): replace bare `` `references/<sibling>.md` `` → bare `` `<sibling>.md` `` (same-directory siblings after the move). Affected lines: `best-effort-remediation.md:12-14`, `ci-remediation.md:5,126,128-132`, `review-triage.md:5,209,267,269-273`. `conflict-resolution.md` has no internal cross-refs.
- **Within `skills/merge-prs/references/dependency-analysis.md`** (which stays in place): no references to the 4 moved files exist — no update needed.

### Additional call sites found during verification

- `skills/start/references/step-lists.md` lines 135 and 137 (mobile platform adjustments prose) also need the "comment and close issue" rename.
- `skills/start/SKILL.md`: drop `ship` from the `yolo.stop_after` table at line 636 and add `harden_pr` + `handoff` rows; rewrite the Ship Step `yolo.stop_after` check at lines 708-711 for the new handoff phase name.

## Scope

### Included
- Full set of file edits for `skills/start/`, `skills/merge-prs/`, and config schema docs
- File relocation of 4 shared references + caller updates
- CHANGELOG fragment documenting the semantics shift
- All ~30 machine-verifiable acceptance criteria from issue #228
- Manual end-to-end test cases listed in issue

### Explicitly Excluded
- Modifying the bounded-remediation patterns themselves (owned by #224/#225/#226)
- PR body metadata block (covered by sibling issue)
- Removing "Wait for CI and address reviews" (kept as first-pass sync)
- Cross-repo lifecycle coordination
- Changelog consolidation logic changes beyond deferral-to-merge-prs

## Acceptance criteria

See issue #228 for the full list of ~30 machine-verifiable acceptance criteria. The implementation plan will map each AC to a specific task with verification commands (grep patterns, file existence checks, path absence checks).
