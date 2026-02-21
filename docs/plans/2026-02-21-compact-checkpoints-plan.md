# `/compact` Checkpoint Prompts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `/compact` checkpoint prompts at lifecycle breakpoints in `start-feature` SKILL.md, with a third YOLO mode option and `--yolo-compact` trigger phrase.

**Architecture:** All changes are text edits to a single markdown file (`skills/start-feature/SKILL.md`). Six insertion/modification points: trigger phrase detection, mode prompt options, a new "Context Window Checkpoints" section, checkpoint triggers in step execution, YOLO propagation string, and decision log format.

**Tech Stack:** Markdown (Claude Code plugin skill file)

**Design Doc:** `docs/plans/2026-02-21-compact-checkpoints.md`

**Issue:** #33

---

### Task 1: Add `--yolo-compact` trigger phrases to Step 0

Add the new trigger phrases for YOLO-with-compaction mode to the existing trigger phrase detection block in Step 0.

**Files:**
- Modify: `skills/start-feature/SKILL.md:83-92`

**Steps:**

1. In the trigger phrase list (line 83-86), add two new entries after `run unattended`:
   - `--yolo-compact` (flag style — match as a standalone token)
   - `yolo compact mode` (natural language phrase)

2. In the "If a trigger is found" block (lines 87-90), add a sub-case for compact triggers. After the existing bullet points, add:

```markdown
   - If the trigger is `--yolo-compact` or `yolo compact mode`:
     - Set YOLO mode active AND set `compact_prompts` flag for the remainder of the lifecycle
     - Announce: "YOLO mode active (with compaction prompts). Auto-selecting recommended options but pausing at phase transitions. Decision log will be printed at completion."
     - Strip the trigger phrase from the arguments before further processing
```

3. Commit:

```bash
git add skills/start-feature/SKILL.md
git commit -m "feat(compact): add --yolo-compact trigger phrases to Step 0 (#33)"
```

**Acceptance Criteria:**
- [ ] `skills/start-feature/SKILL.md` contains the string `--yolo-compact` in the trigger phrase list
- [ ] `skills/start-feature/SKILL.md` contains the string `yolo compact mode` in the trigger phrase list
- [ ] `skills/start-feature/SKILL.md` contains the string `compact_prompts` in the trigger detection block
- [ ] The trigger phrase list now has 5 entries (3 existing + 2 new)

---

### Task 2: Add "YOLO with compaction prompts" option to Step 1 mode prompt

Add the third YOLO mode option to all three ordering variants of the combined scope + mode prompt in Step 1.

**Files:**
- Modify: `skills/start-feature/SKILL.md:192-206`

**Steps:**

1. Update the *YOLO recommended* variant (lines 194-196) from 2 options to 3:

```markdown
*YOLO recommended* (quick fix, small enhancement, or feature with detailed context):
- Option 1: "YOLO — auto-select recommended options" with description: "*Recommended — [reasoning]*"
- Option 2: "YOLO with compaction prompts — auto-select all decisions, but pause at phase transitions for optional `/compact`"
- Option 3: "Interactive — all questions asked normally"
```

2. Update the *Interactive recommended* variant (lines 198-200) from 2 options to 3:

```markdown
*Interactive recommended* (feature/major without detailed context):
- Option 1: "Interactive — all questions asked normally" with description: "*Recommended — [reasoning]*"
- Option 2: "YOLO with compaction prompts — auto-select all decisions, but pause at phase transitions for optional `/compact`"
- Option 3: "YOLO — auto-select recommended options"
```

3. Update the *Neutral* variant (lines 202-204) from 2 options to 3:

```markdown
*Neutral* (major feature with detailed issue or detailed inline context):
- Option 1: "Interactive — all questions asked normally" (no recommendation marker)
- Option 2: "YOLO with compaction prompts — auto-select all decisions, but pause at phase transitions for optional `/compact`"
- Option 3: "YOLO — auto-select recommended options" (no recommendation marker)
```

4. After the YOLO behavior trigger phrase section (line 210), add handling for the compact mode selection:

```markdown
**YOLO with compaction behavior:** If the user selects "YOLO with compaction prompts", set both YOLO mode and `compact_prompts` flag active. All YOLO overrides apply, but context window checkpoints are shown instead of suppressed.
```

5. Commit:

```bash
git add skills/start-feature/SKILL.md
git commit -m "feat(compact): add YOLO with compaction prompts option to Step 1 (#33)"
```

