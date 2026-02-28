# Reduce Orchestrator Token Consumption — Design Document

**Date:** 2026-02-27
**Status:** Draft
**Issue:** #111

## Overview

The parent orchestrator in `skills/start/SKILL.md` accumulates context across every lifecycle step, with each API call re-reading the full conversation history (~115K cached tokens). Session analysis shows the parent consumed 98.7% of total session cost ($9.85 of $9.98) across 213 API calls for a single small enhancement. Three targeted changes to the Step 2 (task creation), Step 3 (status update frequency), and two inline step descriptions reduce parent API calls by ~36–40 per session without changing any behavioral outcomes.

## Problem

In a measured session (d1bab02a), the parent orchestrator:
- Made 213 API calls (1 every 8 seconds over 28 minutes)
- Consumed 25M tokens (97.85% cache reads)
- Made 41 task management calls (14 TaskCreate + 27 TaskUpdate)
- Dispatched only 7 subagents

The overhead comes from sequential TaskCreate calls (18 separate turns to build the step list), double-status-update patterns for simple steps (in_progress + completed per step), and inline bash operations for git steps that could run in a subagent's fresh context window.

## Solution Architecture

Four text changes to `skills/start/SKILL.md`:

### Change 1 — Batch TaskCreate in Step 2

**Location:** The line "Use the `TaskCreate` tool to create a todo item for each step" at the end of the "Step 2: Build the Step List" section.

**Current behavior:** LLM calls TaskCreate once per step, sequentially — 18 separate API turns.

**New behavior:** All TaskCreate calls in a single parallel message. One turn creates the entire task list.

**Instruction addition:** Append to the existing TaskCreate instruction line:

> "Call all TaskCreate tools in a **single parallel message** — send one message containing all N TaskCreate calls simultaneously. Do NOT call them one at a time; sequential calls waste N−1 parent API turns. This is the most impactful optimization: all steps must be created in one turn."

**Savings:** ~17 parent API calls (from 18 sequential turns → 1 turn).

### Change 2 — Skip `in_progress` for Skill-Invoking Steps in Step 3

**Location:** Sub-step 2 of "Step 3: Execute Steps in Order": "**Mark in progress:** Update the todo item to `in_progress` using `TaskUpdate`"

