# Split Large Implementation Plans Implementation Plan

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: Add plan size constraint to Writing Plans Quality Context Injection — STATUS: done (commit 1fd5f7f)
Task 2: Update Subagent-Driven Development injection for multi-file plan reading — STATUS: done (commit a5e0743)
Task 3: Update verify-acceptance-criteria to handle split plan discovery — STATUS: done (commit 6a98768)
CURRENT: none
-->

> **For Claude:** After compaction, read only the PROGRESS INDEX to determine current task.
> Then read the full section for that specific task only.

**Goal:** Prevent Read token limit failures by adding a size constraint to the writing-plans quality context injection — plans exceeding ~15,000 words split into per-phase files with a lightweight index, and consumers (subagent-driven-development, verify-acceptance-criteria) are updated to read split plans correctly.

**Architecture:** All changes are to markdown skill instruction files within the feature-flow plugin. No code to compile or test at runtime. The "test" for each task is verifying the expected text is present in the file via grep. The `yolo-overrides.md` file receives two additions (Writing Plans injection + Subagent-Driven Development injection); `verify-acceptance-criteria/SKILL.md` receives split plan discovery logic in Steps 1 and 2.

**Tech Stack:** Markdown (skill instruction files)

---

### Task 1: Add plan size constraint to Writing Plans Quality Context Injection

**Files:**
- Modify: `skills/start/references/yolo-overrides.md` (design-first — >150 lines)

**Step 1: Read the current injection section**

Read `skills/start/references/yolo-overrides.md`. Locate the "Writing Plans Quality Context Injection" section (items 1–4 under "Prepend to the planning instructions"). Note the end of item 4 (the Progress Index example block and closing ```) — the new item 5 goes after it.

**Step 2: Output a change plan before editing**

Specify exactly:
- Where item 5 is inserted (after the closing ``` of the item 4 example, before the next `##` heading)
- What item 5 says (see the canonical text below)

Canonical text for item 5:

```
5. **Plan size constraint — split large plans into per-phase files.** After drafting all tasks but before saving the file, estimate the plan size by counting words (`wc -w` on the draft). If the word count exceeds **15,000 words** (proxy for ~20K tokens — the safe Read limit threshold), split the plan:

   **Split strategy:**
   - Create one lightweight **index file** at the standard path (`docs/plans/YYYY-MM-DD-feature-plan.md`). The index file contains: the plan title, the Progress Index HTML comment (with all tasks listed), the `> **For Claude:**` callout, and a `## Phase Manifest` section. Keep the index under 5,000 words.
   - Create one **phase file** per logical implementation phase (e.g., `docs/plans/YYYY-MM-DD-feature-plan-phase-1.md`, `docs/plans/YYYY-MM-DD-feature-plan-phase-2.md`). Each phase file contains the full task sections for that phase (files, steps, acceptance criteria, quality constraints).

   **Index file format:**

   ```markdown
   # [Feature Name] Implementation Plan

   <!-- PROGRESS INDEX (updated by implementation skills)
   Task 1: [name] — STATUS: pending — Phase: phase-1
   Task 2: [name] — STATUS: pending — Phase: phase-1
   Task 3: [name] — STATUS: pending — Phase: phase-2
   CURRENT: none
   -->

   > **For Claude:** This is a split plan. Read only this index for status tracking.
   > To implement a task, load the phase file listed in the PROGRESS INDEX for that task.

   ## Phase Manifest

   | Phase | File | Tasks |
   |-------|------|-------|
   | Phase 1: [Name] | `docs/plans/YYYY-MM-DD-feature-plan-phase-1.md` | Tasks 1–2 |
   | Phase 2: [Name] | `docs/plans/YYYY-MM-DD-feature-plan-phase-2.md` | Task 3 |
   ```

   **Progress Index addition for split plans:** Each task line in the PROGRESS INDEX includes `— Phase: phase-N` so consumers know which phase file to load for that task.

   **When not to split:** If the plan has only one natural phase (e.g., all tasks are in one layer — all backend, or all skill file edits), keep it as a single file even if it slightly exceeds 15,000 words, rather than creating an artificial split. Only split when phase boundaries are clear.
