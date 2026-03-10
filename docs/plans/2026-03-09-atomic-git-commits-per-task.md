# Atomic Git Commits Per Task — Design Document

**Date:** 2026-03-09
**Status:** Draft
**Issue:** #169

## Overview

Feature-flow currently commits all implementation work as a single bundle at PR time. This design introduces atomic commits per acceptance criterion — each criterion gets its own commit with a standardized message — enabling `git bisect` to pinpoint the exact criterion where a bug was introduced. Implementation is documentation-only: a new reference file plus cross-references in existing skill files.

## Example

```
# Single-criterion commit
feat(brainstorming): add YOLO self-answer loop — ✓YOLO skips interactive prompts

# Multi-criterion commit (when criteria are tightly coupled)
feat(brainstorming): add YOLO self-answer loop — ✓YOLO skips interactive prompts ✓Express propagation applied

# Long criterion list → move to body
feat(start): add tool selector step 0

Criteria verified:
✓ GH169 tool_selector.enabled=false skips detection
✓ confidence_threshold read from .feature-flow.yml
✓ auto_launch_gsd triggers without prompt
```

## User Flow

### Step 1 — Developer implements a task
The implementer (subagent or human) works on a plan task. Each task has one or more acceptance criteria.

### Step 2 — Commit per criterion (or per tightly-coupled group)
After verifying a criterion passes, commit immediately:
```bash
git add <files>
git commit -m "feat(component): task description — ✓criterion text"
```
If multiple criteria are verified together (e.g., they test the same code path), include all in one commit. Keep the description under 72 characters total; move overflow to the commit body.

### Step 3 — Update progress index
After committing, update the plan's `STATUS` field for that task from `in-progress` to `done (commit [SHA])`, where `[SHA]` is the last criterion commit for that task.

### Step 4 — git bisect workflow (when debugging)
```bash
git bisect start
git bisect bad HEAD          # current broken state
git bisect good <old-SHA>    # known good commit
# bisect narrows to a specific criterion commit
git bisect run <test-script>
```
Each bisect step lands on a criterion-level commit, revealing exactly which criterion introduced the regression.

## Pipeline / Architecture

Atomic commits integrate at two existing lifecycle points:

| Lifecycle Step | Change |
|---------------|--------|
| **Implement (subagent-driven-development)** | Subagent commits after each criterion is verified, not after the full task |
| **Commit and PR (finishing-a-development-branch)** | No change — PR already exists; atomic commits are already in the branch history |

The `yolo-overrides.md` subagent quality injection gains an explicit "atomic commit" requirement so every subagent implementation agent inherits it.

## Patterns & Constraints

### Commit Message Format
- Follows Conventional Commits 1.0.0: `<type>(<scope>): <description>`
- Criterion suffix uses unicode checkmarks: `— ✓<criterion>`
- Max description line: 72 characters (terminal readability)
- Long criterion lists: move to commit body (see Example above)
- Types to use: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

### Error Handling
- No tooling enforces the format — this is convention + documentation only
- If a subagent makes a wrong commit message: create a corrective commit (never `--amend`) per existing policy in `yolo-overrides.md`

### Types
- No new types introduced (documentation-only change)

### Performance
- No performance impact (no runtime code)

## Files Changed

| File | Action | Purpose |
|------|--------|---------|
| `references/git-workflow.md` | **Create** | Canonical atomic commit guidelines |
| `skills/start/references/yolo-overrides.md` | **Update** | Add atomic commit requirement to subagent quality injection; cross-reference git-workflow.md |
| `skills/start/references/inline-steps.md` | **Update** | Add commit message format reference to commit steps |

## Scope

**Included:**
- New `references/git-workflow.md` with: commit message format, per-criterion commit workflow, git-bisect usage guide, examples
- Cross-references from `yolo-overrides.md` (subagent quality injection + commit safety section)
- Cross-reference from `inline-steps.md` (commit planning artifacts step)

**Excluded:**
- No commit hook or linter enforcement
- No changes to plan file schema (STATUS tracking is unchanged)
- No changes to `finishing-a-development-branch` skill (PR step is unaffected)
- No changes to `subagent-driven-development` skill directly (guidance travels via yolo-overrides quality injection)
