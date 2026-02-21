# Scope-Aware YOLO Mode with Smart Recommendations — Design Document

**Date:** 2026-02-20
**Status:** Draft
**Issue:** #23

## Overview

The current YOLO mode prompt appears at Step 0 of `start-feature`, before the system knows the scope or issue context. It presents a neutral "pick one" question. This feature moves the prompt after scope classification + issue detection, adds a 3-signal recommendation engine, combines scope confirmation and mode selection into a single `AskUserQuestion`, introduces graduated YOLO behavior (checkpoints scale with scope complexity), and enhances the decision log with recommendation reasoning and checkpoint outcomes.

## Example

**Current behavior — neutral prompt before scope:**
```
Step 0: "Run in interactive or YOLO mode?" → [neutral, no recommendation]
Step 0: "Detected platform: web. Correct?" → [separate prompt]
Step 1: "This looks like a feature. Correct?" → [separate prompt]
```

**New behavior — smart recommendation after scope:**
```
Step 0: --yolo trigger detection only (no prompt unless triggered)
Step 0: Platform/stack detection (always interactive, low-stakes)
Step 1: Issue reference detection + scope classification
  ↓
  Combined prompt:
  "This looks like a **feature** (16 steps).
   Found issue #42: 'Add CSV export' — detailed requirements with acceptance criteria.

   Run mode?
   → YOLO — auto-select recommended options (Recommended — issue #42 provides sufficient context)
   → Interactive — all questions asked normally"
```

**Graduated YOLO with checkpoint (Feature scope):**
```
[steps 1-7 auto-selected...]
YOLO checkpoint: Here's the design document. Continue or adjust?
→ Continue  [resumes YOLO]
→ Let me adjust  [apply changes, resume YOLO]
[steps 8-16 auto-selected...]
```

## User Flow

### Step 1 — Trigger phrase detection (unchanged)

Power users include `--yolo`, `yolo mode`, or `run unattended` in their command. When detected, full YOLO activates immediately — including auto-scope and auto-platform detection. No regression from current behavior.

### Step 2 — Platform/stack detection (always interactive)

Platform and stack detection runs as before. This is low-stakes and happens before scope is known.

### Step 3 — Scope classification + issue detection + smart recommendation

The system classifies scope, fetches any linked issue, and assesses context richness. It presents a **single** `AskUserQuestion` combining scope confirmation and mode recommendation.

The recommended option appears first with italicized reasoning. The recommendation is based on 3 signals:
1. **Scope complexity** — Quick fix/Small enhancement default to YOLO recommended; Feature/Major feature default to Interactive recommended
2. **Issue context richness** — A detailed issue (3+ of 4 signals) can flip Feature→YOLO or Major→neutral
3. **Inline context richness** — Detailed design decisions in the user's message are treated equivalently to a detailed issue

### Step 4 — Graduated execution

YOLO behavior adapts to scope:
- **Quick fix / Small enhancement:** Full autonomy. Zero interactive prompts. Current behavior unchanged.
- **Feature:** One mandatory checkpoint — design document approval before implementation.
- **Major feature:** Two mandatory checkpoints — brainstorming output summary + design document approval.

### Step 5 — Completion with enhanced log

Decision log includes recommendation reasoning (which signals triggered it) and checkpoint outcomes (user approved, adjusted, or overrode).

## Architecture

### Recommendation Engine

Three signals combine to produce a recommendation:

```
Signal 1: Scope complexity (default recommendation)
  Quick fix → YOLO
  Small enhancement → YOLO
  Feature → Interactive
  Major feature → Interactive

Signal 2: Issue richness (can override Signal 1)
  Assessed when a GitHub issue is linked. Score = count of:
    - Has acceptance criteria or clear requirements sections
    - Has resolved discussion in comments
    - Has concrete examples, mockups, or specifications
    - Body > 200 words with structured content

  If score >= 3:
    Feature + detailed issue → YOLO (override)
    Major feature + detailed issue → Neutral (no recommendation)

Signal 3: Inline context richness
  If user's message contains detailed design decisions (approach,
  UX flow, data model, specific behaviors), treat equivalently
  to a detailed issue for recommendation purposes.

Combined output:
  YOLO | Interactive | Neutral
```

### Combined Prompt Format

The prompt varies by recommendation:

**YOLO recommended (quick fix, small enhancement, or feature with detailed issue):**
```
AskUserQuestion options:
1. "YOLO — auto-select recommended options" + reasoning (first = recommended)
2. "Interactive — all questions asked normally"
```

**Interactive recommended (feature/major without detailed context):**
```
AskUserQuestion options:
1. "Interactive — all questions asked normally" + reasoning (first = recommended)
2. "YOLO — auto-select recommended options"
```

