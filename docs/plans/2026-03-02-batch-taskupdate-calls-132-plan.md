# Batch TaskUpdate Calls — Implementation Plan

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: Add lifecycle step transition batching rule to Step 3 sub-step 5 — STATUS: pending
Task 2: Add implementation task transition batching rule to Subagent-Driven Development Context Injection — STATUS: pending
CURRENT: none
-->

> **For Claude:** After compaction, read only the PROGRESS INDEX to determine current task.
> Then read the full section for that specific task only.

**Goal:** Reduce parent orchestrator API call frequency by batching sequential `TaskUpdate` calls at task transitions into single parallel messages.

**Architecture:** Two targeted text additions to `skills/start/SKILL.md`. Change 1 modifies the Step 3 lifecycle loop sub-step 5 to add a batching rule for lifecycle step transitions. Change 2 adds a batching note to the Subagent-Driven Development Context Injection section for implementation task transitions. No code changes — skill instruction markdown only.

**Tech Stack:** Markdown (skill instruction files)

---

### Task 1: Add lifecycle step transition batching rule to Step 3 sub-step 5

**Files:**
- Modify: `skills/start/SKILL.md` (sub-step 5 of Step 3, ~line 499)

**Acceptance Criteria:**
- [ ] `skills/start/SKILL.md` sub-step 5 contains a "Batching optimization" note
- [ ] The note specifies that when the next step is `in_progress`-eligible, both `TaskUpdate` calls go into one parallel message
- [ ] The note lists or references the in_progress-eligible steps (study existing patterns, implementation, self-review, code review, generate CHANGELOG entry, final verification, documentation lookup)
- [ ] The existing sub-step 5 text is preserved verbatim before the new addition
- [ ] Verified with `grep -n "Batching optimization" skills/start/SKILL.md` returning a match at the correct location

**Quality Constraints:**
- Instruction style: bold label (`**Batching optimization:**`), inline code for tool calls, single-sentence rationale matching the YOLO Execution Continuity note style
- No new section headers — this is a sentence or two appended to sub-step 5
- Files modified: `skills/start/SKILL.md` (design-first — >150 lines; output change plan before editing)

**Step 1: Read the current sub-step 5 text to confirm exact string**

```bash
grep -n "Mark complete" skills/start/SKILL.md | head -5
```

Expected output: a line near 499 containing `5. **Mark complete:**`

Then read lines 498–502 to see the full sub-step 5 paragraph:

```bash
# Read SKILL.md offset 498 limit 5 to confirm exact text
```

**Step 2: Output change plan before editing**

The change plan: append one new sentence to the end of sub-step 5 (after "...the user must type "continue" to resume."). The sentence adds the batching rule. No other text is altered.

**Step 3: Apply the edit**

Target the unique string ending sub-step 5 and append the batching note:

```
old_string:
5. **Mark complete:** Update the todo item to `completed` — **always call `TaskUpdate` here.** This tool call is the bridge that keeps your turn alive between steps. If you output only text without a tool call, your turn ends and the user must type "continue" to resume.

new_string:
5. **Mark complete:** Update the todo item to `completed` — **always call `TaskUpdate` here.** This tool call is the bridge that keeps your turn alive between steps. If you output only text without a tool call, your turn ends and the user must type "continue" to resume. **Batching optimization:** When the next step (N+1) is in the `in_progress`-eligible list (study existing patterns, implementation, self-review, code review, generate CHANGELOG entry, final verification, documentation lookup), send both `TaskUpdate` calls as a single parallel message: `[TaskUpdate(N, completed), TaskUpdate(N+1, in_progress)]`. This saves one API round-trip per eligible step transition.
```

**Step 4: Verify the edit landed correctly**

```bash
grep -n "Batching optimization" skills/start/SKILL.md
```

Expected: one match near line 499.

Also verify the adjacent sub-step 6 text is still intact:

```bash
grep -n "Check for context checkpoint" skills/start/SKILL.md
```

Expected: one match at approximately the original line.

**Step 5: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat: add lifecycle step transition batching rule to Step 3 sub-step 5

Batch TaskUpdate(N, completed) + TaskUpdate(N+1, in_progress) into a
single parallel message when the next lifecycle step is in_progress-eligible.
Saves one API round-trip per eligible step transition (~10-20% of parent cost).

Related: #132"
```

---

### Task 2: Add implementation task transition batching rule to Subagent-Driven Development Context Injection

**Files:**
- Modify: `skills/start/SKILL.md` ("Subagent-Driven Development Context Injection" section, ~line 841–853)

**Acceptance Criteria:**
- [ ] The "Subagent-Driven Development Context Injection" section contains a "Task transition batching" note
- [ ] The note instructs: batch `[TaskUpdate(N, completed), TaskUpdate(N+1, in_progress)]` into one parallel message before dispatching the next implementer subagent
- [ ] The note appears after the "When completing a task" block (i.e., after the example edits section)
- [ ] All existing text in the section is preserved
- [ ] Verified with `grep -n "Task transition batching" skills/start/SKILL.md` returning a match

**Quality Constraints:**
- Instruction style: bold label (`**Task transition batching:**`), inline code for tool calls, matches the style of other notes in the Context Injection section
- No new section headers — this is a single bold-note paragraph after the example edits
- Files modified: `skills/start/SKILL.md` (design-first — >150 lines; output change plan before editing)

**Step 1: Read the current text after the "completing a task" example block**

```bash
grep -n "Example edits (completing Task 2" skills/start/SKILL.md
```

Expected: a line near 849. Then read lines 849–860 to confirm the text that will serve as the anchor for the insertion.

**Step 2: Output change plan before editing**

The change plan: after the "Example edits (completing Task 2 with commit abc1234)" block — specifically after the final `new_string: \`CURRENT: none\`` line — insert one new paragraph with the task transition batching note. No existing text is modified.

**Step 3: Apply the edit**

```
old_string:
Example edits (completing Task 2 with commit abc1234):
- old_string: `Task 2: [name] — STATUS: in-progress`
- new_string: `Task 2: [name] — STATUS: done (commit abc1234)`
- old_string: `CURRENT: Task 2`
- new_string: `CURRENT: none`

### Implementer Quality Context Injection

new_string:
Example edits (completing Task 2 with commit abc1234):
- old_string: `Task 2: [name] — STATUS: in-progress`
- new_string: `Task 2: [name] — STATUS: done (commit abc1234)`
- old_string: `CURRENT: Task 2`
- new_string: `CURRENT: none`

**Task transition batching:** When completing implementation task N and starting task N+1, batch both `TaskUpdate` calls into a single parallel message before dispatching the next implementer subagent: `[TaskUpdate(N, completed), TaskUpdate(N+1, in_progress)]`. This saves one API round-trip per task transition.

### Implementer Quality Context Injection
```

**Step 4: Verify the edit landed correctly**

```bash
grep -n "Task transition batching" skills/start/SKILL.md
```

Expected: one match between the "Subagent-Driven Development Context Injection" and "Implementer Quality Context Injection" sections.

Verify section boundaries are intact:

```bash
grep -n "### Implementer Quality Context Injection" skills/start/SKILL.md
```

Expected: one match at approximately the original line (now shifted by ~2 lines).

**Step 5: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat: add implementation task transition batching rule to context injection

Batch TaskUpdate(N, completed) + TaskUpdate(N+1, in_progress) into a
single parallel message when moving between implementation tasks in the
subagent-driven-development loop.

Related: #132"
```
