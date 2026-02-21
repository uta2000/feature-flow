# `/compact` Checkpoint Prompts at Lifecycle Breakpoints — Design Document

**Date:** 2026-02-21
**Status:** Draft
**Issue:** #33

## Overview

Long-running feature lifecycles consume the context window. By the time implementation starts, early brainstorming and design decisions compete for space. `/compact` is a client-side Claude Code command that frees context, but users don't know when to run it. This feature adds automatic prompts at three natural phase transitions suggesting `/compact` with context-appropriate focus hints, and introduces a third YOLO mode ("YOLO with compaction prompts") that auto-selects all decisions but still pauses at checkpoints.

## Example

**After design verification completes:**
```
--- Context Checkpoint ---
Design phase complete. Consider running:
/compact focus on the approved design and implementation plan
Or type "continue" to skip compaction and proceed.
```

**User options:**
1. Run `/compact focus on the approved design and implementation plan` → context freed with key decisions preserved → type anything to resume
2. Type `continue` → skip compaction, proceed immediately

**Three YOLO modes in Step 1 prompt:**
```
This looks like a **feature** (17 steps).
Found issue #42: "Add CSV export" — detailed requirements.

Run mode?
→ YOLO — auto-select recommended options, no compaction prompts
→ YOLO with compaction prompts — auto-select all decisions, pause at phase transitions
→ Interactive — all questions asked normally
```

## User Flow

### Step 1 — User starts a feature

Lifecycle proceeds through brainstorming, documentation lookup as normal.

### Step 2 — Breakpoint reached

After a phase-completing step finishes, the lifecycle outputs a formatted checkpoint prompt suggesting `/compact` with a context-appropriate focus hint. The lifecycle pauses — the user must respond before the next step begins.

### Step 3 — User decides

Two options:
- Run `/compact` with the suggested focus hint (recommended for long lifecycles), then say anything to resume
- Type **"continue"** (or "skip", "next", "proceed") to skip compaction and proceed immediately

### Step 4 — Lifecycle continues

Next skill invocation proceeds normally. If the user ran `/compact`, the conversation context is smaller but key decisions are preserved via the focus hint.

## Checkpoint Locations

Three breakpoints at the natural phase transitions: **exploration → design → implementation**.

| # | After Step | Before Step | Focus Hint | Scopes |
|---|-----------|-------------|------------|--------|
| 1 | Documentation lookup | Design Document | `focus on brainstorming decisions and documentation patterns` | Feature, Major feature |
| 2 | Design Verification (or Design Document for small enhancements which skip verification) | Create Issue + Implementation Plan | `focus on the approved design and implementation plan` | Small enhancement, Feature, Major feature |
| 3 | Commit Planning Artifacts | Worktree Setup + Implementation | `focus on the implementation plan and acceptance criteria` | Small enhancement, Feature, Major feature |

**Scope-based filtering:**
- **Quick fix:** No checkpoints (too few steps, lifecycle is short)
- **Small enhancement:** Checkpoints 2 and 3 only (no doc lookup phase to checkpoint after)
- **Feature:** All 3 checkpoints
- **Major feature:** All 3 checkpoints

## Three-Mode YOLO System

The mode selection in Step 1 gains a third option:

| Mode | Auto-select decisions? | Show compaction prompts? |
|------|----------------------|-------------------------|
| YOLO | Yes | No |
| YOLO with compaction prompts | Yes | Yes |
| Interactive | No | Yes |

### Trigger Phrase Support

New trigger phrases added to Step 0 detection:
- `--yolo-compact` (flag style — match as standalone token)
- `yolo compact mode` (natural language phrase)

These activate YOLO mode with the `compact_prompts` flag set to true.

### YOLO Propagation

When "YOLO with compaction prompts" is active, the propagation string becomes:
```
yolo: true. compact_prompts: true. scope: [scope].
```

Skills receive the `compact_prompts` flag but do not act on it — checkpoints are centralized in the orchestrator between skill invocations.

### Option Ordering in Step 1

The three options are ordered based on the existing recommendation logic. The new option slots between YOLO and Interactive:

