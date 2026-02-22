# Reduce Planning Overhead for Small Features — Design Document

**Date:** 2026-02-22
**Status:** Draft
**Issue:** #59

## Overview

Small enhancements currently run a 17-step lifecycle regardless of whether the linked issue already contains all design decisions and acceptance criteria. Evidence from session `94ca8721` shows the planning phase consumed 5m41s (20% of session) for a well-scoped YOLO small enhancement. This change adds **fast-track logic** that detects rich issues and skips 3 redundant steps (brainstorming, design document, verify-plan-criteria), reducing the small enhancement pipeline to 14 steps.

## Example

### Before (17 steps, ~6 min planning)
```
start: issue #42  →  scope: small enhancement
  1. Brainstorm requirements        ← re-derives what issue already says
  2. Documentation lookup (Context7)
  3. Design document                ← duplicates issue's structured content
  4. Create issue                   ← issue already exists
  5. Implementation plan
  6. Verify plan criteria           ← issue already has criteria
  7. Commit planning artifacts
  ...17 total steps
```

### After (14 steps, ~3 min planning)
```
start: issue #42  →  scope: small enhancement (fast-track)
  1. Documentation lookup (Context7) ← kept: catches library gotchas
  2. Create issue                    ← updates existing issue (already linked)
  3. Implementation plan             ← kept: produces task work units
  4. Commit planning artifacts
  ...14 total steps
```

## User Flow

### Step 1 — System detects fast-track eligibility

After scope classification and issue richness scoring (both already exist), the system evaluates:
- Scope = small enhancement
- Issue richness score 3+ (has acceptance criteria, concrete examples, structured content >200 words) **OR** inline context provides equivalent detail

### Step 2 — System announces fast-track

**YOLO/Express mode:** `"YOLO: start — Small enhancement fast-track → Activated (issue #N richness: 3/4). Skipping: brainstorming, design document, verify-plan-criteria."`

**Interactive mode:** `"Issue #N has detailed requirements (richness: 3/4). Fast-tracking: skipping brainstorming, design document, and verify-plan-criteria. The issue content serves as the design."`

### Step 3 — Optimized step list executes

The 14-step list runs normally from documentation lookup onward.

## Architecture

### Fast-Track Detection Logic

Add a decision point between existing issue richness scoring (`SKILL.md:167-179`) and step list building (`SKILL.md:257-276`):

```
IF scope == "small enhancement"
  AND (issue_richness >= 3 OR inline_context_is_detailed)
THEN
  use fast-track step list (14 steps)
  announce activation
ELSE
  use standard step list (17 steps)
```

When `issue_richness < 3` and inline context is not detailed, the standard 17-step small enhancement list is used — no fast-track behavior applies.

This logic is implemented as prose instructions in the start skill's markdown, not as JavaScript code — consistent with the project's architecture where all orchestration logic is LLM-interpreted markdown.

### Fast-Track Step List

```
- [ ] 1. Documentation lookup (Context7)
- [ ] 2. Create issue
- [ ] 3. Implementation plan
- [ ] 4. Commit planning artifacts
- [ ] 5. Worktree setup
- [ ] 6. Copy env files
- [ ] 7. Study existing patterns
- [ ] 8. Implement (TDD)
- [ ] 9. Self-review
- [ ] 10. Code review
- [ ] 11. Generate CHANGELOG entry
- [ ] 12. Final verification
- [ ] 13. Commit and PR
- [ ] 14. Comment and close issue
```

Step naming uses "Create issue" (consistent with the skill mapping table). When an issue is already linked via fast-track detection, the create-issue skill's `existing_issue` flag triggers update behavior automatically. When fast-track activates via inline context richness without a linked issue, this step creates a new issue normally.

### Why Each Skipped Step Is Safe to Skip

| Step | Why safe to skip |
|------|-----------------|
| Brainstorming | Issue body contains the design decisions; re-deriving them is pure duplication |
| Design document | Issue IS the design document; no separate artifact needed |
| Verify plan criteria | Issue already has human-authored acceptance criteria; the implementation plan inherits them |

### Why Each Kept Step Must Stay

| Step | Why it must stay |
|------|-----------------|
| Documentation lookup | Catches library-specific gotchas that no issue can predict (e.g., deprecated APIs) |
| Implementation plan | Produces task-level work units with file references — needed for subagent dispatch |
| Study existing patterns | Prevents "vibing" — ensures new code follows codebase conventions |
| Code review pipeline | Catches bugs and quality issues regardless of scope |

### Scope Upgrade from Fast-Track