**Acceptance Criteria:**
- [ ] The *YOLO recommended* variant contains exactly 3 options (Option 1, Option 2, Option 3)
- [ ] The *Interactive recommended* variant contains exactly 3 options
- [ ] The *Neutral* variant contains exactly 3 options
- [ ] All three variants include the string `YOLO with compaction prompts`
- [ ] All three variants include the string `pause at phase transitions`
- [ ] The text `YOLO with compaction behavior:` appears after the YOLO trigger phrase behavior section

---

### Task 3: Add "Context Window Checkpoints" section

Add the new section defining checkpoint format, suppression rules, scope filtering, and insertion points. Place it after the "Graduated YOLO Behavior" section (after line 429).

**Files:**
- Modify: `skills/start-feature/SKILL.md` (insert after line 429)

**Steps:**

1. Insert the following new section after the "Graduated YOLO Behavior" section (line 429) and before the "Writing Plans YOLO Override" section (line 431):

```markdown
### Context Window Checkpoints

At specific phase transitions, output a checkpoint prompt suggesting the user run `/compact` to free context window space. The lifecycle pauses — the user must respond before the next step begins. `/compact` is a client-side Claude Code command that cannot be invoked programmatically — the skill can only suggest it.

**Checkpoint format:**

\```
--- Context Checkpoint ---
[Phase name] complete. Consider running:
/compact focus on [context-specific focus hint]
Or type "continue" to skip compaction and proceed.
\```

**Checkpoint locations:**

| # | After Step | Before Step | Focus Hint |
|---|-----------|-------------|------------|
| 1 | Documentation lookup | Design Document | `focus on brainstorming decisions and documentation patterns` |
| 2 | Design Verification (or Design Document for small enhancements which skip verification) | Create Issue + Implementation Plan | `focus on the approved design and implementation plan` |
| 3 | Commit Planning Artifacts | Worktree Setup + Implementation | `focus on the implementation plan and acceptance criteria` |

**Scope-based filtering:**

| Scope | Checkpoints shown |
|-------|------------------|
| Quick fix | None (too few steps) |
| Small enhancement | 2 and 3 only |
| Feature | All 3 |
| Major feature | All 3 |

**Suppression rules:**
- **YOLO mode (no compaction):** Checkpoints are suppressed — do not output the checkpoint block
- **YOLO with compaction prompts:** Checkpoints are shown — output the checkpoint block and wait
- **Interactive mode:** Checkpoints are shown — output the checkpoint block and wait
- **Quick fix scope:** No checkpoints regardless of mode

**Handling the response:**
When the user responds after a checkpoint:
- If the user types "continue", "skip", "next", or "proceed" → resume the lifecycle at the next step
- If the user ran `/compact` and then sends any message → the context has been compressed. Check the todo list to determine the current step and announce: "Resuming lifecycle. Last completed step: [N]. Next: [N+1] — [name]."
- Any other response → treat as "continue" and resume
```

2. Commit:

```bash
git add skills/start-feature/SKILL.md
git commit -m "feat(compact): add Context Window Checkpoints section (#33)"
```

**Acceptance Criteria:**
- [ ] `skills/start-feature/SKILL.md` contains the heading `### Context Window Checkpoints`
- [ ] The section appears between `### Graduated YOLO Behavior` and `### Writing Plans YOLO Override`
- [ ] The checkpoint format block contains `--- Context Checkpoint ---`
- [ ] The checkpoint locations table has exactly 3 rows (checkpoints 1, 2, 3)
- [ ] The scope-based filtering table lists all 4 scopes (Quick fix, Small enhancement, Feature, Major feature)
- [ ] The suppression rules list includes all 3 modes plus Quick fix scope rule
- [ ] The section contains the string `Resuming lifecycle. Last completed step:`

---

### Task 4: Add checkpoint triggers to Step 3 execution flow

Modify the Step 3 execution pattern to include checkpoint trigger points after specific steps complete.

**Files:**
- Modify: `skills/start-feature/SKILL.md:302-322`

**Steps:**

1. After the existing step 6 in the execution pattern (line 311: `6. **Announce next step:**...`), add a step 6.5:

```markdown
   **6a. Check for context checkpoint:** If the just-completed step is a checkpoint trigger (see Context Window Checkpoints section), and the current mode is not YOLO-without-compaction, and the current scope includes this checkpoint — output the checkpoint block and wait for the user to respond before announcing the next step.
```

2. After the YOLO Propagation block (line 318-320), add:

```markdown
**YOLO with compaction propagation:** When "YOLO with compaction prompts" mode is active, prepend `yolo: true. compact_prompts: true. scope: [scope].` to the `args` parameter of every `Skill` invocation. Skills receive the `compact_prompts` flag but do not act on it — checkpoints are centralized in the orchestrator between skill invocations.
```