**Current behavior:** Every step calls TaskUpdate twice — once to set `in_progress`, once to set `completed`. For steps that immediately invoke a skill, the `in_progress` call has no user-visible benefit (the skill announces what it's doing anyway).

**New behavior:** Skip the `in_progress` update for steps that consist of a single skill invocation. Only set `in_progress` for long inline steps where showing active status provides real user value.

**Instruction change:** Replace sub-step 2 with:

> "**Mark in progress (conditional):** Only set `in_progress` via `TaskUpdate` before starting steps where the work is extended and the user benefits from an active status indicator. Steps that keep `in_progress`: study existing patterns, implementation, self-review, code review, generate CHANGELOG entry, final verification, documentation lookup (multiple MCP queries). Steps that skip `in_progress`: brainstorming, design document, design verification, create/update issue, implementation plan, verify plan criteria, worktree setup, copy env files, commit planning artifacts, commit and PR, comment and close issue. Note: sub-step 5 (completed) is always retained — it is the turn-continuity bridge. Skipping in_progress does not affect YOLO Execution Continuity."

**Savings:** ~10–12 parent API calls (skipping in_progress for ~10–12 short/mechanical steps out of 18 total).

### Change 3 — Delegate Commit Planning Artifacts to a Subagent

**Location:** "Commit Planning Artifacts Step (inline — no separate skill)" section.

**Current behavior:** Parent runs 3–4 sequential bash calls inline: `git status --porcelain`, `git add`, `git commit`. Each bash call is a parent API turn.

**New behavior:** Parent dispatches a `general-purpose` subagent with all needed context (feature name, files to commit, commit message template). Subagent runs all bash commands in its own context window and returns the result.

**New section content:**

```
This step runs after verify-plan-criteria and before worktree setup.

**Process:**
1. Run inline: `git status --porcelain docs/plans/*.md .feature-flow.yml 2>/dev/null`
   - If output is empty AND exit code is 0: skip — "No planning artifacts to commit."
   - If output is empty AND exit code is non-zero (git error suppressed by 2>/dev/null): treat conservatively as "artifacts may exist" and proceed to step 2 to let the subagent determine.
   - If output is non-empty: proceed to step 2.
2. Dispatch a general-purpose subagent to commit:

   Task(
     subagent_type: "general-purpose",
     model: "sonnet",
     description: "Commit planning artifacts to base branch",
     prompt: "Commit the following files to git with the given message. Files: docs/plans/*.md and .feature-flow.yml (stage only modified/new files — git add is safe on unchanged tracked files). Commit message: 'docs: add design and implementation plan for [feature-name]'. Run: git add docs/plans/*.md .feature-flow.yml && git commit -m '[message]'. If no files are staged after add (nothing changed), report 'nothing to commit'. Return: committed SHA or 'nothing to commit'."
   )

3. Announce the result: "Planning artifacts committed: [SHA]" or "Nothing to commit."

**Edge cases:** .feature-flow.yml unchanged is safe (git add no-ops). If no plan files exist, git status returns empty (exit 0) and step is skipped.
```

**Savings:** ~2 parent API calls (add + commit bash calls moved to subagent context; status check remains inline).

### Change 4 — Delegate Comment and Close Issue to a Subagent

**Location:** "Comment and Close Issue Step (inline — no separate skill)" section.

**Current behavior:** Parent generates the comment body inline (reading from lifecycle context), then runs 3 bash calls: `gh issue view`, `gh issue comment`, `gh issue close`. Comment generation requires reading lifecycle context (design doc, commits, acceptance criteria) which contributes to parent context size.

**New behavior:** Parent passes all needed context to a `general-purpose` subagent (PR number, issue number, "what was built" bullets, acceptance criteria list, key files from diff). Subagent generates and posts the comment and closes the issue.

**New section content:**

```
This step only runs when a GitHub issue was linked during Step 1. If no issue was linked, skip silently.

**Process:**
1. Check issue state inline: `gh issue view N --json state --jq '.state'`. If CLOSED, log "Issue #N already closed — skipping."
2. Gather context inline (2 bash calls — needed to build the comment body accurately):
   - Commits: `git log --format="%s" [base-branch]...HEAD` → derive 2-4 "what was built" bullets
   - Key files: `git diff --stat [base-branch]...HEAD | head -10` → key files list
   - PR number: from conversation context (produced by "Commit and PR" step)
   - Acceptance criteria: from conversation context (implementation plan tasks + final verification results)
3. Dispatch a general-purpose subagent with the fully-assembled content (no placeholders):

   Task(
     subagent_type: "general-purpose",
     model: "sonnet",
     description: "Post issue comment and close issue #N",
     prompt: "Post a comment on GitHub issue #[N], then close it. Use exactly this comment body:

   ## Implementation Complete

   **PR:** #[PR number — fill from context]

   ### What was built
   - [bullet 1 from git log]
   - [bullet 2 from git log]

   ### Acceptance criteria verified
   - [x] [criterion 1]
   - [x] [criterion 2]

   ### Key files changed
   - [file path] — [description]
   [continue up to 10 files]

   Run: gh issue comment [N] --body '[content]' then gh issue close [N]. If gh fails, log and continue."
   )

4. Announce: "Issue #N commented and closed."

**Edge cases:** gh command failure → log and continue. Issue already closed → checked in step 1, skip dispatch.
Note: YOLO propagation (prepending yolo: true) applies only to Skill() invocations, not to Task() dispatches. These subagents receive no mode flag — they execute git/gh commands only with no user interaction required.
```

**Savings:** ~1 parent API call net (2 data-gathering bash calls stay inline; gh comment + close move to subagent; down from ~3 originally estimated).

## Patterns & Constraints

### Error Handling
- If the subagent in Change 3 returns "nothing to commit", log and proceed — not an error
- If the subagent in Change 4 fails, log warning and continue — issue commenting is non-blocking
- No retry logic needed for these subagents (idempotent git/gh operations)

### Types
- No new types introduced — this is a skill file (markdown) change only
- No TypeScript, Python, or executable code is modified

### Performance
- All 4 changes reduce parent API calls; none add latency
- Subagent dispatches run asynchronously from the parent's perspective — they do not block the parent's context from shrinking, but they also don't slow down the perceived lifecycle

### Compatibility
- **Interactive mode:** No behavioral change — in_progress skip only removes a status update the user doesn't see; git subagents produce the same outputs
- **Express mode:** Same as Interactive
- **YOLO mode:** Subagents receive YOLO context flag if relevant; git subagents don't need it (no user interaction)
- **Mobile platform:** No impact on mobile-specific steps (device matrix, beta testing, app store review remain inline)

## Scope

### Included
- Batch TaskCreate calls in Step 2
- Skip in_progress updates for skill-invoking steps in Step 3
- Delegate Commit Planning Artifacts to general-purpose subagent
- Delegate Comment and Close Issue to general-purpose subagent

### Excluded
- Planner subagent for design doc + implementation plan (breaks Interactive mode — these steps use AskUserQuestion)
- Reducing number of skill invocations (each is necessary for lifecycle correctness)
- Programmatic `/compact` (client-side only, cannot be automated)
- Changes to any file other than `skills/start/SKILL.md`
- Modifying the dispatcher infrastructure or agent definitions
- Changes to non-start skills (brainstorming, design-document, etc.)

## Expected Impact

| Optimization | Current Calls | After | Savings |
|---|---|---|---|
| Batch TaskCreate | ~18 turns | 1 turn | ~17 |
| Skip in_progress | ~18 updates | ~7 updates | ~11 |
| Commit artifacts subagent | ~3 bash calls | 1 check + subagent | ~2 |
| Issue comment/close subagent | ~4 bash calls | 3 inline + subagent | ~1 |
| **Total** | **~213** | **~182** | **~31 (~15%)** |

Estimated cost reduction: ~$1.50–$2 per feature-scope session based on the $9.98 measured session.
