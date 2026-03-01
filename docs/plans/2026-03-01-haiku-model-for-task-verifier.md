# Haiku Model for Task Verifier — Design Document

**Date:** 2026-03-01
**Status:** Draft
**Issue:** #108

## Overview

The `verify-acceptance-criteria` skill dispatches a `feature-flow:task-verifier` subagent via the Task tool, but currently omits the `model` parameter, causing the agent to inherit the parent model (Sonnet or Opus). Since acceptance criteria verification is checklist-style mechanical work — file existence checks, grep patterns, command output validation — it does not require advanced reasoning. This change adds `model: "haiku"` to the Task dispatch, reducing verification cost by ~60% with no quality impact.

## User Flow

### Step 1 — Developer invokes verify-acceptance-criteria
The developer runs the skill (or it is invoked by the start lifecycle after implementation).

### Step 2 — Skill dispatches task-verifier with haiku model
The skill uses the Task tool with `subagent_type: "feature-flow:task-verifier"` and `model: "haiku"` explicitly set.

### Step 3 — Task verifier runs on Haiku
The task-verifier agent reads files, runs grep patterns, and checks boolean conditions — all mechanical work well-suited to Haiku.

### Step 4 — Results returned
Verification report is returned and presented as before. No user-facing behavior change.

## Technical Design

### Change Location

**File:** `skills/verify-acceptance-criteria/SKILL.md`
**Section:** Step 3 — Delegate to Task Verifier (line 66)

### Current Behavior

```
Use the Task tool with `subagent_type: "feature-flow:task-verifier"` (see `../../references/tool-api.md` — Task Tool for correct parameter syntax) to launch the task-verifier agent with:
```

The `model` parameter is omitted, so the Task tool inherits the parent conversation model.

### New Behavior

```
Use the Task tool with `subagent_type: "feature-flow:task-verifier"` and `model: "haiku"` (see `../../references/tool-api.md` — Task Tool for correct parameter syntax) to launch the task-verifier agent with:
```

The Task tool now explicitly sets `model: "haiku"`.

### Rationale

From the Model Routing Defaults table in `skills/start/SKILL.md`:

> `"Explore"` → `haiku` — Read-only operations (Glob, Grep, Read, LS); no advanced reasoning needed

The task-verifier performs the same class of work: read files, run grep, check conditions. Haiku handles this equally well at ~60% lower cost.

**Evidence from session `d1bab02a`:** Verifier inherited Sonnet, consumed 54,216 tokens across 45 tool calls over 3m 25s. All 45 tool calls were mechanical reads and pattern matches — no reasoning required.

## Patterns & Constraints

### Error Handling
- No error handling changes required — this is a text edit to a skill instruction
- The Task tool's failure behavior is unchanged; only the model used changes

### Types
- No type changes — skill files are Markdown text

### Performance
- ~60% cost reduction on task-verifier output tokens per session
- Haiku is faster than Sonnet/Opus, so verification latency may decrease

### Stack-Specific
- Skill files use Markdown with frontmatter; change is a string substitution in a text file
- No code compilation or type checking applies

## Scope

**Included:**
- Add `model: "haiku"` to the Task dispatch instruction in `skills/verify-acceptance-criteria/SKILL.md`

**Excluded:**
- `verify-plan-criteria` skill — separate concern, not in scope for issue #108
- `task-verifier` agent frontmatter — agent already specifies `model: sonnet` as its own default; the dispatch override takes precedence and is the correct fix location
- Any other skills that may dispatch task-verifier

## Expected Impact

| Metric | Current | After | Savings |
|--------|---------|-------|---------|
| Model used | Inherited (Sonnet/Opus) | Haiku (explicit) | ~60% token cost |
| Verification latency | ~3m 25s (session d1bab02a) | Faster (Haiku speed) | Improved |
| Quality | Mechanical checks | Mechanical checks | No change |