3. Commit:

```bash
git add skills/start-feature/SKILL.md
git commit -m "feat(compact): add checkpoint triggers to Step 3 execution (#33)"
```

**Acceptance Criteria:**
- [ ] `skills/start-feature/SKILL.md` contains the string `Check for context checkpoint` in the Step 3 execution pattern
- [ ] `skills/start-feature/SKILL.md` contains the string `compact_prompts: true. scope:` in the YOLO propagation section
- [ ] The checkpoint trigger references the "Context Window Checkpoints section"

---

### Task 5: Add "YOLO with compaction prompts" decision log variant

Add the third decision log format to the Step 5 Completion section.

**Files:**
- Modify: `skills/start-feature/SKILL.md:955-999`

**Steps:**

1. After the "Graduated YOLO" decision log block (line 999) and before the "Cancellation:" paragraph (line 1001), insert a third variant:

```markdown
**YOLO with compaction prompts (any scope):**

\```
## YOLO Decision Log

**Mode:** YOLO with compaction prompts ([scope] scope)
**Compaction checkpoints:** N shown, M compacted, K skipped

| # | Skill | Decision | Auto-Selected |
|---|-------|----------|---------------|
| 1 | start-feature | Scope + mode | [scope], YOLO with compaction |
| ... | ... | ... | ... |
| N | start-feature | Compact checkpoint 1 | /compact (or skipped) |
| N | start-feature | Compact checkpoint 2 | /compact (or skipped) |
| N | start-feature | Compact checkpoint 3 | /compact (or skipped) |
| N | design-document | Document approval | ✋ User reviewed (if Feature/Major scope) |
| N | brainstorming | Design questions (self-answered) | [count decisions auto-answered] |
| N | writing-plans | Execution choice | Subagent-Driven (auto-selected) |
| N | using-git-worktrees | Worktree directory | .worktrees/ (auto-selected) |
| N | finishing-a-dev-branch | Completion strategy | Push and create PR (auto-selected) |

**Total decisions auto-selected:** N (includes feature-flow decisions + superpowers overrides)
**Compaction checkpoints:** M of N shown (K skipped by scope filter)
**Quality gates preserved:** hooks, tests, verification, code review
\```
```

2. Commit:

```bash
git add skills/start-feature/SKILL.md
git commit -m "feat(compact): add YOLO with compaction decision log variant (#33)"
```

**Acceptance Criteria:**
- [ ] `skills/start-feature/SKILL.md` contains the string `YOLO with compaction prompts (any scope):`
- [ ] The decision log contains `Compact checkpoint 1`, `Compact checkpoint 2`, and `Compact checkpoint 3`
- [ ] The decision log contains `Compaction checkpoints:` summary line
- [ ] The new variant appears between the "Graduated YOLO" variant and the "Cancellation:" paragraph

---

### Task 6: Final review and commit

Review all changes for internal consistency, verify line references haven't drifted, and ensure the SKILL.md is well-formed.

**Files:**
- Review: `skills/start-feature/SKILL.md`

**Steps:**

1. Read the full SKILL.md and verify:
   - All 5 trigger phrases are listed together in Step 0
   - All 3 mode options appear in all 3 ordering variants
   - The Context Window Checkpoints section is correctly placed
   - The checkpoint triggers reference the correct section
   - The decision log has 3 variants (Full YOLO, Graduated YOLO, YOLO with compaction)
   - The YOLO propagation section documents both string formats
   - No orphaned references or broken cross-references

2. If any issues found, fix them.

3. Final commit (if fixes needed):

```bash
git add skills/start-feature/SKILL.md
git commit -m "fix(compact): address review findings in compact checkpoints (#33)"
```

**Acceptance Criteria:**
- [ ] `skills/start-feature/SKILL.md` contains exactly 5 trigger phrases in the Step 0 list (`--yolo`, `yolo mode`, `run unattended`, `--yolo-compact`, `yolo compact mode`)
- [ ] The string `YOLO with compaction prompts` appears at least 6 times in the file (3 ordering variants + section title + decision log + propagation)
- [ ] The string `--- Context Checkpoint ---` appears in the file
- [ ] The string `compact_prompts` appears at least 4 times in the file (trigger detection, mode selection, propagation, suppression rules)
- [ ] The heading `### Context Window Checkpoints` exists between `### Graduated YOLO Behavior` and `### Writing Plans YOLO Override`
