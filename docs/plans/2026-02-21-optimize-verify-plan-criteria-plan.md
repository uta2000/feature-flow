# Optimize verify-plan-criteria Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce user round-trips in verify-plan-criteria by making plan path confirmation conditional, adding a fast-path when all criteria exist, and batching criteria approval into a single prompt.

**Architecture:** Three targeted edits to the skill's markdown instructions. No structural changes — same 6-step flow, same tools, same YOLO detection.

**Tech Stack:** Markdown (skill instructions)

**Design Doc:** `docs/plans/2026-02-21-optimize-verify-plan-criteria.md`
**Issue:** #43

---

### Task 1: Make plan path confirmation conditional (Step 1)

**Acceptance Criteria:**
- [ ] Line 35 of `skills/verify-plan-criteria/SKILL.md` no longer contains "Confirm with the user"
- [ ] The file contains logic for three cases: user-specified path (use directly), single Glob result (use directly), multiple Glob results (confirm with user)
- [ ] The file contains an announce instruction: `"Checking plan: [path]"`
- [ ] The "If the user specified a path, use it" instruction on line 24 is preserved

**Files:**
- Modify: `skills/verify-plan-criteria/SKILL.md:21-35`

**Step 1: Replace the path confirmation logic**

Replace lines 24-35 (the current Step 1 body) with conditional logic:

