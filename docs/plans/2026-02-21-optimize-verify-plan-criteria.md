# Optimize verify-plan-criteria Skill — Design Document

**Date:** 2026-02-21
**Status:** Draft
**Issue:** #43

## Overview

The `verify-plan-criteria` skill has three latency-sensitive design issues that add unnecessary user round-trips. The most common path (invoked from `start-feature` where the plan path is known, and all tasks already have criteria) should be zero-friction. This design addresses all three problems identified in issue #43 with targeted edits to `skills/verify-plan-criteria/SKILL.md`.

## User Flow

### Current Flow (worst case: 5 tasks missing criteria)
1. Skill asks "Checking plan: `[path]`. Is this correct?" — **1 round-trip** (even when path is known)
2. Skill checks each task for criteria
3. For each missing task, presents drafted criteria individually — **5 round-trips**
4. Total: **6 user interactions** for a single verification step

### Optimized Flow (same scenario)
1. Skill detects path is already in context — **0 round-trips**
2. Skill checks each task for criteria
3. All 5 missing tasks presented in a single batched prompt — **1 round-trip**
4. Total: **1 user interaction**

### Optimized Flow (all criteria exist)
1. Skill detects path is already in context — **0 round-trips**
2. Skill checks each task — all have criteria, none are vague
3. Fast-path: skip directly to report — **0 round-trips**
4. Total: **0 user interactions**

## Changes to `skills/verify-plan-criteria/SKILL.md`

### Change 1: Conditional Plan Path Confirmation (Step 1)

**Current behavior (line 35):**
> Pick the most recent file. Confirm with the user: "Checking plan: `[path]`. Is this correct?"

**New behavior:**
- If the user specified a path, use it directly (unchanged)
- If Glob returns exactly 1 candidate, use it directly without confirmation
- If Glob returns multiple candidates, present the most recent one and confirm with the user
- Announce the selected path in all cases: "Checking plan: `[path]`"

**Rationale:** When invoked from `start-feature`, the plan was just written — there's only one candidate. The confirmation prompt adds a round-trip for zero value.

### Change 2: Fast-Path Gate After Step 3

**Current behavior:** Step 3 checks each task, then always flows into Step 4 (draft missing criteria) and Step 5 (apply criteria). Smart models short-circuit naturally, but the instructions don't make this explicit.

**New behavior:** Add an explicit gate between Step 3 and Step 4:

> If ALL tasks already have criteria and none are flagged as vague, skip directly to Step 6 (Report). Do not execute Steps 4 or 5.

**Rationale:** Makes the common case (all criteria exist) deterministic for all model tiers. Ensures cheaper models also short-circuit correctly instead of wasting turns.

### Change 3: Batched Criteria Approval (Step 4)

**Current behavior (lines 84-98):** Presents drafted criteria per-task with individual `AskUserQuestion` calls. Each task gets its own confirmation prompt.

**New behavior:** Collect all tasks with missing criteria, draft criteria for all of them, then present them in a single grouped message with one `AskUserQuestion`:

```
The following tasks are missing acceptance criteria. Here are the suggested criteria:

**Task 3: "Add allergen badge"**
- [ ] `src/components/AllergenBadge.tsx` exists
- [ ] Component exports `AllergenBadge` as named export
- [ ] `npm run typecheck` passes

**Task 5: "Update menu display"**
- [ ] Changes exist in `src/pages/menu.tsx`
- [ ] `npm run lint` passes

Accept all, edit, or skip?
```

Options: "Accept all as-is", "Let me edit them", "Skip drafting"

**YOLO override update:** The existing YOLO block (line 100) auto-accepts per-task. Update it to auto-accept the single batched prompt instead. Same announcement format: `YOLO: verify-plan-criteria — Approve criteria → Accept as-is ([N] tasks)`

## Scope

**Included:**
- Step 1 conditional confirmation logic
- Step 3→4 fast-path gate
- Step 4 batched approval restructure
- YOLO override update for Step 4

**Excluded:**
- No changes to Step 2 (task parsing), Step 5 (applying criteria), or Step 6 (reporting)
- No changes to quality rules or criteria drafting logic
- No changes to how `start-feature` invokes this skill
- No new CRITICAL OVERRIDE needed (skill is first-party and already YOLO-aware)