If the implementation plan step (or documentation lookup) reveals that a fast-tracked small enhancement is actually a feature, upgrade the scope and insert the missing steps:

1. Announce: "Adjusting scope from small enhancement (fast-track) to feature. Adding: brainstorming, design document, design verification, verify-plan-criteria."
2. Insert the missing steps into the todo list before the current step
3. Resume the lifecycle from the newly inserted brainstorming step

This is consistent with the existing Scope Adjustment Rules section, which says "upgrade from small enhancement to feature and add missing steps." The only difference is that fast-track has fewer steps to add back since some were already skipped.

### Edge Cases

**No issue linked, but inline context is detailed:** Fast-track activates via inline context richness. The "Create issue" step (step 2) creates a new issue from the inline context — this is standard create-issue skill behavior.

**Issue richness exactly 2:** Does not qualify for fast-track. Standard 17-step pipeline used. The boundary is strict: 3+ signals required.

**Issue richness 3+ but missing acceptance criteria specifically:** Fast-track still activates (overall richness is sufficient), but verify-plan-criteria is still skipped. The implementation plan step will derive criteria from the issue's other structured content. This is acceptable because the implementation plan always produces acceptance criteria regardless.

### Hook Interaction

The `hooks.json` PostToolUse hook unconditionally emits "Run verify-plan-criteria" after any plan file is written. In fast-track mode, this message still appears but should be ignored — verify-plan-criteria is intentionally skipped. The fast-track announcement message covers this: the user sees the skip announcement before the hook fires. No hook code change is needed — the hook is advisory, not blocking.

### Context Checkpoint Adjustments

Small enhancement fast-track uses the same checkpoint rules as regular small enhancement (checkpoints 2 and 3 only). However, checkpoint 2's trigger point changes:

| Checkpoint | Regular small enhancement | Fast-track small enhancement |
|------------|--------------------------|------------------------------|
| 2 | After design document | After documentation lookup |
| 3 | After commit planning artifacts | After commit planning artifacts (unchanged) |

### Mode Interaction

The fast-track applies identically across all three modes:

| Mode | Behavior |
|------|----------|
| YOLO | Steps silently skipped, announced inline |
| Express | Steps silently skipped, announced inline; checkpoints still shown |
| Interactive | Brief confirmation shown before skipping; checkpoints still shown |

## Changes to Existing Files

### 1. Modify: `skills/start/SKILL.md`

**Location: After issue richness scoring (~line 175), before step list building (~line 242)**

Add a "Fast-Track Detection" subsection that evaluates the richness score against the scope and sets a `fast_track` flag for the step list builder.

**Location: Step 2 step list building (~line 257)**

Add the fast-track step list as a variant under "Small enhancement". Use the same format as existing step lists (bold header directly followed by code fence, no intervening prose). The conditional logic goes above both step lists as prose, not inside the header:

```markdown
If the small enhancement qualifies for fast-track (issue richness 3+ or equivalent inline detail), use the fast-track step list. Otherwise, use the standard step list.

**Small enhancement:**
[existing 17-step list unchanged]

**Small enhancement (fast-track):**
[14-step list]
```

**Location: Step 3 execution section (~line 337)**

No changes needed — the execution logic already follows the dynamic step list from TaskCreate.

**Location: Context window checkpoints section (~line 429)**

Update checkpoint 2's "After Step" column to include the fast-track variant. The current text reads: `Design Verification (or Design Document for small enhancements which skip verification)`. Replace with: `Design Verification (or Design Document for small enhancements, or Documentation Lookup for fast-track small enhancements)`.

**Location: Completion section (~line 1078)**

Update decision log to include fast-track activation as a logged decision.

### 2. Modify: `skills/start/references/scope-guide.md`

**Location: Small Enhancement section (~line 26)**

Add a "Fast-Track Conditions" subsection documenting when the optimized lifecycle activates, with the 14-step lifecycle and expected time savings.

## Scope

**Included:**
- Fast-track detection logic in start skill
- Optimized 14-step list for small enhancements with rich issues
- Updated scope-guide.md documentation
- Context checkpoint 2 adjustment for fast-track path
- Decision log entry for fast-track activation
- Interactive mode confirmation message

**Excluded:**
- Changes to other scope types (quick fix, feature, major feature)
- Changes to small enhancements WITHOUT rich issues (standard 17-step pipeline preserved)
- New `--quick` trigger phrase (YAGNI — the auto-detection is sufficient)
- Changes to any JavaScript hook files
- Optimizing study-existing-patterns or self-review steps for small file counts (separate concern, separate issue)
