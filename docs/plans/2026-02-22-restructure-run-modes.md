# Restructure Run Modes: YOLO / Express / Interactive — Design Document

**Date:** 2026-02-22
**Status:** Draft
**Issue:** #61

## Overview

The current mode system has three confusingly similar options: YOLO (which still pauses via "graduated checkpoints"), YOLO with compaction (which adds `/compact` pauses on top), and Interactive. Users running `--yolo` are surprised when the process stops. This change replaces the three modes with clearly differentiated options: **YOLO** (truly unattended), **Express** (auto-selects but has strategic pause points), and **Interactive** (full interview with pause points).

## User Flow

### Step 1 — User launches lifecycle
User types `start: add auth --yolo`, `start: add auth --express`, or `start: add auth` (interactive default).

### Step 2 — System recommends a mode
If no trigger phrase, the system classifies scope and recommends a mode in plain English with reasoning, sorted most-to-least recommended. A footnote explains `/compact` behavior for Express and Interactive.

### Step 3 — Lifecycle executes in chosen mode
- **YOLO:** Zero pauses, all scopes. No graduated checkpoints, no `/compact` suggestions.
- **Express:** Auto-selects all decisions. Pauses at design approval (Feature/Major Feature) and at phase transitions for optional `/compact`.
- **Interactive:** Interviews user at every decision point. Pauses at phase transitions for optional `/compact`.

## Changes

### 1. Trigger Phrase Updates (Step 0)

| Current | New |
|---------|-----|
| `--yolo`, `yolo mode`, `run unattended` | Unchanged → YOLO |
| `--yolo-compact`, `yolo compact mode` | `--express`, `express mode` → Express |

Remove `compact_prompts` flag. Replace with mode tracking: `yolo` / `express` / `interactive`.

### 2. Mode Selection Prompt (Step 1)

Replace current option text with plain English descriptions. Three ordering variants based on recommendation:

**YOLO recommended** (quick fix, small enhancement, feature with detailed context):
1. **YOLO** (Recommended) — "Fully unattended, no pauses."
2. **Express** — "I'll auto-select decisions but pause for design approval and at phase transitions to optionally compact the conversation."
3. **Interactive** — "I'll interview you to address outstanding design questions, with pauses at phase transitions to optionally compact the conversation."

**Interactive recommended** (feature/major without detailed context):
1. **Interactive** (Recommended)
2. **Express**
3. **YOLO**

**Neutral** (major feature with detailed context):
1. **Interactive** (no marker)
2. **Express** (no marker)
3. **YOLO** (no marker)

Footnote after options: *"For Express and Interactive: at each pause you can run `/compact` then type 'continue' to resume, or just type 'continue' to skip compaction."*

### 3. Remove Graduated YOLO Behavior

Delete the entire "Graduated YOLO Behavior" section (lines ~441-464) and the "Graduated YOLO checkpoint (Major Feature only)" block in the brainstorming section (lines ~420-439). YOLO = zero pauses for all scopes, no exceptions.

### 4. Restructure Context Window Checkpoints

Merge the graduated checkpoint (design approval) into the checkpoint system under Express mode. Unified suppression rules:

| Mode | Context window checkpoints | Design approval checkpoint |
|------|---------------------------|---------------------------|
| YOLO | Suppressed | Suppressed |
| Express | Shown (scope-filtered) | Shown (Feature/Major Feature) |
| Interactive | Shown (scope-filtered) | N/A (decisions asked inline) |

Checkpoint locations unchanged. Scope-based filtering unchanged.

### 5. Update Propagation

| Mode | Propagation format |
|------|-------------------|
| YOLO | `yolo: true. scope: [scope].` (unchanged) |
| Express | `express: true. scope: [scope].` |
| Interactive | No prefix needed (default) |

Express inherits all YOLO auto-selection overrides for skill invocations (brainstorming self-answers, writing-plans auto-select, worktree auto-select, finishing-branch auto-select).

### 6. Update design-document Skill

The design-document skill currently has graduated YOLO checkpoint logic. Update to:
- `yolo: true` → Skip approval for all scopes (no graduated behavior)
- `express: true` → Show approval checkpoint for Feature/Major Feature scope
- Neither → Interactive behavior (section-by-section confirmation)

### 7. Update Announcement Messages

- **YOLO:** "YOLO mode active. Auto-selecting all decisions, no pauses. Decision log will be printed at completion."
- **Express:** "Express mode active. Auto-selecting decisions but pausing for design approval and at phase transitions for optional `/compact`. Decision log will be printed at completion."

### 8. Update Decision Log Formats

Replace three formats with two:

**YOLO (all scopes):**
```
**Mode:** YOLO ([scope] scope)
```
No checkpoint rows. Single unified format regardless of scope.

**Express (all scopes):**
```
**Mode:** Express ([scope] scope)
**Checkpoints:** N presented (M design approval, K compaction)
```
Includes both design approval and compaction checkpoint rows.

Interactive mode produces no decision log (all decisions were interactive).

### 9. Update References

Files with occurrences to update:
- `skills/start/SKILL.md` — primary changes
- `CHANGELOG.md` — document the restructuring (new entry, not modifying old entries)

Historical plan docs (`docs/plans/2026-02-2*`) are read-only references and are not modified.

## Scope

**Included:**
- All mode naming, trigger detection, and propagation changes in `skills/start/SKILL.md`
- Design-document skill checkpoint behavior update (in the published plugin cache — but since we modify the source, the skill file in `skills/design-document/SKILL.md`)
- CHANGELOG entry for the restructuring
- Decision log format updates

**Excluded:**
- No changes to other skills (brainstorming, writing-plans, etc. — they receive flags but don't act on them)
- No changes to hooks
- No changes to historical plan documents
- No changes to references or platform docs
