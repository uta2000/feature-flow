# Batch TaskUpdate Calls to Reduce Orchestrator API Frequency — Design Document

**Date:** 2026-03-02
**Status:** Draft
**Issue:** #132

## Overview

The start lifecycle orchestrator currently makes two sequential `TaskUpdate` API calls at every task transition — one to mark the completed task `completed`, another to mark the next task `in_progress` — before dispatching an Agent subagent. Each call is a separate API round-trip, and with 17 lifecycle steps plus implementation sub-tasks, these accumulate to 10–20 extra API calls per session (~$0.87–$1.74 overhead at observed session rates). The fix batches both `TaskUpdate` calls into a single parallel message, eliminating one API round-trip per task transition.

## Example

**Before (3 sequential API calls):**
```
Turn N:   TaskUpdate(step 6, completed)         → 1 API call
Turn N+1: TaskUpdate(step 7, in_progress)       → 1 API call
Turn N+2: Agent(dispatch implementer subagent)  → 1 API call
```

**After (2 API calls):**
```
Turn N:   [TaskUpdate(step 6, completed) + TaskUpdate(step 7, in_progress)]  → 1 API call (parallel)
Turn N+1: Agent(dispatch implementer subagent)                               → 1 API call
```

## Solution Architecture

Two sections in `skills/start/SKILL.md` receive targeted additions:

### Change 1 — Step 3 Lifecycle Loop (sub-steps 2 & 5)

The current instruction in sub-step 5 says: "Mark complete: Update the todo item to `completed` — **always call `TaskUpdate` here.**"

Add a batching rule: when transitioning between lifecycle steps and the next step will use `in_progress` status (per the eligibility list in sub-step 2), combine `TaskUpdate(N, completed)` and `TaskUpdate(N+1, in_progress)` into a single parallel message.

The in_progress-eligible steps (where batching applies): study existing patterns, implementation, self-review, code review, generate CHANGELOG entry, final verification, documentation lookup.

For all other step transitions (next step skips `in_progress`), no change — the single `TaskUpdate(completed)` call is already optimal.

### Change 2 — Subagent-Driven Development Context Injection

The existing context injection section (line ~765 in `skills/start/SKILL.md`) guides what the orchestrator does when `subagent-driven-development` runs its implementation task loop.

Add a batching rule: when an implementation task completes and the next task begins, batch `[TaskUpdate(impl task N, completed) + TaskUpdate(impl task N+1, in_progress)]` into a single parallel message, then dispatch `Agent` for the next implementation subagent.

This mirrors the lifecycle-level batching but for the inner loop of implementation sub-tasks.

## Scope

**Included:**
- `skills/start/SKILL.md` — two targeted text additions describing the batching behavior
- No changes to the superpowers `subagent-driven-development` skill (feature-flow provides the override via context injection)

**Excluded:**
- Changes to the superpowers plugin or other external skills
- Changes to the Python dispatcher, tests, or any non-skill file
- Batching `TaskCreate` calls (already batched at lifecycle initialization)
- Any runtime code changes — this is skill instruction text only

## Patterns & Constraints

### Error Handling
- No error handling needed — this is instruction text modification. The actual tool calls are made by the LLM; failure modes are the same as before the change.

### Types
- No types involved — skill instruction files are plain markdown.

### Performance
- Expected savings: ~10 fewer API calls per session (one per step transition where next step uses `in_progress`)
- Estimated cost reduction: 10–20% of parent orchestrator cost per session
- No regressions: batching parallel tool calls is a standard Claude Code pattern

### Stack-Specific
- Follow the existing instruction style in `skills/start/SKILL.md`: bold labels, inline code for tool names, nested bullet structure
- Match the YOLO Execution Continuity note style (those notes also cite parallel tool calls as the mechanism)
- No new sections required — the additions are sentences/bullets within existing sections

## Migration Requirements

None — skill instruction files require no migration.
