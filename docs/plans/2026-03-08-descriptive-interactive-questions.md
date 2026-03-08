# Descriptive Interactive Questions — Design Document

**Date:** 2026-03-08
**Status:** Draft

## Overview

All `AskUserQuestion` calls in feature-flow skills should be descriptive, include a recommendation where one exists, and (where helpful) include examples. Currently 12 calls across 9 files are missing descriptions on options or a recommendation marker. This change adds descriptions and recommendation markers to each one, improving user experience in interactive mode.

## Scope

**Included:**
- Add `description` fields to options that currently have none
- Add recommendation markers (`*Recommended — [reasoning]*`) to the description of the recommended option
- Add examples inline in descriptions where the label alone is ambiguous
- Affected files: `session-report/SKILL.md`, `spike/SKILL.md`, `design-verification/SKILL.md`, `create-issue/SKILL.md`, `start/references/project-context.md`, `start/references/step-lists.md`, `start/references/orchestration-overrides.md`, `start/references/inline-steps.md`, `verify-plan-criteria/SKILL.md`

**Excluded:**
- Dynamic per-design clarification questions inside `design-document/SKILL.md` (content is context-dependent and cannot be pre-specified)
- Questions that already have both descriptions and a recommendation marker (no changes needed)
- Adding previews (not needed — no visual comparisons required)

## Changes Per File

### session-report/SKILL.md — Session file selection

**Before:** Options `"Let me provide a path"` and `"Find the latest in docs/plans/"` — no descriptions, no recommendation.

**After:**
- `"Find the latest in docs/plans/"` — description: `"*Recommended — scans docs/plans/ and opens the most recently modified session file automatically*"`
- `"Let me provide a path"` — description: `"Enter an absolute or relative path to any session report file"`

---

### session-report/SKILL.md — Next steps after analysis

**Before:** Options `"Create GitHub issues for actionable findings"`, `"Dig deeper into a specific area"`, `"Compare with another session"`, `"Done for now"` — no descriptions.

**After:** Add descriptions to all four options; no forced recommendation (pure user preference).
- `"Create GitHub issues for actionable findings"` — `"Open a GitHub issue for each high-priority finding flagged in the report"`
- `"Dig deeper into a specific area"` — `"Re-run analysis focused on one section (e.g., token usage, tool calls, errors)"`
- `"Compare with another session"` — `"Load a second session report and diff the two side by side"`
- `"Done for now"` — `"Exit the session report skill — you can re-run it any time"`

---

### spike/SKILL.md — Gotcha addition

**Before:** Options `"Add"` and `"Skip"` — no descriptions, no recommendation.

**After:**
- `"Add"` — description: `"*Recommended — saves the finding to .feature-flow.yml so future sessions are warned automatically*"`
- `"Skip"` — description: `"Discard — the gotcha will not be persisted and may be rediscovered in a future session"`

---

### design-verification/SKILL.md — Gotcha addition

**Before:** Options `"Add all"`, `"Let me pick"`, `"Skip"` — no descriptions, no recommendation.

**After:**
- `"Add all"` — description: `"*Recommended — adds every finding to .feature-flow.yml as a project-wide warning for future sessions*"`
- `"Let me pick"` — description: `"Choose which findings to persist — you'll be prompted one at a time"`
- `"Skip"` — description: `"Discard all findings — none will be saved to .feature-flow.yml"`

---

### create-issue/SKILL.md — Issue update confirmation

**Before:** Options `"Update as-is"`, `"Let me edit first"`, `"Cancel"` — no descriptions, no recommendation.

**After:**
- `"Update as-is"` — description: `"*Recommended — applies the drafted title, body, and labels to the existing issue immediately*"`
- `"Let me edit first"` — description: `"Provide corrections in freeform text — the draft will be revised before updating"`
- `"Cancel"` — description: `"Abort — the issue will not be modified"`

---

### create-issue/SKILL.md — Issue creation confirmation

**Before:** Options `"Create as-is"`, `"Let me edit first"`, `"Cancel"` — no descriptions, no recommendation.

**After:**
- `"Create as-is"` — description: `"*Recommended — creates the issue on GitHub with the drafted title, body, and labels*"`
- `"Let me edit first"` — description: `"Provide corrections in freeform text — the draft will be revised before creating"`
- `"Cancel"` — description: `"Abort — no issue will be created"`

---

### start/references/project-context.md — Platform/stack detection

**Before:** Options `"Looks correct"` and `"Let me adjust"` — no descriptions, no recommendation.

**After:**
- `"Looks correct"` — description: `"*Recommended — saves the detected platform and stack to .feature-flow.yml and continues*"`
- `"Let me adjust"` — description: `"Correct the platform or stack before saving — you'll provide the changes in freeform text"`

---

### start/references/project-context.md — Notification preference

**Before:** `"No notifications"` described as `"(Default) No sound or banner — you check the terminal manually"`.

**After:** Change `"(Default)"` to `"*Recommended —"` for consistency:
- `"No notifications"` — description: `"*Recommended — no sound or banner; check the terminal manually when ready*"`

(Terminal bell and Desktop notification descriptions are already adequate — no change needed.)

---

### start/references/step-lists.md — Install missing plugins

**Before:** `"Skip — continue without installing"` has no recommendation marker.

**After:**
- `"Skip — continue without installing"` — description: `"*Recommended if unsure — proceed with currently installed plugins; you can add more later*"`

(Note: "Install all and restart" and "Let me pick" already have adequate descriptions.)

---

### start/references/orchestration-overrides.md — Express design approval

**Before:** Options `"Continue"` and `"Let me adjust"` — no descriptions.

**After:**
- `"Continue"` — description: `"Approve the design and resume Express mode — implementation will begin immediately"`
- `"Let me adjust"` — description: `"Provide corrections in freeform text — the document will be updated, then Express resumes"`

(No forced recommendation — this is a user-review checkpoint, not a preference question.)

---

### start/references/inline-steps.md — CHANGELOG approval

**Before:** Options `"Looks good — write it"`, `"Let me edit"`, `"Skip CHANGELOG"` — no recommendation marker.

**After:**
- `"Looks good — write it"` — description: `"*Recommended — writes the entry to CHANGELOG.md under the appropriate version heading*"`
- `"Let me edit"` — description: `"Provide corrections in freeform text — the entry will be revised before writing"`
- `"Skip CHANGELOG"` — description: `"Omit the entry — note: missing CHANGELOG entries complicate release note generation"`

---

### verify-plan-criteria/SKILL.md — Criteria approval

**Before:** Options `"Accept all as-is"`, `"Let me edit them"`, `"Skip drafting"` — no recommendation marker.

**After:**
- `"Accept all as-is"` — description: `"*Recommended — applies all drafted criteria to their tasks; implementation can begin immediately*"`
- `"Let me edit them"` — description: `"Provide corrections in freeform text — criteria will be revised and re-presented before applying"`
- `"Skip drafting"` — description: `"Proceed without adding criteria — affected tasks will be harder to verify at completion"`

## Patterns & Constraints

### Consistency
- Recommendation marker format: `*Recommended — [1-sentence reasoning]*` — matches the existing pattern in `start/SKILL.md`
- Descriptions are kept to 1 line each; long explanations go in the question text, not the option description
- All description strings are plain text with no nested markdown except for the `*Recommended*` italic marker

### Error Handling
- No runtime behavior changes — these are documentation-only edits to skill markdown files
- No breaking changes; descriptions are additive fields

### Scope
- No changes to option labels (changing labels could break existing YOLO auto-selection logic that pattern-matches on label text)
- No changes to question text (the question itself drives YOLO/Express auto-selection behavior)