```

**Step 3: Edit `yolo-overrides.md` to add item 5**

Find the end of item 4's example block (the closing ` ``` ` line of the Progress Index example). Insert the item 5 text immediately after, before the `## Using Git Worktrees YOLO Override` heading.

**Step 4: Verify the edit**

Run these checks:
```bash
grep -n "15,000 words" skills/start/references/yolo-overrides.md
grep -n "Phase Manifest" skills/start/references/yolo-overrides.md
grep -n "This is a split plan" skills/start/references/yolo-overrides.md
grep -n "phase-1" skills/start/references/yolo-overrides.md
```
All four must return matches.

**Step 5: Commit**
```bash
git add skills/start/references/yolo-overrides.md
git commit -m "feat: add plan size constraint to writing-plans quality context injection (#155)"
```

**Acceptance Criteria:**
- [ ] `grep "15,000 words" skills/start/references/yolo-overrides.md` returns a match
- [ ] `grep "Phase Manifest" skills/start/references/yolo-overrides.md` returns a match
- [ ] `grep "This is a split plan" skills/start/references/yolo-overrides.md` returns a match
- [ ] `grep "phase-1" skills/start/references/yolo-overrides.md` returns a match
- [ ] Item 5 appears after item 4's closing ``` and before the `## Using Git Worktrees YOLO Override` heading (verify by reading file lines around the insertion point)

**Quality Constraints:**
- Error handling: N/A — markdown file edit, no runtime errors
- Files modified: `skills/start/references/yolo-overrides.md` (design-first — >150 lines)
- Design-first: output change plan in Step 2 before any Edit call on this file

---

### Task 2: Update Subagent-Driven Development injection for multi-file plan reading

