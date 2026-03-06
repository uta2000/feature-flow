# Extract Post-Compaction Recovery Logic Implementation Plan

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: Create references/context-checkpoints.md — STATUS: done (commit 7b53c22)
Task 2: Replace recovery logic in SKILL.md with pointer — STATUS: done (commit 04c0eb3)
Task 3: Verify line reduction and correctness — STATUS: done (inline verification)
CURRENT: none
-->

> **For Claude:** After compaction, read only the PROGRESS INDEX to determine current task.
> Then read the full section for that specific task only.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract post-compaction recovery logic from SKILL.md to a reference file, reducing SKILL.md size while preserving recovery behavior.

**Architecture:** Move the "Handling the response" subsection (lines 773-782 of SKILL.md) — which contains the 4 CURRENT field edge cases — into a new `references/context-checkpoints.md` file. Replace with a 2-line pointer in SKILL.md. The checkpoint locations table, format, scope-based filtering, and suppression rules stay in SKILL.md.

**Tech Stack:** Markdown files (no code, no tests)

---

### Task 1: Create references/context-checkpoints.md

**Files:**
- Create: `references/context-checkpoints.md`

**Step 1: Create the reference file with extracted content**

Create `references/context-checkpoints.md` with the full "Handling the response" section currently at SKILL.md lines 773-782. The file should be self-contained — a reader arriving after `/compact` should understand the recovery procedure without needing SKILL.md context.

```markdown
# Context Checkpoint Recovery

This reference file contains the post-compaction recovery procedure. It is referenced by the Context Window Checkpoints section in `skills/start/SKILL.md`.

## Handling the Response

When the user responds after a checkpoint:
- If the user types "continue", "skip", "next", or "proceed" → resume the lifecycle at the next step
- If the user ran `/compact` and then sends any message → the context has been compressed. Check the todo list (via `TaskList` if available, or from the last printed checklist) to determine the current lifecycle step.
  - **If the current lifecycle step is "Implement":** Read only lines 1-30 of the implementation plan file (saved to `docs/plans/` by `superpowers:writing-plans`, the PROGRESS INDEX block) to determine which task is current. Parse the `CURRENT: Task N` field. Then read only the full Task N section from the implementation plan file for implementation details. Announce: "Resuming implementation. Reading progress index... CURRENT: Task [N]. Loading Task [N] details."
    - **If `CURRENT: none` in the index (between tasks):** Start from the first task with STATUS: `pending`. Announce: "Resuming implementation. CURRENT: none — starting from first pending task." If no pending tasks remain, announce: "Resuming implementation. CURRENT: none — all tasks appear complete. Verify with the user before proceeding."
    - **If no PROGRESS INDEX found in lines 1-30:** Fall back to reading the full implementation plan file to determine which task to resume. Announce: "Resuming implementation. No progress index found — reading full plan to determine current task."
    - **If `CURRENT: Task N` but Task N is not found in the plan body:** Fall back to reading the full implementation plan file. Announce: "Resuming implementation. Task [N] not found in plan — reading full plan to determine current task."
  - **Otherwise (any other lifecycle step):** Announce: "Resuming lifecycle. Last completed step: [N]. Next: [N+1] — [name]."
- Any other response → treat as "continue" and resume
```

**Step 2: Commit**

```bash
git add references/context-checkpoints.md
git commit -m "docs: create context-checkpoints reference file with recovery logic"
```

**Acceptance Criteria:**
- [ ] `references/context-checkpoints.md` exists
- [ ] File contains all 4 CURRENT field edge cases: `CURRENT: Task N` found, `CURRENT: none`, no PROGRESS INDEX, `CURRENT: Task N` but task not found
- [ ] File contains the "continue/skip/next/proceed" handling
- [ ] File contains the "Otherwise (any other lifecycle step)" fallback
- [ ] File is self-contained with a title and context sentence explaining its relationship to SKILL.md

**Quality Constraints:**
- Pattern reference: follow existing reference files in `references/` (e.g., `tool-api.md`, `coding-standards.md`) for heading style and tone
- No code — pure markdown documentation

---

### Task 2: Replace recovery logic in SKILL.md with pointer

**Files:**
- Modify: `skills/start/SKILL.md:773-782`

**Step 1: Read the file to confirm exact content**

Read `skills/start/SKILL.md` lines 770-785 to confirm the exact boundaries of the content to replace.

**Step 2: Replace the "Handling the response" block with a pointer**

Replace lines 773-782 (the full "Handling the response" subsection) with a compact pointer:

```markdown
**Handling the response:**
When the user responds after a checkpoint, follow the recovery procedure in `../../references/context-checkpoints.md`.
```

This replaces ~10 lines of detailed edge-case logic with 2 lines.

**Step 3: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "refactor: replace post-compaction recovery logic with reference pointer"
```

**Acceptance Criteria:**
- [ ] SKILL.md no longer contains the 4 CURRENT field edge cases inline
- [ ] SKILL.md contains a pointer to `../../references/context-checkpoints.md` in the "Handling the response" subsection
- [ ] The checkpoint locations table (lines 749-756) is still present in SKILL.md
- [ ] The checkpoint format block (lines 740-747) is still present in SKILL.md
- [ ] The scope-based filtering table (lines 758-765) is still present in SKILL.md
- [ ] The suppression rules (lines 767-771) are still present in SKILL.md

**Quality Constraints:**
- The pointer path must be correct relative to `skills/start/SKILL.md` → `../../references/context-checkpoints.md`
- Files modified: `skills/start/SKILL.md` (design-first — 1906 lines)
- Design-first files: `skills/start/SKILL.md` — implementer must output change plan before editing

---

### Task 3: Verify line reduction and correctness

**Files:**
- Read: `skills/start/SKILL.md`
- Read: `references/context-checkpoints.md`

**Step 1: Count SKILL.md lines and verify reduction**

```bash
wc -l skills/start/SKILL.md
```

Expected: at least 15 fewer lines than the original 1906 (i.e., ≤ 1891 lines).

**Step 2: Verify pointer resolves correctly**

```bash
# From the skill file's perspective, verify the reference file exists at the relative path
test -f references/context-checkpoints.md && echo "Reference file exists" || echo "MISSING"
```

**Step 3: Verify all 4 edge cases are in the reference file**

```bash
grep -c "CURRENT:" references/context-checkpoints.md
```

Expected: at least 4 occurrences (the 4 edge cases).

**Step 4: Verify SKILL.md retains checkpoint tables**

```bash
grep -c "Checkpoint locations\|Scope-based filtering\|Suppression rules\|Checkpoint format" skills/start/SKILL.md
```

Expected: at least 3 matches (locations, filtering, suppression — format is in the block above).

**Acceptance Criteria:**
- [ ] `wc -l skills/start/SKILL.md` shows at least 15 fewer lines than 1906
- [ ] `references/context-checkpoints.md` contains all 4 CURRENT field edge cases
- [ ] SKILL.md still contains the checkpoint locations table, scope-based filtering table, and suppression rules
- [ ] The relative path `../../references/context-checkpoints.md` from `skills/start/SKILL.md` resolves to the correct file
