# Reduce False Behavioral Conflict Escalation — Implementation Plan

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: Add structure-aware conflict classification logic — STATUS: pending
Task 2: Add reclassified examples — STATUS: pending
CURRENT: none
-->

> **For Claude:** Read only the PROGRESS INDEX to determine current task.
> Then read the full section for that specific task only.
> Tool parameter types: Edit `replace_all`: boolean (`true`/`false`), NOT string. Read `offset`/`limit`: number, NOT string.

## Context

Issue #221: The current behavioral conflict detection checks for keyword presence in the entire conflict region without analyzing the conflict *structure*. This causes false escalations — e.g., a conflict where one side adds a `return` statement while the other side is untouched gets classified as behavioral and pauses for human review.

**Fix:** Replace keyword-only detection with a two-step analysis: (1) classify conflict structure, (2) apply keyword check only for both-sided modifications.

**File:** `skills/merge-prs/references/conflict-resolution.md`

---

### Task 1: Add structure-aware conflict classification logic

**Files:** `skills/merge-prs/references/conflict-resolution.md`

**Steps:**
1. Read the current file
2. Replace the "Detection heuristic — behavioral check" section with a two-step classification:
   - Step 1: Classify conflict structure (one-sided modification, adjacent additions, both-sided modification, context-only keywords)
   - Step 2: Apply keyword check only for both-sided modifications
3. Update the Behavioral Conflicts table to reference the new structure-aware logic
4. Add a new "Structure Classification" subsection between "Trivial Conflicts" and "Behavioral Conflicts" with the structure classification table from issue #221
5. Ensure the safety invariant is preserved: behavioral conflicts (true both-sided modifications with keywords) still ALWAYS pause for human review

**Acceptance Criteria:**
- [ ] A "Structure Classification" section exists between Trivial and Behavioral sections with a table documenting: one-sided modification, adjacent additions, both-sided modification, and context-only keywords
- [ ] The behavioral check code block uses a two-step algorithm: structure classification first, then keyword check only for both-sided modifications
- [ ] One-sided modifications (only one side has changes) are explicitly classified as trivial in the structure table
- [ ] Context-only keywords (outside conflict markers) are explicitly documented as ignored
- [ ] The existing behavioral safety invariant text ("Never auto-resolve. Always pause and present to the user") is preserved unchanged

**Quality Constraints:**
- Error handling: N/A (documentation-only change)
- Types: N/A
- Function length: N/A
- Pattern: follow existing markdown structure in `conflict-resolution.md` (table format, code blocks, section headings)
- Files modified: `skills/merge-prs/references/conflict-resolution.md` (design-first — 127 lines)
- Parallelizable: no

---

### Task 2: Add reclassified examples

**Files:** `skills/merge-prs/references/conflict-resolution.md`

**Steps:**
1. Add examples showing reclassified scenarios after the existing examples section:
   - Example: Additive-only conflict (was behavioral due to `return`/`if`, now trivial because both sides add new lines)
   - Example: Context-only keywords (was behavioral due to `if`/`return` in surrounding code, now trivial because keywords are outside markers)
   - Example: True both-sided modification (still behavioral — both sides modify the same `if` condition)
2. Each example must show: the conflict diff, old classification, new classification, and reasoning

**Acceptance Criteria:**
- [ ] An "Additive-only" reclassified example is present showing both sides adding new lines with keywords, classified as trivial
- [ ] A "Context-only keywords" reclassified example is present showing keywords outside conflict markers, classified as trivial
- [ ] A "True both-sided modification" example is present showing both sides modifying the same lines with keywords, classified as behavioral
- [ ] Each example includes Old/New classification annotations explaining the change

**Quality Constraints:**
- Pattern: follow existing example format in `conflict-resolution.md` (### Example N: title, code block, Classification/Resolution lines)
- Files modified: `skills/merge-prs/references/conflict-resolution.md`
- Parallelizable: no (shares file with Task 1)