**Files:**
- Modify: `skills/start/references/yolo-overrides.md` (design-first — already read in Task 1, re-read after Task 1's commit)

**Step 1: Re-read the file after Task 1's commit**

Read `skills/start/references/yolo-overrides.md` to confirm Task 1's change is present. Locate the "Subagent-Driven Development Context Injection" section. Find the paragraph that begins "When starting a task (before dispatching the implementer subagent)" — the new subsection goes at the end of this section, after the "Task transition batching" paragraph.

**Step 2: Output a change plan before editing**

Specify exactly where the new "Split Plan Reading" subsection is inserted and what it says.

Canonical text for the new subsection:

```
## Split Plan Reading (for split plans only)

When the plan file is a split plan (detected by the presence of `## Phase Manifest` in the index file), the orchestrator must load the correct phase file before extracting task text for each implementer dispatch:

1. **Detect split plan:** After reading the plan file, check if it contains `## Phase Manifest`. If yes, it is a split plan.
2. **Find the task's phase:** In the PROGRESS INDEX, find the task's line and extract the `Phase: phase-N` value.
3. **Load the phase file:** Read `docs/plans/YYYY-MM-DD-feature-plan-phase-N.md` (the full path is in the Phase Manifest table for this phase).
4. **Extract task text from the phase file:** Find the `### Task N:` section in the phase file and extract the full task text (files, steps, acceptance criteria, quality constraints). Provide this full text to the implementer subagent as usual — the implementer receives the same complete task text as in a single-file plan.
5. **Update Progress Index in the index file** (not the phase file): STATUS and CURRENT updates go in the index file's `<!-- PROGRESS INDEX` block, same as before.

Non-split plans: skip all steps above — the existing single-file reading behavior is unchanged.
```

**Step 3: Edit `yolo-overrides.md` to add the split plan reading subsection**

Insert the subsection text at the end of the "Subagent-Driven Development Context Injection" section, after the "Task transition batching" paragraph and before the next `##` heading.

**Step 4: Verify the edit**

```bash
grep -n "Split Plan Reading" skills/start/references/yolo-overrides.md
grep -n "Phase Manifest" skills/start/references/yolo-overrides.md | wc -l
```
First command must return a match. Second command must return `2` (one from Task 1's injection, one from Task 2's injection).

**Step 5: Commit**
```bash
git add skills/start/references/yolo-overrides.md
git commit -m "feat: update subagent-driven-dev injection to handle split plan files (#155)"
```

**Acceptance Criteria:**
- [ ] `grep "Split Plan Reading" skills/start/references/yolo-overrides.md` returns a match
- [ ] `grep "Phase Manifest" skills/start/references/yolo-overrides.md | wc -l` outputs `2`
- [ ] The subsection specifies loading the phase file before dispatching the implementer
- [ ] The subsection specifies that Progress Index updates go in the index file (not the phase file)
- [ ] Non-split plan behavior is explicitly noted as unchanged

**Quality Constraints:**
- Error handling: N/A — markdown file edit
- Files modified: `skills/start/references/yolo-overrides.md` (design-first — already read; re-read after Task 1 before editing)
- Design-first: output change plan in Step 2 before any Edit call

---

### Task 3: Update verify-acceptance-criteria to handle split plan discovery

**Files:**
- Modify: `skills/verify-acceptance-criteria/SKILL.md` (design-first — >100 lines)

**Step 1: Read the current skill file**

Read `skills/verify-acceptance-criteria/SKILL.md`. Focus on Step 1 (Find the Plan File) and Step 2 (Extract Acceptance Criteria). Note the structure of Step 1 — the new split plan detection goes after the plan file is found but before Step 2 begins.

**Step 2: Output a change plan before editing**

Plan two additions:

**Addition A — Split plan detection at end of Step 1:**

After the file is found (and confirmed with the user or auto-selected), add a detection step:

```
**Split plan detection:** After reading the plan file, check if it contains `## Phase Manifest`. If yes, it is a split plan:
1. Parse the Phase Manifest table to extract all phase file paths
2. Read each phase file
3. Treat the combined content of all phase files as the plan content for Step 2's criteria extraction

If `## Phase Manifest` is absent, proceed with the single plan file content as before (no change to existing behavior).
```

**Addition B — Multi-file note in Step 2 (Extract Acceptance Criteria):**

At the start of Step 2, add:

```
**Note for split plans:** If the plan was detected as a split plan in Step 1, extract acceptance criteria from all phase files (not just the index). Label each task's criteria with its source phase file for traceability (e.g., `Task 1 [phase-1]`).
```

**Step 3: Edit `verify-acceptance-criteria/SKILL.md`**

Apply both additions. Addition A goes at the end of Step 1, before the `### Step 2:` heading. Addition B goes as the first paragraph of Step 2.

**Step 4: Verify the edit**

```bash
grep -n "Phase Manifest" skills/verify-acceptance-criteria/SKILL.md
grep -n "split plan" skills/verify-acceptance-criteria/SKILL.md
grep -n "phase file" skills/verify-acceptance-criteria/SKILL.md
```
All three must return matches.

**Step 5: Commit**
```bash
git add skills/verify-acceptance-criteria/SKILL.md
git commit -m "feat: update verify-acceptance-criteria to handle split plan files (#155)"
```

**Acceptance Criteria:**
- [ ] `grep "Phase Manifest" skills/verify-acceptance-criteria/SKILL.md` returns a match
- [ ] `grep "split plan" skills/verify-acceptance-criteria/SKILL.md` returns a match
- [ ] `grep "phase file" skills/verify-acceptance-criteria/SKILL.md` returns a match
- [ ] Step 1 contains split plan detection after the plan file is found
- [ ] Step 2 contains a note about multi-file criteria extraction for split plans
- [ ] Single-file plan behavior is explicitly noted as unchanged (backward compatible)

**Quality Constraints:**
- Error handling: N/A — markdown file edit
- Files modified: `skills/verify-acceptance-criteria/SKILL.md` (design-first — >100 lines)
- Design-first: output change plan in Step 2 before any Edit call