From:
```markdown
Look for the plan file:
1. If the user specified a path, use it
2. Otherwise, find the most recently modified `.md` file in the plans directory:

```
Glob: docs/plans/*.md
```

If no `docs/plans/` directory exists, check for plan files in common locations:
- `plans/*.md`
- `docs/*.md` (look for files with "plan" or "implementation" in the name)

Pick the most recent file. Confirm with the user: "Checking plan: `[path]`. Is this correct?"
```

To:
```markdown
Look for the plan file:
1. If the user specified a path, use it directly
2. Otherwise, find the most recently modified `.md` file in the plans directory:

```
Glob: docs/plans/*.md
```

If no `docs/plans/` directory exists, check for plan files in common locations:
- `plans/*.md`
- `docs/*.md` (look for files with "plan" or "implementation" in the name)

**Path selection:**
- If 1 candidate found → use it directly without confirmation
- If multiple candidates found → pick the most recent and confirm with the user: "Found multiple plan files. Checking plan: `[path]`. Is this correct?"

Announce the selected path: "Checking plan: `[path]`"
```

**Step 2: Verify the edit**

Read `skills/verify-plan-criteria/SKILL.md` and confirm:
- Line 24 says "use it directly"
- The "Path selection:" block exists with the two conditional branches
- The announce instruction is present
- The fallback locations (plans/*.md, docs/*.md) are preserved

**Step 3: Commit**

```bash
git add skills/verify-plan-criteria/SKILL.md
git commit -m "perf: make plan path confirmation conditional in verify-plan-criteria

Only ask for confirmation when multiple candidate plan files exist.
When a single candidate is found or the user specified a path, use it
directly. Reduces one unnecessary round-trip in the common case.

Closes part of #43"
```

---

### Task 2: Add fast-path gate after Step 3

**Acceptance Criteria:**
- [ ] `skills/verify-plan-criteria/SKILL.md` contains text "skip directly to Step 6" between Step 3 and Step 4
- [ ] The fast-path condition checks both "all tasks have criteria" AND "none are flagged as vague"
- [ ] Step 3's existing "Has criteria" and "Missing criteria" sections are preserved
- [ ] Step 4 heading and content are unchanged

**Files:**
- Modify: `skills/verify-plan-criteria/SKILL.md:49-61`

**Step 1: Add the fast-path gate**

Insert the following block after line 59 (`- Proceed to Step 4 to draft criteria.`) and before line 61 (`### Step 4: Draft Missing Criteria`):

```markdown

**Fast-path:** If ALL tasks already have criteria and none are flagged as vague, skip directly to Step 6 (Report). Do not execute Steps 4 or 5.
```

**Step 2: Verify the edit**

Read `skills/verify-plan-criteria/SKILL.md` and confirm:
- The fast-path block appears between Step 3's content and Step 4's heading
- Step 3's "Has criteria" and "Missing criteria" sections are intact
- Step 4's heading `### Step 4: Draft Missing Criteria` follows the new block

**Step 3: Commit**

```bash
git add skills/verify-plan-criteria/SKILL.md
git commit -m "perf: add explicit fast-path when all tasks have criteria

When all tasks already have acceptance criteria and none are vague,
skip directly to the report step. Prevents wasted turns on cheaper
models that don't naturally short-circuit.

Closes part of #43"
```

---

### Task 3: Batch criteria approval into single prompt (Step 4)

**Acceptance Criteria:**
- [ ] `skills/verify-plan-criteria/SKILL.md` Step 4 no longer contains per-task `AskUserQuestion` instructions
- [ ] Step 4 contains a batched presentation format showing all tasks with missing criteria in one message
- [ ] Step 4 contains a single `AskUserQuestion` with options: "Accept all as-is", "Let me edit them", "Skip drafting"
- [ ] The YOLO behavior block references the batched prompt (not per-task approval)
- [ ] The criteria drafting logic (lines 65-82: "From the Files section", "From the Steps section", etc.) is preserved unchanged

**Files:**
- Modify: `skills/verify-plan-criteria/SKILL.md:84-100`

**Step 1: Replace the per-task approval with batched approval**

Replace the section from `**Present drafted criteria to the user:**` (line 84) through the YOLO behavior block (line 100) with:

From:
```markdown
**Present drafted criteria to the user:**

```
Task 3: "Add allergen badge to menu items" is missing acceptance criteria.

Suggested criteria (based on task context):
- [ ] `src/components/AllergenBadge.tsx` exists
- [ ] Component exports `AllergenBadge` as default or named export
- [ ] `npm run typecheck` passes with no new errors
- [ ] `npm run lint` passes with no new warnings

Accept these criteria, or would you like to edit them?
```

Use `AskUserQuestion` to get approval. Options: "Accept as-is", "Let me edit them", "Skip this task".

**YOLO behavior:** If `yolo: true` is in the skill's `ARGUMENTS`, skip this question. Auto-select "Accept as-is" for all tasks with drafted criteria and announce: `YOLO: verify-plan-criteria — Approve criteria → Accept as-is ([N] tasks)`
```

To:
```markdown
**Present all drafted criteria in a single message:**

After drafting criteria for all tasks with missing criteria, present them together:

```
The following tasks are missing acceptance criteria. Here are the suggested criteria:

**Task N: "[title]"**
- [ ] [criterion 1]
- [ ] [criterion 2]

**Task M: "[title]"**
- [ ] [criterion 1]
- [ ] [criterion 2]

Accept all, edit, or skip?
```

Use a single `AskUserQuestion` to get approval for all tasks at once. Options: "Accept all as-is", "Let me edit them", "Skip drafting".

- **"Accept all as-is"** → Apply all drafted criteria (proceed to Step 5)
- **"Let me edit them"** → User provides corrections in freeform text, criteria are revised, then applied
- **"Skip drafting"** → Skip Steps 4 and 5, proceed to Step 6 with missing criteria noted in the report

**YOLO behavior:** If `yolo: true` is in the skill's `ARGUMENTS`, skip this question. Auto-select "Accept all as-is" and announce: `YOLO: verify-plan-criteria — Approve criteria → Accept as-is ([N] tasks)`
```

**Step 2: Verify the edit**

Read `skills/verify-plan-criteria/SKILL.md` and confirm:
- The per-task example (`Task 3: "Add allergen badge..."`) is gone
- The batched format shows multiple tasks in one message
- A single `AskUserQuestion` with three options exists
- The three option descriptions are present ("Accept all as-is", "Let me edit them", "Skip drafting")
- The YOLO behavior block is updated and references the batched prompt
- The criteria drafting logic above (lines 65-82) is unchanged

**Step 3: Commit**

```bash
git add skills/verify-plan-criteria/SKILL.md
git commit -m "perf: batch criteria approval into single prompt

Replace per-task AskUserQuestion calls with a single batched prompt
showing all tasks with missing criteria at once. Reduces N round-trips
to 1. Updated YOLO override to match the new batched flow.

Closes #43"
```