**YOLO recommended:**
1. YOLO — auto-select recommended options *(Recommended)*
2. YOLO with compaction prompts — auto-select decisions, pause at phase transitions
3. Interactive — all questions asked normally

**Interactive recommended:**
1. Interactive — all questions asked normally *(Recommended)*
2. YOLO with compaction prompts — auto-select decisions, pause at phase transitions
3. YOLO — auto-select recommended options

**Neutral:**
1. Interactive — all questions asked normally
2. YOLO with compaction prompts — auto-select decisions, pause at phase transitions
3. YOLO — auto-select recommended options

## Changes to `skills/start-feature/SKILL.md`

All changes are confined to this single file.

### 1. Step 0 — YOLO Trigger Phrase Detection

Add `--yolo-compact` and `yolo compact mode` to the trigger phrase list. When detected:
- Set YOLO mode active AND set `compact_prompts` flag
- Announce: "YOLO mode active (with compaction prompts). Auto-selecting recommended options. Decision log will be printed at completion."
- Strip the trigger phrase from arguments

### 2. Step 1 — Combined Scope + Mode Prompt

Add "YOLO with compaction prompts" as a third option in all three ordering variants (YOLO recommended, Interactive recommended, Neutral). Description: "Auto-select all decisions, but pause at phase transitions for optional `/compact`".

### 3. New Section — Context Window Checkpoints

Add a new section after "Graduated YOLO Behavior" defining the checkpoint format, suppression rules, and insertion points.

**Checkpoint format:**
```
--- Context Checkpoint ---
[Phase name] complete. Consider running:
/compact focus on [context-specific focus hint]
Or type "continue" to skip compaction and proceed.
```

**Suppression rules:**
- YOLO mode (no compaction): checkpoints are suppressed
- YOLO with compaction prompts: checkpoints are shown
- Interactive mode: checkpoints are shown
- Quick fix scope: no checkpoints regardless of mode

**Insertion points in Step 3 execution:**
After marking certain steps complete (before announcing the next step), output the checkpoint block and wait for the user to respond.

### 4. Step 3 — Checkpoint Triggers

Insert checkpoint logic at three points in the step execution flow:
1. After "Documentation lookup" completes → Checkpoint 1
2. After "Design verification" completes (or after "Design document" for small enhancements) → Checkpoint 2
3. After "Commit planning artifacts" completes → Checkpoint 3

### 5. YOLO Decision Log Updates

Add a third decision log variant for "YOLO with compaction prompts" mode:

```
## YOLO Decision Log

**Mode:** YOLO with compaction prompts ([scope] scope)
**Compaction checkpoints:** N shown, M compacted, K skipped

| # | Skill | Decision | Auto-Selected |
|---|-------|----------|---------------|
| ... | ... | ... | ... |
| N | start-feature | Compact checkpoint 1 | /compact (or skipped) |
| N | start-feature | Compact checkpoint 2 | /compact (or skipped) |
| N | start-feature | Compact checkpoint 3 | /compact (or skipped) |
```

### 6. Post-Compact Resume Behavior

After the user runs `/compact` at a checkpoint, the conversation context is compressed. When the user's next message arrives, the lifecycle checks the todo list to determine the current step and announces: "Resuming lifecycle. Last completed step: [N]. Next: [N+1] — [name]." This re-orients the compressed context.

### 7. YOLO Propagation String

Update the YOLO propagation documentation to include the `compact_prompts: true` variant.

## Scope

**Included:**
- Checkpoint prompt format and 3 insertion points
- "YOLO with compaction prompts" as third mode option
- `--yolo-compact` and `yolo compact mode` trigger phrases
- Scope-based checkpoint filtering
- YOLO decision log updates for compact mode
- Updated YOLO propagation string

**Excluded:**
- Programmatic invocation of `/compact` (impossible — client-side command)
- Changes to any skill files other than `start-feature/SKILL.md`
- Automatic context window size detection or adaptive checkpoint timing
- Checkpoints inside individual skills (design-document, design-verification, etc.)