**Neutral (major feature with detailed issue):**
```
AskUserQuestion options:
1. "Interactive — all questions asked normally" (no recommendation marker)
2. "YOLO — auto-select recommended options" (no recommendation marker)
```

Each option includes the scope name and step count in the question text.

### Graduated YOLO Checkpoints

Checkpoints use `AskUserQuestion` with two options:

```
YOLO checkpoint: [artifact summary]. Continue or adjust?
→ Continue
→ Let me adjust
```

**Continue:** Resume YOLO mode for remaining steps.
**Let me adjust:** User provides adjustments. After applying, resume YOLO — do NOT switch to interactive for remaining steps.

| Scope | Checkpoints | Where |
|-------|------------|-------|
| Quick fix | 0 | — |
| Small enhancement | 0 | — |
| Feature | 1 | Design document approval (before implementation) |
| Major feature | 2 | Brainstorming output summary + Design document approval |

If scope is upgraded during the lifecycle (e.g., Small Enhancement → Feature), adopt the checkpoint rules of the new scope for all remaining steps.

### Decision Log Enhancement

**Full YOLO (quick fix / small enhancement):**
```markdown
## YOLO Decision Log

**Mode:** YOLO (system recommended — [scope] scope, low complexity)

| # | Skill | Decision | Auto-Selected |
|---|-------|----------|---------------|
| 1 | start-feature | Scope + mode | [scope], YOLO recommended |
| ... | ... | ... | ... |

**Total decisions auto-selected:** N
**Quality gates preserved:** hooks, tests, verification, code review
```

**Graduated YOLO (feature / major feature):**
```markdown
## YOLO Decision Log

**Mode:** YOLO with checkpoints (system recommended — [scope] scope, [reasoning])
**Checkpoints presented:** M

| # | Skill | Decision | Auto-Selected |
|---|-------|----------|---------------|
| ... | ... | ... | ... |
| N | design-document | Document approval | ✋ User reviewed (approved / adjusted) |
| ... | ... | ... | ... |

**Total decisions auto-selected:** N
**Checkpoints presented:** M of M approved [with/without changes]
```

## Changes to Existing Files

### `skills/start-feature/SKILL.md`

1. **Step 0 YOLO detection block:** Reduce to trigger phrase detection ONLY. Remove the `AskUserQuestion` startup prompt from Step 0. Keep `--yolo`/`yolo mode`/`run unattended` parsing and announcement.
2. **Step 1 scope classification:** Add issue richness scoring. Add inline context richness assessment. Combine scope confirmation + YOLO recommendation into single `AskUserQuestion`. Replace the separate scope confirmation prompt.
3. **YOLO propagation:** Update to include scope context in downstream skill args: `args: "yolo: true. scope: [scope]. [original args]"`. This is required for design-document's conditional checkpoint behavior.
4. **Brainstorming YOLO section:** Add major feature checkpoint — after brainstorming completes, present summary as YOLO checkpoint before proceeding.
5. **Step 5 completion:** Update decision log format to include recommendation reasoning, checkpoint outcomes, and graduated YOLO metadata.

### `skills/design-document/SKILL.md`

1. **Step 5 (Present for Review):** Add conditional checkpoint behavior. When YOLO is active AND scope is Feature or Major Feature, present the full document as a "YOLO checkpoint" with Continue/Adjust options instead of skipping approval entirely. When YOLO is active AND scope is Quick fix or Small enhancement, skip approval entirely (current behavior).

### Files NOT Modified

| File | Why Unchanged |
|------|---------------|
| `skills/design-verification/SKILL.md` | Gotcha prompt stays YOLO-able (low-stakes) |
| `skills/spike/SKILL.md` | Assumption + gotcha prompts stay YOLO-able (low-stakes) |
| `skills/create-issue/SKILL.md` | Create/update prompts stay YOLO-able (low-stakes) |
| `skills/verify-plan-criteria/SKILL.md` | Criteria approval stays YOLO-able (low-stakes) |

## Scope

**Included:**
- Move YOLO prompt from Step 0 to after Step 1 (scope + issue detection)
- 3-signal recommendation engine (scope, issue richness, inline richness)
- Combined scope + mode `AskUserQuestion` (one prompt instead of two)
- Graduated YOLO: full autonomy for QF/SE, 1 checkpoint for Feature, 2 for Major
- YOLO checkpoint UX (Continue / Let me adjust) that resumes YOLO after adjustment
- Enhanced decision log with recommendation reasoning + checkpoint outcomes
- `--yolo` trigger phrase backward compatibility (no regression)

**Excluded:**
- Changes to downstream skill YOLO behavior (design-verification, spike, create-issue, verify-plan-criteria — all unchanged)
- Persistent YOLO preferences in `.feature-flow.yml`
- Automatic scope-based YOLO without any prompt (always presents the combined prompt unless `--yolo` trigger used)
- Changes to quality gates, hooks, or verification steps
