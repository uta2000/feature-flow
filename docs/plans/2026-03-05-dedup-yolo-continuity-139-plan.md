# Deduplicate YOLO Execution Continuity Instructions — Implementation Plan

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: Define Turn Bridge Rule in Step 3 — STATUS: done (commit 387d2cf)
Task 2: Replace inline repetitions with one-line references — STATUS: done (commit ddbf183)
CURRENT: none
-->

> **For Claude:** After compaction, read only the PROGRESS INDEX to determine current task.
> Then read the full section for that specific task only.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deduplicate the YOLO execution continuity pattern (repeated 5 times) into a single named "Turn Bridge Rule" defined once in Step 3, with all inline occurrences replaced by one-line references.

**Architecture:** Single-file refactor of `skills/start/SKILL.md`. The full explanation lives in Step 3's execute loop (after the YOLO Execution Continuity paragraph). Each inline step that previously restated the rule gets a short `*(Turn Bridge Rule applies)*` reference instead.

**Tech Stack:** Markdown (skill definition file)

**Related:** Issue #139

---

### Task 1: Define Turn Bridge Rule in Step 3

**Files:**
- Modify: `skills/start/SKILL.md` (lines 603-604 area — after YOLO Execution Continuity paragraph)

**Step 1: Add the named Turn Bridge Rule definition**

Insert a new named rule block immediately after the existing "YOLO Execution Continuity (CRITICAL)" paragraph (line 603). The new block consolidates the full explanation into a single, prominent definition:

```markdown
**Turn Bridge Rule:** After outputting results for any inline step, **immediately call `TaskUpdate` to mark that step complete in the same response** — do not end your turn with only text output. A text-only response ends your turn and forces the user to type "continue" to resume, which breaks YOLO continuity. The `TaskUpdate` tool call is the bridge that keeps your turn alive between lifecycle steps.
```

This goes right after the YOLO Execution Continuity paragraph (which explains the *problem*) — the Turn Bridge Rule names the *solution*.

**Step 2: Verify the rule is defined exactly once**

Run: `grep -c "Turn Bridge Rule" skills/start/SKILL.md`
Expected: `1` (just the definition — references added in Task 2)

**Step 3: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "refactor: define Turn Bridge Rule in Step 3 YOLO Execution Continuity section"
```

**Acceptance Criteria:**
- [ ] A `**Turn Bridge Rule:**` definition exists in the Step 3 execute loop section
- [ ] The definition contains the full explanation of why TaskUpdate must be called immediately after output
- [ ] The definition is placed after the YOLO Execution Continuity paragraph
- [ ] The definition appears exactly once in the file

**Quality Constraints:**
- Pattern reference: follow existing bold-label rule style used elsewhere in SKILL.md (e.g., `**YOLO Propagation:**`, `**Batching optimization:**`)
- Files modified: `skills/start/SKILL.md` (design-first — 1906 lines)
- Design-first files: `skills/start/SKILL.md` — implementer must output change plan before editing

---

### Task 2: Replace inline repetitions with one-line references

**Files:**
- Modify: `skills/start/SKILL.md` (lines ~598, ~732, ~1238, ~1529, ~1656)

**Step 1: Replace sub-step 4 inline explanation (line ~598)**

Current text (sub-step 4 of the execute loop):
```
4. **Confirm completion:** Verify the step produced its expected output — **do not output standalone confirmation text.** Any notes about the step's output must be included alongside the `TaskUpdate` call in step 5, not as a separate text-only response. A text-only response here ends your turn and breaks YOLO continuity.
```

Replace with:
```
4. **Confirm completion:** Verify the step produced its expected output. *(Turn Bridge Rule — include any confirmation notes alongside the `TaskUpdate` call in step 5, not as a separate text-only response.)*
```

**Step 2: Replace brainstorming YOLO item 7 (line ~732)**

Current text:
```
7. **After outputting the brainstorming results, immediately call `TaskUpdate` to mark brainstorming complete** — do NOT end your turn with only text output. The tool call keeps your turn alive so you can proceed to the next lifecycle step.
```

Replace with:
```
7. **After outputting the brainstorming results, immediately call `TaskUpdate` to mark brainstorming complete.** *(Turn Bridge Rule applies.)*
```

**Step 3: Replace self-review YOLO continuity line (line ~1238)**

Current text:
```
**YOLO continuity:** After outputting self-review results, immediately call `TaskUpdate` to mark this step complete — do not end your turn with only text output.
```

Replace with:
```
*(Turn Bridge Rule applies — call `TaskUpdate` immediately after outputting self-review results.)*
```

**Step 4: Replace code review YOLO continuity line (line ~1529)**

Current text:
```
**YOLO continuity:** After outputting the code review report, immediately call `TaskUpdate` to mark this step complete — do not end your turn with only text output.
```

Replace with:
```
*(Turn Bridge Rule applies — call `TaskUpdate` immediately after outputting the code review report.)*
```

**Step 5: Replace CHANGELOG YOLO continuity line (line ~1656)**

Current text:
```
**YOLO continuity:** After outputting CHANGELOG results, immediately call `TaskUpdate` to mark this step complete — do not end your turn with only text output.
```

Replace with:
```
*(Turn Bridge Rule applies — call `TaskUpdate` immediately after outputting CHANGELOG results.)*
```

**Step 6: Verify all references and line count reduction**

Run: `grep -c "Turn Bridge Rule" skills/start/SKILL.md`
Expected: `6` (1 definition + 5 references)

Run: `wc -l skills/start/SKILL.md`
Expected: at least 30 lines fewer than the original 1906 lines (target: ≤1876)

**Step 7: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "refactor: replace 5 inline YOLO continuity explanations with Turn Bridge Rule references

Closes #139"
```

**Acceptance Criteria:**
- [ ] Sub-step 4 of the execute loop references Turn Bridge Rule instead of restating the full explanation
- [ ] Brainstorming YOLO item 7 references Turn Bridge Rule instead of restating the full explanation
- [ ] Self-review YOLO continuity line references Turn Bridge Rule by name
- [ ] Code review YOLO continuity line references Turn Bridge Rule by name
- [ ] CHANGELOG YOLO continuity line references Turn Bridge Rule by name
- [ ] `grep -c "Turn Bridge Rule" skills/start/SKILL.md` returns exactly 6
- [ ] `wc -l skills/start/SKILL.md` shows at least 30 fewer lines than 1906
- [ ] No other occurrences of "do not end your turn with only text output" remain in the file

**Quality Constraints:**
- Error handling: N/A (markdown refactor)
- Types: N/A
- Function length: N/A
- Pattern: follow existing inline reference style — italicized parenthetical `*(Rule applies)*`
- Files modified: `skills/start/SKILL.md` (design-first — 1906 lines)
- Design-first files: `skills/start/SKILL.md` — implementer must output change plan before editing
